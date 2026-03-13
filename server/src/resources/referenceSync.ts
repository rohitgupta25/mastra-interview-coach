import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import axios from "axios";
import { INTERVIEW_REFERENCE_DOCS, type ReferenceDoc } from "./interviewReferences";
import { setReferenceDocs } from "../tools/ragRetriever";

type SyncReason = "startup" | "interval" | "manual_api";

type ReferenceSyncStatus = {
  ok: boolean;
  inProgress: boolean;
  lastSyncAt?: string;
  lastReason?: SyncReason;
  totalDocs: number;
  syncedPdfDocs: number;
  syncedMdDocs: number;
  syncedWebDocs: number;
  errors: string[];
};

const DEFAULT_SYNC_INTERVAL_MIN = 180;
const DEFAULT_MD_PATH = path.join(process.env.HOME ?? "", "Downloads", "frontend_interview_questions_500_plus.md");

const state: ReferenceSyncStatus = {
  ok: true,
  inProgress: false,
  totalDocs: INTERVIEW_REFERENCE_DOCS.filter((doc) => doc.sourceType !== "pdf").length,
  syncedPdfDocs: 0,
  syncedMdDocs: 0,
  syncedWebDocs: 0,
  errors: [],
};

let intervalHandle: NodeJS.Timeout | null = null;

function toIdPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function clip(value: string, max = 1600) {
  if (value.length <= max) return value;
  return value.slice(0, max).trimEnd();
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function buildTagsFromText(value: string, extraTags: string[] = []) {
  const fromText = tokenize(value).slice(0, 12);
  const merged = [...extraTags, ...fromText];
  return [...new Set(merged)].slice(0, 14);
}

function splitIntoChunks(text: string, maxChunkLength = 900, maxChunks = 4) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < clean.length && chunks.length < maxChunks) {
    const end = Math.min(clean.length, cursor + maxChunkLength);
    const slice = clean.slice(cursor, end);
    chunks.push(slice.trim());
    cursor = end;
  }

  return chunks.filter(Boolean);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function htmlToText(html: string) {
  const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const noStyle = noScript.replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withBreaks = noStyle.replace(/<\/(p|div|section|article|li|h[1-6]|br|tr)>/gi, "\n");
  const noTags = withBreaks.replace(/<[^>]+>/g, " ");
  const decoded = decodeHtmlEntities(noTags);
  return decoded.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractTitleFromHtml(html: string, fallback: string) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    return decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, " ").trim();
  }
  return fallback;
}

function parseUrlListFromEnv() {
  const raw = (process.env.REFERENCE_SYNC_WEB_URLS ?? "").trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseMdPathListFromEnv() {
  const raw = (process.env.INTERVIEW_RESOURCES_MD_PATHS ?? process.env.INTERVIEW_RESOURCES_MD_PATH ?? "").trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getWebSyncUrls() {
  const fromStaticDocs = INTERVIEW_REFERENCE_DOCS.filter((doc) => doc.sourceType === "web" && !!doc.url).map(
    (doc) => doc.url as string,
  );
  const fromEnv = parseUrlListFromEnv();
  return [...new Set([...fromStaticDocs, ...fromEnv])];
}

function getMarkdownPaths() {
  const explicit = parseMdPathListFromEnv();
  if (explicit.length > 0) {
    return [...new Set(explicit)];
  }

  if (fs.existsSync(DEFAULT_MD_PATH)) {
    return [DEFAULT_MD_PATH];
  }

  return [];
}

function decodePdfAscii85(input: string) {
  const clean = input
    .replace(/^<~/, "")
    .replace(/~>$/, "")
    .replace(/\s+/g, "");

  const bytes: number[] = [];
  const tuple: number[] = [];

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    if (char === "z") {
      if (tuple.length !== 0) {
        throw new Error("Invalid ascii85 stream.");
      }
      bytes.push(0, 0, 0, 0);
      continue;
    }

    const code = clean.charCodeAt(i);
    if (code < 33 || code > 117) {
      continue;
    }

    tuple.push(code - 33);
    if (tuple.length === 5) {
      const value =
        (((tuple[0] * 85 + tuple[1]) * 85 + tuple[2]) * 85 + tuple[3]) * 85 + tuple[4];
      bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
      tuple.length = 0;
    }
  }

  if (tuple.length > 0) {
    const originalLength = tuple.length;
    while (tuple.length < 5) {
      tuple.push(84);
    }

    const value =
      (((tuple[0] * 85 + tuple[1]) * 85 + tuple[2]) * 85 + tuple[3]) * 85 + tuple[4];
    const tail = [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
    bytes.push(...tail.slice(0, originalLength - 1));
  }

  return Buffer.from(bytes);
}

function decodePdfEscapedText(value: string) {
  let output = "";

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char !== "\\") {
      output += char;
      continue;
    }

    i += 1;
    if (i >= value.length) break;
    const escaped = value[i];

    const simpleMap: Record<string, string> = {
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      "(": "(",
      ")": ")",
      "\\": "\\",
    };

    if (simpleMap[escaped]) {
      output += simpleMap[escaped];
      continue;
    }

    if (/[0-7]/.test(escaped)) {
      let octal = escaped;
      for (let j = 0; j < 2; j += 1) {
        const next = value[i + 1];
        if (next && /[0-7]/.test(next)) {
          octal += next;
          i += 1;
        } else {
          break;
        }
      }
      output += String.fromCharCode(parseInt(octal, 8));
      continue;
    }

    output += escaped;
  }

  return output;
}

