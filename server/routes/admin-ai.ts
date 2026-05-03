import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/rbac';
import { ZENITH_ROLES } from '@shared/schema';
import { pool } from '../db';
import {
  AI_PROVIDERS,
  AI_FEATURES,
  DEFAULT_FEATURE_ASSIGNMENTS,
  type AIProvider,
  type AIFeature,
} from '@shared/ai-schema';
import { getProviderStatus, invalidateConfigCache } from '../services/ai-provider';
import { getAIUsageSummary, getMonthlyTokenBurn } from '../services/ai-usage';
import { storage } from '../storage';
import { extractTextFromBuffer, mimeToFileType } from '../services/ai-document-extraction';
import { assembleGroundingContext } from '../services/ai-grounding';
import { logAuditEvent, logAccessDenied, AUDIT_ACTIONS } from '../services/audit-logger';
import { auditDiff } from '../services/audit-diff';

async function assertOrgScope(req: AuthenticatedRequest, orgId: string, reason: string): Promise<boolean> {
  if (req.user?.role === ZENITH_ROLES.PLATFORM_OWNER) return true;
  const callerOrg = req.activeOrganizationId || req.user?.organizationId || null;
  if (callerOrg && callerOrg === orgId) return true;
  await logAccessDenied(req, 'organization', orgId, reason, { callerOrg });
  return false;
}

const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatConfig(cfg: Record<string, unknown>) {
  return {
    id: cfg.id,
    defaultProvider: cfg.default_provider,
    monthlyTokenBudget: cfg.monthly_token_budget ?? null,
    alertThresholdPercent: cfg.alert_threshold_percent,
    alertEmail: cfg.alert_email ?? null,
    updatedAt: cfg.updated_at,
  };
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const SYSTEM_DOC_LIMIT = 10;
const ORG_DOC_LIMIT = 20;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'text/x-markdown',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Allowed: PDF, DOCX, TXT, Markdown'));
    }
  },
});

// Wraps upload.single so that multer errors (e.g. LIMIT_FILE_SIZE) are
// returned as JSON responses instead of crashing the request.
function handleUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: any) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File too large. Maximum allowed size is ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
      });
    }
    return res.status(400).json({ error: err.message || 'File upload error' });
  });
}

// ── AI Provider Configuration (platform_owner) ───────────────────────────────

router.get(
  '/api/admin/ai/configuration',
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          `SELECT * FROM ai_configuration WHERE singleton_key = 'default' LIMIT 1`
        );
        if (rows.length === 0) {
          return res.json({
            defaultProvider: AI_PROVIDERS.AZURE_FOUNDRY,
            monthlyTokenBudget: null,
            alertThresholdPercent: 80,
            alertEmail: null,
          });
        }
        res.json(formatConfig(rows[0]));
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ error: error.message });
    }
  }
);

router.post(
  '/api/admin/ai/configuration',
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { defaultProvider, monthlyTokenBudget, alertThresholdPercent, alertEmail } = req.body;

      if (defaultProvider && !Object.values(AI_PROVIDERS).includes(defaultProvider as AIProvider)) {
        return res.status(400).json({ error: 'Invalid provider' });
      }

      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          `INSERT INTO ai_configuration (singleton_key, default_provider, monthly_token_budget, alert_threshold_percent, alert_email, updated_at)
           VALUES ('default', $1, $2, $3, $4, now())
           ON CONFLICT (singleton_key) DO UPDATE
             SET default_provider = EXCLUDED.default_provider,
                 monthly_token_budget = EXCLUDED.monthly_token_budget,
                 alert_threshold_percent = EXCLUDED.alert_threshold_percent,
                 alert_email = EXCLUDED.alert_email,
                 updated_at = now()
           RETURNING *`,
          [
            (defaultProvider as AIProvider) ?? AI_PROVIDERS.AZURE_FOUNDRY,
            monthlyTokenBudget ?? null,
            alertThresholdPercent ?? 80,
            alertEmail ?? null,
          ]
        );

        invalidateConfigCache();
        res.json(formatConfig(rows[0]));
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ error: error.message });
    }
  }
);

router.get(
  '/api/admin/ai/features',
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          `SELECT * FROM ai_feature_model_assignments`
        );

        const assignments: Record<string, { provider: AIProvider; model: string; isActive: boolean }> = {};
        for (const [feature, defaults] of Object.entries(DEFAULT_FEATURE_ASSIGNMENTS)) {
          assignments[feature] = { ...defaults, isActive: true };
        }
        for (const row of rows) {
          assignments[row.feature as string] = {
            provider: row.provider as AIProvider,
            model: row.model as string,
            isActive: row.is_active as boolean,
          };
        }

        res.json(assignments);
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ error: error.message });
    }
  }
);

