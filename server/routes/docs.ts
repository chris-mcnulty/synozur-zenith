import { Router } from "express";
import fs from "fs";
import path from "path";
import { requireAuth, type AuthenticatedRequest } from "../middleware/rbac";

const router = Router();

const DOCS_DIR = path.resolve(process.cwd(), "docs");

const ALLOWED_DOCS = ["ROADMAP.md", "CHANGELOG.md", "USER_GUIDE.md", "BACKLOG.md"];

router.get("/api/docs/:filename", requireAuth(), (req: AuthenticatedRequest, res) => {
  const { filename } = req.params;
  const safeFilename = filename.endsWith(".md") ? filename : `${filename}.md`;

  if (!ALLOWED_DOCS.includes(safeFilename)) {
    return res.status(404).json({ error: "Document not found" });
  }

  const filePath = path.join(DOCS_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Document not found" });
  }

  const content = fs.readFileSync(filePath, "utf-8");
  res.json({ filename: safeFilename, content });
});

router.get("/api/docs", requireAuth(), (_req: AuthenticatedRequest, res) => {
  const docs = ALLOWED_DOCS.map((filename) => {
    const filePath = path.join(DOCS_DIR, filename);
    const exists = fs.existsSync(filePath);
    const stats = exists ? fs.statSync(filePath) : null;
    return {
      filename,
      slug: filename.replace(".md", "").toLowerCase(),
      exists,
      lastModified: stats?.mtime?.toISOString() || null,
    };
  });
  res.json(docs);
});

export default router;
