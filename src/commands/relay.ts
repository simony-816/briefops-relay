import path from "node:path";
import type { Command } from "commander";
import { collectRelayEvidence } from "../core/relayEvidence.js";
import { BriefOpsError } from "../core/errors.js";
import { formatDateStamp, workspacePaths } from "../core/paths.js";
import { writeTextFileAtomic } from "../core/storage.js";
import { requireWorkspace } from "../core/workspace.js";

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
      const collection = await collectRelayEvidence({
        root: cwd,
        maxFiles: 40,
        maxFileBytes: 40_000,
        maxChunkBytes: 8_000
      });
      const runId = `relay_${formatDateStamp()}`;
      const runDir = path.join(workspacePaths(cwd).root, "relay", "runs", runId);
      const includedPaths = [...new Set(collection.evidence.map((item) => item.path))].sort();
      const manifest = {
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
        excluded: collection.excluded
      };

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