function extractPdfTextLines(pdfBuffer: Buffer) {
  const lines: string[] = [];
  let cursor = 0;

  while (cursor < pdfBuffer.length) {
    const streamPos = pdfBuffer.indexOf("stream", cursor, "latin1");
    if (streamPos < 0) break;

    let dataStart = streamPos + "stream".length;
    if (pdfBuffer[dataStart] === 0x0d && pdfBuffer[dataStart + 1] === 0x0a) dataStart += 2;
    else if (pdfBuffer[dataStart] === 0x0a || pdfBuffer[dataStart] === 0x0d) dataStart += 1;

    const endPos = pdfBuffer.indexOf("endstream", dataStart, "latin1");
    if (endPos < 0) break;

    const rawStream = pdfBuffer.slice(dataStart, endPos).toString("latin1");
    cursor = endPos + "endstream".length;

    let decoded: Buffer | null = null;
    try {
      const ascii85 = decodePdfAscii85(rawStream);
      decoded = zlib.inflateSync(ascii85);
    } catch {
      continue;
    }

    const content = decoded.toString("latin1");
    const perLine: string[] = [];

    for (const match of content.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
      const token = match[0];
      const value = token.slice(0, token.lastIndexOf(")")).slice(1);
      const text = decodePdfEscapedText(value).replace(/\s+/g, " ").trim();
      if (text) perLine.push(text);
    }

    for (const match of content.matchAll(/\[(.*?)\]\s*TJ/gs)) {
      const chunk = match[1];
      const parts: string[] = [];
      for (const part of chunk.matchAll(/\((?:\\.|[^\\)])*\)/g)) {
        const raw = part[0].slice(1, -1);
        parts.push(decodePdfEscapedText(raw));
      }
      const text = parts.join("").replace(/\s+/g, " ").trim();
      if (text) perLine.push(text);
    }

    lines.push(...perLine);
  }

  return lines;
}

function buildPdfDocs(pdfPath: string) {
  if (!fs.existsSync(pdfPath)) {
    return { docs: [] as ReferenceDoc[], warning: `PDF not found at ${pdfPath}` };
  }

  const pdfBuffer = fs.readFileSync(pdfPath);
  const lines = extractPdfTextLines(pdfBuffer)
    .map((line) => line.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ").trim())
    .filter((line) => line.length >= 20);

  const merged = lines.join(" ");
  const chunks = splitIntoChunks(merged, 850, 5);
  const sourceLabel = path.basename(pdfPath);

  const docs = chunks.map((chunk, index) => ({
    id: `sync-pdf-${index + 1}`,
    sourceType: "pdf" as const,
    title: index === 0 ? "Auto-synced PDF interview references" : `Auto-synced PDF interview references (${index + 1})`,
    sourceLabel,
    tags: buildTagsFromText(chunk, ["frontend", "interview", "pdf", "auto-sync"]),
    content: clip(chunk, 1700),
  }));

  return { docs };
}

function markdownToText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+/g, " ")
    .trim();
}

function buildMarkdownDocs(mdPath: string) {
  if (!fs.existsSync(mdPath)) {
    return { docs: [] as ReferenceDoc[], warning: `Markdown file not found at ${mdPath}` };
  }

  const raw = fs.readFileSync(mdPath, "utf8");
  const text = markdownToText(raw);
  if (!text) {
    return { docs: [] as ReferenceDoc[], warning: `Markdown file is empty at ${mdPath}` };
  }

  const chunks = splitIntoChunks(text, 900, 16);
  const sourceLabel = path.basename(mdPath);
  const idBase = toIdPart(sourceLabel);

  const docs = chunks.map((chunk, index) => ({
    id: `sync-md-${idBase}-${index + 1}`,
    sourceType: "md" as const,
    title: index === 0 ? "Auto-synced Markdown interview references" : `Auto-synced Markdown interview references (${index + 1})`,
    sourceLabel,
    tags: buildTagsFromText(chunk, ["frontend", "interview", "markdown", "auto-sync"]),
    content: clip(chunk, 1700),
  }));

  return { docs };
}

