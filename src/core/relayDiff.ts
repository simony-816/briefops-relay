import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BriefOpsError } from "./errors.js";

const execFileAsync = promisify(execFile);

export type RelayChangeEvidence = {
  id: string;
  kind: "change";
  source_type: "git-diff";
  path: string;
  old_start_line: number;
  old_end_line: number;
  new_start_line: number;
  new_end_line: number;
  base_sha: string;
  head_sha: string;
  content_hash: string;
  content: string;
  truncated: false;
};

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function rangeEnd(start: number, count: number): number {
  return count === 0 ? start : start + count - 1;
}

function parseRange(value: string): { start: number; count: number } {
  const [start, count = "1"] = value.split(",");
  return { start: Number.parseInt(start ?? "0", 10), count: Number.parseInt(count, 10) };
}

export async function collectRelayDiffEvidence(options: {
  cwd: string;
  baselineSha: string;
  headSha: string;
}): Promise<RelayChangeEvidence[]> {
  let output: string;
  try {
    ({ stdout: output } = await execFileAsync(
      "git",
      ["diff", "--no-ext-diff", "--no-color", "--unified=0", options.baselineSha],
      { cwd: options.cwd, maxBuffer: 1_000_000 }
    ));
  } catch {
    throw new BriefOpsError("Unable to collect the Relay Git diff from the recorded baseline.");
  }

  const evidence: RelayChangeEvidence[] = [];
  const lines = output.replace(/\r\n?/g, "\n").split("\n");
  let currentPath: string | undefined;
  let hunk: { oldStart: number; oldCount: number; newStart: number; newCount: number; lines: string[] } | undefined;

  const flush = () => {
    if (!currentPath || !hunk) return;
    const content = hunk.lines.join("\n");
    const contentHash = hash(content);
    const identity = [currentPath, hunk.oldStart, hunk.oldCount, hunk.newStart, hunk.newCount, contentHash].join("|");
    evidence.push({
      id: `chg_${hash(identity).slice(0, 16)}`,
      kind: "change",
      source_type: "git-diff",
      path: currentPath,
      old_start_line: hunk.oldStart,
      old_end_line: rangeEnd(hunk.oldStart, hunk.oldCount),
      new_start_line: hunk.newStart,
      new_end_line: rangeEnd(hunk.newStart, hunk.newCount),
      base_sha: options.baselineSha,
      head_sha: options.headSha,
      content_hash: contentHash,
      content,
      truncated: false
    });
  };

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      flush();
      hunk = undefined;
      currentPath = undefined;
      continue;
    }
    if (line.startsWith("+++ b/")) {
      currentPath = line.slice("+++ b/".length);
      continue;
    }
    const match = line.match(/^@@ -(\d+(?:,\d+)?) \+(\d+(?:,\d+)?) @@/);
    if (match) {
      flush();
      const oldRange = parseRange(match[1] as string);
      const newRange = parseRange(match[2] as string);
      hunk = {
        oldStart: oldRange.start,
        oldCount: oldRange.count,
        newStart: newRange.start,
        newCount: newRange.count,
        lines: [line]
      };
      continue;
    }
    if (hunk) hunk.lines.push(line);
  }
  flush();
  return evidence;
}
