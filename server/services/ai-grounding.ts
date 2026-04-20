import { storage } from "../storage";

const SYSTEM_HEADER = "## SYSTEM GROUNDING CONTEXT\n\nThe following documents represent platform-wide authoritative knowledge and standards:\n\n";
const ORG_HEADER = "\n\n## ORGANIZATION-SPECIFIC CONTEXT\n\nThe following documents represent organization-specific policies and standards:\n\n";
const DOC_SEPARATOR = "\n\n---\n\n";

export async function assembleGroundingContext(orgId?: string): Promise<string> {
  const systemDocs = await storage.getGroundingDocuments("system");
  const activeSysDocs = systemDocs.filter(d => d.isActive);

  let context = "";

  if (activeSysDocs.length > 0) {
    context += SYSTEM_HEADER;
    context += activeSysDocs
      .map(doc => `### ${doc.name}\n${doc.description ? `_${doc.description}_\n\n` : ""}${doc.contentText}`)
      .join(DOC_SEPARATOR);
  }

  if (orgId) {
    const orgDocs = await storage.getGroundingDocuments("org", orgId);
    const activeOrgDocs = orgDocs.filter(d => d.isActive);
    if (activeOrgDocs.length > 0) {
      context += ORG_HEADER;
      context += activeOrgDocs
        .map(doc => `### ${doc.name}\n${doc.description ? `_${doc.description}_\n\n` : ""}${doc.contentText}`)
        .join(DOC_SEPARATOR);
    }
  }

  return context;
}