async function buildWebDocs(url: string) {
  const response = await axios.get<string>(url, {
    timeout: 15000,
    responseType: "text",
    headers: {
      "User-Agent": "mastra-interview-coach/reference-sync",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  const html = String(response.data ?? "");
  const title = extractTitleFromHtml(html, url);
  const text = htmlToText(html);
  const chunks = splitIntoChunks(text, 900, 3);
  const idBase = toIdPart(url);
  const hostname = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "web-source";
    }
  })();
  const sourceLabel = `${hostname} (auto-sync)`;
  const hostTags = hostname.split(".").map((part) => part.trim()).filter((part) => part.length >= 3).slice(0, 3);

  return chunks.map((chunk, index) => ({
    id: `sync-web-${idBase}-${index + 1}`,
    sourceType: "web" as const,
    title: index === 0 ? title : `${title} (${index + 1})`,
    sourceLabel,
    url,
    tags: buildTagsFromText(`${title} ${url} ${chunk}`, ["frontend", "interview", "auto-sync", ...hostTags]),
    content: clip(chunk, 1700),
  }));
}

function mergeDocs(baseDocs: ReferenceDoc[], syncedDocs: ReferenceDoc[]) {
  const map = new Map<string, ReferenceDoc>();
  for (const doc of baseDocs) {
    if (doc.sourceType === "pdf") continue;
    map.set(doc.id, doc);
  }
  for (const doc of syncedDocs) {
    if (doc.sourceType === "pdf") continue;
    map.set(doc.id, doc);
  }
  return [...map.values()];
}

export function getReferenceSyncStatus() {
  return { ...state, errors: [...state.errors] };
}

export async function syncInterviewReferences(reason: SyncReason) {
  if (state.inProgress) {
    return getReferenceSyncStatus();
  }

  state.inProgress = true;
  const errors: string[] = [];
  const syncedDocs: ReferenceDoc[] = [];
  let syncedPdfDocs = 0;
  let syncedMdDocs = 0;
  let syncedWebDocs = 0;

  try {
    const markdownPaths = getMarkdownPaths();
    for (const mdPath of markdownPaths) {
      try {
        const result = buildMarkdownDocs(mdPath);
        if ("warning" in result && result.warning) {
          errors.push(result.warning);
        } else {
          syncedDocs.push(...result.docs);
          syncedMdDocs += result.docs.length;
        }
      } catch (error) {
        errors.push(`Markdown sync failed for ${mdPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const webUrls = getWebSyncUrls();
    for (const url of webUrls) {
      try {
        const docs = await buildWebDocs(url);
        if (docs.length > 0) {
          syncedDocs.push(...docs);
          syncedWebDocs += docs.length;
        }
      } catch (error) {
        errors.push(`Web sync failed for ${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const merged = mergeDocs(INTERVIEW_REFERENCE_DOCS, syncedDocs);
    setReferenceDocs(merged);

    const hasAnySynced = syncedDocs.length > 0;
    state.ok = errors.length === 0 || hasAnySynced;
    state.inProgress = false;
    state.lastSyncAt = new Date().toISOString();
    state.lastReason = reason;
    state.totalDocs = merged.length;
    state.syncedPdfDocs = syncedPdfDocs;
    state.syncedMdDocs = syncedMdDocs;
    state.syncedWebDocs = syncedWebDocs;
    state.errors = errors;

    return getReferenceSyncStatus();
  } catch (error) {
    state.ok = false;
    state.inProgress = false;
    state.lastSyncAt = new Date().toISOString();
    state.lastReason = reason;
    state.errors = [
      ...errors,
      `Sync failed: ${error instanceof Error ? error.message : String(error)}`,
    ];
    return getReferenceSyncStatus();
  }
}

export function startReferenceAutoSync() {
  if (intervalHandle) {
    return;
  }

  void syncInterviewReferences("startup");

  const minutesRaw = Number(process.env.REFERENCE_SYNC_INTERVAL_MIN ?? DEFAULT_SYNC_INTERVAL_MIN);
  const minutes = Number.isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : DEFAULT_SYNC_INTERVAL_MIN;
  const intervalMs = Math.round(minutes * 60_000);

  intervalHandle = setInterval(() => {
    void syncInterviewReferences("interval");
  }, intervalMs);

  intervalHandle.unref?.();
}
