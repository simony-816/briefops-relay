import { promises as fs } from "node:fs";
import path from "node:path";
import { BriefOpsError } from "./errors.js";
import { workspacePaths } from "./paths.js";

const runIdPattern = /^relay_\d{8}_\d{6}_\d{3}$/;

export function relayRunsDirectory(cwd: string): string {
  return path.join(workspacePaths(cwd).root, "relay", "runs");
}

export function relayRunDirectory(cwd: string, runId: string): string {
  if (!runIdPattern.test(runId)) throw new BriefOpsError(`Invalid Relay run ID: ${runId}`);
  return path.join(relayRunsDirectory(cwd), runId);
}

export async function resolveRelayRunDirectory(
  cwd: string,
  requestedRun?: string,
  requiredFiles: string[] = []
): Promise<string> {
  if (requestedRun && requestedRun !== "latest") return relayRunDirectory(cwd, requestedRun);
  let entries: string[];
  try {
    entries = await fs.readdir(relayRunsDirectory(cwd));
  } catch {
    throw new BriefOpsError("No Relay runs were found. Run `briefops relay demo` or `briefops relay prepare --dry-run` first.");
  }
  const candidates = entries.filter((entry) => runIdPattern.test(entry)).sort().reverse();
  for (const runId of candidates) {
    const runDir = relayRunDirectory(cwd, runId);
    const artifacts = await Promise.all(requiredFiles.map(async (file) => {
      try {
        await fs.access(path.join(runDir, file));
        return true;
      } catch {
        return false;
      }
    }));
    if (artifacts.every(Boolean)) return runDir;
  }
  throw new BriefOpsError("No completed Relay run was found. Run `briefops relay demo` first.");
}
