import path from "node:path";
import type { Command } from "commander";
import { collectRelayEvidence } from "../core/relayEvidence.js";
import { BriefOpsError } from "../core/errors.js";
import { inspectRelayGit } from "../core/relayGit.js";
import { formatDateStamp, workspacePaths } from "../core/paths.js";
import { writeTextFileAtomic } from "../core/storage.js";
import { requireWorkspace } from "../core/workspace.js";
import { relayManifestSchema } from "../schemas/relay.js";

export function registerRelayCommands(program: Command): void {
  const relay = program
    .command("relay")
    .description("Create and audit evidence-backed execution contracts.");

  relay
    .command("prepare <task>")
    .description("Collect repository evidence for a task-scoped execution contract.")
    .option("--dry-run", "Write the outgoing-data manifest without making a network request.")
    .action(async (task: string, options: Record<string, unknown>) => {
      if (!options.dryRun) {
        throw new BriefOpsError("Live Relay prepare is not available yet. Re-run with --dry-run.");
      }

      const cwd = process.cwd();
      await requireWorkspace(cwd);
      const git = await inspectRelayGit({ cwd, baselineRef: "HEAD" });
      const collection = await collectRelayEvidence({
        root: cwd,
        maxFiles: 40,
        maxFileBytes: 40_000,
        maxChunkBytes: 8_000
      });
      const runId = `relay_${formatDateStamp()}`;
      const runDir = path.join(workspacePaths(cwd).root, "relay", "runs", runId);
      const includedPaths = [...new Set(collection.evidence.map((item) => item.path))].sort();
      const manifest = relayManifestSchema.parse({
        schema_version: 1,
        run_id: runId,
        task,
        network_permitted: false,
        evidence_count: collection.evidence.length,
        total_bytes: collection.evidence.reduce(
          (total, item) => total + Buffer.byteLength(item.content, "utf8"),
          0
        ),
        included_paths: includedPaths,
        excluded: collection.excluded,
        baseline_sha: git.baselineSha,
        head_sha: git.headSha,
        dirty: git.dirty
      });

      await writeTextFileAtomic(path.join(runDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
      await writeTextFileAtomic(
        path.join(runDir, "evidence.json"),
        `${JSON.stringify(collection.evidence, null, 2)}\n`
      );

      console.log(`Relay dry run saved: ${runDir}`);
      console.log(`Evidence: ${collection.evidence.length}`);
      console.log(`Included files: ${includedPaths.length}`);
    });
}
