import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export type RelaySourceEvidence = {
  id: string;
  kind: "source";
  source_type: "repository-file";
  path: string;
  start_line: number;
  end_line: number;
  content_hash: string;
  content: string;
  truncated: boolean;
};

export type RelayEvidenceCollection = {
  evidence: RelaySourceEvidence[];
  excluded: Record<string, number>;
};

export type CollectRelayEvidenceOptions = {
  root: string;
  maxFiles: number;
  maxFileBytes: number;
  maxChunkBytes: number;
};

const excludedDirectories = new Map<string, string>([
  [".git", "git"],
  [".briefops", "briefops"],
  ["node_modules", "dependency"],
  ["dist", "build"],
  ["coverage", "build"]
]);

function increment(counter: Record<string, number>, reason: string): void {
  counter[reason] = (counter[reason] ?? 0) + 1;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isSecretPath(relativePath: string): boolean {
  const filename = path.posix.basename(relativePath).toLowerCase();
  return (
    filename === ".env" ||
    filename.startsWith(".env.") ||
    /(^|[-_.])(secret|credential|private[-_]?key|id_rsa)([-_.]|$)/.test(filename)
  );
}

function isText(value: string): boolean {
  return !value.includes("\u0000");
}

function toRelativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function evidenceId(relativePath: string, startLine: number, endLine: number, contentHash: string): string {
  const identity = ["source", "repository-file", relativePath, startLine, endLine, contentHash].join("|");
  return `src_${sha256(identity).slice(0, 16)}`;
}

function chunkLines(content: string, maxChunkBytes: number): Array<{ content: string; startLine: number; endLine: number; truncated: boolean }> {
  const normalized = content.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  if (normalized.endsWith("\n")) lines.pop();
  if (lines.length === 0) return [];

  const chunks: Array<{ content: string; startLine: number; endLine: number; truncated: boolean }> = [];
  let start = 0;
  let current: string[] = [];
  let currentBytes = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      content: current.join("\n"),
      startLine: start + 1,
      endLine: start + current.length,
      truncated: false
    });
    start += current.length;
    current = [];
    currentBytes = 0;
  };

  for (const line of lines) {
    const lineBytes = Buffer.byteLength(line, "utf8");
    if (current.length > 0 && currentBytes + 1 + lineBytes > maxChunkBytes) flush();

    if (lineBytes > maxChunkBytes) {
      const truncated = Buffer.from(line, "utf8").subarray(0, maxChunkBytes).toString("utf8");
      chunks.push({ content: `${truncated}\n[truncated]`, startLine: start + 1, endLine: start + 1, truncated: true });
      start += 1;
      continue;
    }

    current.push(line);
    currentBytes += (current.length === 1 ? 0 : 1) + lineBytes;
  }
  flush();
  return chunks;
}

async function listCandidateFiles(root: string, excluded: Record<string, number>): Promise<string[]> {
  const files: string[] = [];

  const visit = async (directory: string): Promise<void> => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(directory, entry.name);
      const relativePath = toRelativePath(root, fullPath);
      if (entry.isDirectory()) {
        const reason = excludedDirectories.get(entry.name);
        if (reason) {
          increment(excluded, reason);
        } else {
          await visit(fullPath);
        }
      } else if (entry.isSymbolicLink()) {
        increment(excluded, "symlink");
      } else if (entry.isFile()) {
        if (isSecretPath(relativePath)) {
          increment(excluded, "secret");
        } else {
          files.push(fullPath);
        }
      }
    }
  };

  await visit(root);
  return files;
}

export async function collectRelayEvidence(
  options: CollectRelayEvidenceOptions
): Promise<RelayEvidenceCollection> {
  const excluded: Record<string, number> = {};
  const evidence: RelaySourceEvidence[] = [];
  const files = await listCandidateFiles(options.root, excluded);

  for (const filePath of files) {
    if (evidence.length >= options.maxFiles) {
      increment(excluded, "limit");
      continue;
    }

    const stat = await fs.stat(filePath);
    if (stat.size > options.maxFileBytes) {
      increment(excluded, "too_large");
      continue;
    }

    const raw = await fs.readFile(filePath, "utf8");
    if (!isText(raw)) {
      increment(excluded, "binary");
      continue;
    }

    const relativePath = toRelativePath(options.root, filePath);
    for (const chunk of chunkLines(raw, options.maxChunkBytes)) {
      const contentHash = sha256(chunk.content);
      evidence.push({
        id: evidenceId(relativePath, chunk.startLine, chunk.endLine, contentHash),
        kind: "source",
        source_type: "repository-file",
        path: relativePath,
        start_line: chunk.startLine,
        end_line: chunk.endLine,
        content_hash: contentHash,
        content: chunk.content,
        truncated: chunk.truncated
      });
    }
  }

  return { evidence, excluded };
}
