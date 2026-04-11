import { createRequire } from "module";

const require = createRequire(import.meta.url);

const MAX_CHARS = 50_000;

export type SupportedMimeType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "text/plain"
  | "text/markdown";

export type FileTypeLabel = "pdf" | "docx" | "txt" | "md";

export function mimeToFileType(mime: string): FileTypeLabel | null {
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (mime === "text/plain") return "txt";
  if (mime === "text/markdown" || mime === "text/x-markdown") return "md";
  return null;
}

export async function extractTextFromBuffer(buffer: Buffer, mimeType: string): Promise<string> {
  const fileType = mimeToFileType(mimeType);

  if (!fileType) {
    throw new Error(`Unsupported MIME type: ${mimeType}. Supported: PDF, DOCX, TXT, Markdown`);
  }

  let text: string;

  if (fileType === "pdf") {
    const pdfParse = require("pdf-parse/lib/pdf-parse.js");
    const result = await pdfParse(buffer);
    text = result.text;
  } else if (fileType === "docx") {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else {
    text = buffer.toString("utf-8");
  }

  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
  }

  return text.trim();
}
