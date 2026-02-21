import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertWorkspaceSchema, insertProvisioningRequestSchema } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── Workspaces ──
  app.get("/api/workspaces", async (req, res) => {
    const search = req.query.search as string | undefined;
    const workspaces = await storage.getWorkspaces(search);
    res.json(workspaces);
  });

  app.get("/api/workspaces/:id", async (req, res) => {
    const workspace = await storage.getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    res.json(workspace);
  });

  app.post("/api/workspaces", async (req, res) => {
    const parsed = insertWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const workspace = await storage.createWorkspace(parsed.data);
    res.status(201).json(workspace);
  });

  app.patch("/api/workspaces/:id", async (req, res) => {
    const workspace = await storage.updateWorkspace(req.params.id, req.body);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    res.json(workspace);
  });

  app.delete("/api/workspaces/:id", async (req, res) => {
    await storage.deleteWorkspace(req.params.id);
    res.status(204).send();
  });

  app.patch("/api/workspaces/bulk/update", async (req, res) => {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "ids array is required" });
    }
    await storage.bulkUpdateWorkspaces(ids, updates);
    res.json({ message: "Bulk update complete", count: ids.length });
  });

  // ── Provisioning Requests ──
  app.get("/api/provisioning-requests", async (_req, res) => {
    const requests = await storage.getProvisioningRequests();
    res.json(requests);
  });

  app.get("/api/provisioning-requests/:id", async (req, res) => {
    const request = await storage.getProvisioningRequest(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    res.json(request);
  });

  app.post("/api/provisioning-requests", async (req, res) => {
    const parsed = insertProvisioningRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const request = await storage.createProvisioningRequest(parsed.data);
    res.status(201).json(request);
  });

  app.patch("/api/provisioning-requests/:id/status", async (req, res) => {
    const { status } = req.body;
    if (!["PENDING", "APPROVED", "PROVISIONED", "REJECTED"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const request = await storage.updateProvisioningRequestStatus(req.params.id, status);
    if (!request) return res.status(404).json({ message: "Request not found" });
    res.json(request);
  });

  // ── Copilot Rules ──
  app.get("/api/workspaces/:id/copilot-rules", async (req, res) => {
    const rules = await storage.getCopilotRules(req.params.id);
    res.json(rules);
  });

  app.put("/api/workspaces/:id/copilot-rules", async (req, res) => {
    const { rules } = req.body;
    if (!Array.isArray(rules)) {
      return res.status(400).json({ message: "rules array is required" });
    }
    const created = await storage.setCopilotRules(req.params.id, rules);
    res.json(created);
  });

  // ── Dashboard Stats ──
  app.get("/api/stats", async (_req, res) => {
    const allWorkspaces = await storage.getWorkspaces();
    const total = allWorkspaces.length;
    const copilotReady = allWorkspaces.filter(w => w.copilotReady).length;
    const metadataComplete = allWorkspaces.filter(w => w.metadataStatus === "COMPLETE").length;
    const metadataMissing = allWorkspaces.filter(w => w.metadataStatus === "MISSING_REQUIRED").length;
    const highlyConfidential = allWorkspaces.filter(w => w.sensitivity === "HIGHLY_CONFIDENTIAL").length;
    const requests = await storage.getProvisioningRequests();
    const pendingRequests = requests.filter(r => r.status === "PENDING").length;

    res.json({
      totalWorkspaces: total,
      copilotReady,
      copilotNotReady: total - copilotReady,
      metadataComplete,
      metadataMissing,
      highlyConfidential,
      pendingRequests,
      totalRequests: requests.length,
    });
  });

  return httpServer;
}
