import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { BriefOpsError } from "./errors.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trim();
  } catch {
    throw new BriefOpsError("Relay requires a Git worktree. Initialize Git or run Relay from a repository root.");
  }
}

export type RelayGitMetadata = {
  root: string;
  baselineSha: string;
  headSha: string;
  dirty: boolean;
};

export async function inspectRelayGit(options: {
  cwd: string;
  baselineRef: string;
}): Promise<RelayGitMetadata> {
  const root = await git(options.cwd, ["rev-parse", "--show-toplevel"]);
  const baselineSha = await git(root, ["rev-parse", "--verify", `${options.baselineRef}^{commit}`]);
  const headSha = await git(root, ["rev-parse", "HEAD"]);
  const status = await git(root, ["status", "--porcelain"]);

  return { root, baselineSha, headSha, dirty: status.length > 0 };
}