router.post(
  '/api/admin/ai/features',
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { feature, provider, model } = req.body as { feature: string; provider: string; model: string };

      if (!Object.values(AI_FEATURES).includes(feature as AIFeature)) {
        return res.status(400).json({ error: 'Invalid feature' });
      }
      if (!Object.values(AI_PROVIDERS).includes(provider as AIProvider)) {
        return res.status(400).json({ error: 'Invalid provider' });
      }

      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO ai_feature_model_assignments (feature, provider, model, is_active)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (feature) DO UPDATE
           SET provider = EXCLUDED.provider, model = EXCLUDED.model, is_active = true, updated_at = now()`,
          [feature, provider, model]
        );

        invalidateConfigCache();

        res.json({ feature, provider, model, isActive: true });
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ error: error.message });
    }
  }
);

router.get(
  '/api/admin/ai/usage',
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (req: AuthenticatedRequest, res) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string | undefined) ?? '100', 10), 500);
      const orgId = (req.query.orgId as string | undefined) ?? null;

      const [rows, monthly] = await Promise.all([
        getAIUsageSummary(orgId, limit),
        getMonthlyTokenBurn(orgId),
      ]);

      res.json({ rows, monthly });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ error: error.message });
    }
  }
);

router.get(
  '/api/admin/ai/provider-status',
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const statuses = getProviderStatus();
      res.json(statuses);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ error: error.message });
    }
  }
);

// ── System-level grounding docs (platform_owner only) ────────────────────────

router.get(
  '/api/admin/ai/grounding',
  requireAuth(),
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (_req, res) => {
    try {
      const docs = await storage.getGroundingDocuments('system');
      res.json(docs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.post(
  '/api/admin/ai/grounding',
  requireAuth(),
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  handleUpload,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const existingDocs = await storage.getGroundingDocuments('system');
      if (existingDocs.length >= SYSTEM_DOC_LIMIT) {
        return res.status(400).json({ error: `System document limit reached (max ${SYSTEM_DOC_LIMIT})` });
      }

      const fileType = mimeToFileType(req.file.mimetype);
      if (!fileType) {
        return res.status(400).json({ error: 'Unsupported file type' });
      }

      const contentText = await extractTextFromBuffer(req.file.buffer, req.file.mimetype);
      const name = (req.body.name as string) || req.file.originalname;
      const description = (req.body.description as string) || undefined;

      const doc = await storage.createGroundingDocument({
        scope: 'system',
        orgId: null,
        name,
        description,
        contentText,
        fileType,
        fileSizeBytes: req.file.size,
        isActive: true,
        uploadedBy: req.user?.id || null,
      });

      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.GROUNDING_DOC_CREATED,
        resource: 'grounding_document',
        resourceId: doc.id,
        organizationId: null,
        details: { scope: 'system', name: doc.name, fileType, fileSizeBytes: req.file.size },
      });
      res.json(doc);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.patch(
  '/api/admin/ai/grounding/:id',
  requireAuth(),
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id);
      const { isActive } = req.body;
      const before = await storage.getGroundingDocument(id);
      const doc = await storage.updateGroundingDocument(id, { isActive: Boolean(isActive) });
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.GROUNDING_DOC_UPDATED,
        resource: 'grounding_document',
        resourceId: id,
        organizationId: before?.orgId ?? null,
        details: {
          scope: doc.scope,
          name: doc.name,
          changes: auditDiff(
            before as unknown as Record<string, unknown> | undefined,
            { isActive: doc.isActive },
          ),
        },
      });
      res.json(doc);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.delete(
  '/api/admin/ai/grounding/:id',
  requireAuth(),
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id);
      const existing = await storage.getGroundingDocument(id);
      if (!existing || existing.scope !== 'system') {
        return res.status(404).json({ error: 'Document not found' });
      }
      await storage.deleteGroundingDocument(id);
      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.GROUNDING_DOC_DELETED,
        resource: 'grounding_document',
        resourceId: id,
        organizationId: null,
        details: { scope: 'system', name: existing.name },
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.get(
  '/api/admin/ai/grounding/preview',
  requireAuth(),
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (req: AuthenticatedRequest, res) => {
    try {
      const orgId = (req.query.orgId as string) || req.activeOrganizationId;
      const context = await assembleGroundingContext(orgId || undefined);
      res.json({ context, charCount: context.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ── Org-level grounding docs (tenant_admin or higher) ────────────────────────

router.get(
  '/api/admin/tenants/:orgId/ai/grounding',
  requireAuth(),
  requireRole(ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    try {
      const orgId = String(req.params.orgId);
      if (!(await assertOrgScope(req, orgId, 'Grounding documents requested for a different organization'))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const docs = await storage.getGroundingDocuments('org', orgId);
      res.json(docs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.post(
  '/api/admin/tenants/:orgId/ai/grounding',
  requireAuth(),
  requireRole(ZENITH_ROLES.TENANT_ADMIN),
  handleUpload,
  async (req: AuthenticatedRequest, res) => {
    try {
      const orgId = String(req.params.orgId);
      if (!(await assertOrgScope(req, orgId, 'Grounding document upload for a different organization'))) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const existingDocs = await storage.getGroundingDocuments('org', orgId);
      if (existingDocs.length >= ORG_DOC_LIMIT) {
        return res.status(400).json({ error: `Organization document limit reached (max ${ORG_DOC_LIMIT})` });
      }

      const fileType = mimeToFileType(req.file.mimetype);
      if (!fileType) {
        return res.status(400).json({ error: 'Unsupported file type' });
      }

      const contentText = await extractTextFromBuffer(req.file.buffer, req.file.mimetype);
      const name = (req.body.name as string) || req.file.originalname;
      const description = (req.body.description as string) || undefined;

      const doc = await storage.createGroundingDocument({
        scope: 'org',
        orgId,
        name,
        description,
        contentText,
        fileType,
        fileSizeBytes: req.file.size,
        isActive: true,
        uploadedBy: req.user?.id || null,
      });

      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.GROUNDING_DOC_CREATED,
        resource: 'grounding_document',
        resourceId: doc.id,
        organizationId: orgId,
        details: { scope: 'org', name: doc.name, fileType, fileSizeBytes: req.file.size },
      });
      res.json(doc);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.patch(
  '/api/admin/tenants/:orgId/ai/grounding/:id',
  requireAuth(),
  requireRole(ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id);
      const orgId = String(req.params.orgId);
      if (!(await assertOrgScope(req, orgId, 'Grounding document update for a different organization'))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const { isActive } = req.body;
      const before = await storage.getGroundingDocument(id);
      if (!before || before.scope !== 'org' || before.orgId !== orgId) {
        await logAccessDenied(req, 'grounding_document', id, 'Grounding document does not belong to supplied organization', {
          orgId, docScope: before?.scope, docOrgId: before?.orgId,
        });
        return res.status(404).json({ error: 'Document not found' });
      }
      const doc = await storage.updateGroundingDocument(id, { isActive: Boolean(isActive) });
      if (!doc) return res.status(404).json({ error: 'Document not found' });
      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.GROUNDING_DOC_UPDATED,
        resource: 'grounding_document',
        resourceId: id,
        organizationId: orgId,
        details: {
          scope: doc.scope,
          name: doc.name,
          changes: auditDiff(
            before as unknown as Record<string, unknown>,
            { isActive: doc.isActive },
          ),
        },
      });
      res.json(doc);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.delete(
  '/api/admin/tenants/:orgId/ai/grounding/:id',
  requireAuth(),
  requireRole(ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = String(req.params.id);
      const orgId = String(req.params.orgId);
      if (!(await assertOrgScope(req, orgId, 'Grounding document delete for a different organization'))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const existing = await storage.getGroundingDocument(id);
      if (!existing || existing.scope !== 'org' || existing.orgId !== orgId) {
        await logAccessDenied(req, 'grounding_document', id, 'Grounding document does not belong to supplied organization', {
          orgId, docScope: existing?.scope, docOrgId: existing?.orgId,
        });
        return res.status(404).json({ error: 'Document not found' });
      }
      await storage.deleteGroundingDocument(id);
      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.GROUNDING_DOC_DELETED,
        resource: 'grounding_document',
        resourceId: id,
        organizationId: orgId,
        details: { scope: 'org', name: existing.name },
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

router.get(
  '/api/admin/tenants/:orgId/ai/grounding/preview',
  requireAuth(),
  requireRole(ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    try {
      const orgId = String(req.params.orgId);
      if (!(await assertOrgScope(req, orgId, 'Grounding preview for a different organization'))) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const context = await assembleGroundingContext(orgId);
      res.json({ context, charCount: context.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
