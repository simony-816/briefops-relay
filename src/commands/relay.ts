import path from "node:path";
import type { Command } from "commander";
import { collectRelayEvidence } from "../core/relayEvidence.js";
import { BriefOpsError } from "../core/errors.js";
import { inspectRelayGit } from "../core/relayGit.js";
import { formatDateStamp, workspacePaths } from "../core/paths.js";
import { relayRunDirectory, resolveRelayRunDirectory } from "../core/relayPaths.js";
import { createRelayDemoArtifacts } from "../core/relayDemo.js";
import { renderRelayHandoff } from "../core/relayHandoff.js";
import { renderRelayReport } from "../core/relayReport.js";
import { validateRelayAudit, validateRelayContract } from "../core/relayContract.js";
import { readTextFile, writeTextFileAtomic } from "../core/storage.js";
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

  relay
    .command("demo")
    .description("Create a complete API-key-free Relay demonstration run.")
    .action(async () => {
      const cwd = process.cwd();
      await requireWorkspace(cwd);
      const artifacts = createRelayDemoArtifacts();
      const runDir = relayRunDirectory(cwd, "relay_20260715_000000_001");
      await Promise.all(Object.entries(artifacts).map(([name, content]) => writeTextFileAtomic(path.join(runDir, name), content)));
      console.log(`Relay demo saved: ${runDir}`);
      console.log("Integrity Score: 40 · Completion Gate: FAIL");
    });

  relay
    .command("audit")
    .description("Validate the evidence, coverage, and deterministic score of an offline audit artifact.")
    .option("--run <run>", "Relay run ID or latest", "latest")
    .action(async (options: { run: string }) => {
      const cwd = process.cwd();
      await requireWorkspace(cwd);
      const runDir = await resolveRelayRunDirectory(cwd, options.run, ["contract.json", "audit.json", "evidence.json"]);
      const [contract, audit, evidence] = await Promise.all([
        readTextFile(path.join(runDir, "contract.json")).then((raw) => JSON.parse(raw) as unknown),
        readTextFile(path.join(runDir, "audit.json")).then((raw) => JSON.parse(raw) as unknown),
        readTextFile(path.join(runDir, "evidence.json")).then((raw) => JSON.parse(raw) as unknown)
      ]);
      const validatedContract = validateRelayContract(contract, evidence);
      const validatedAudit = validateRelayAudit(validatedContract, audit, evidence);
      await writeTextFileAtomic(path.join(runDir, "audit.json"), `${JSON.stringify(validatedAudit, null, 2)}\n`);
      console.log(`Relay audit verified: ${runDir}`);
      console.log(`Integrity Score: ${validatedAudit.score} · Completion Gate: ${validatedAudit.completion_gate.toUpperCase()}`);
    });

  for (const [name, render, description] of [
    ["handoff", renderRelayHandoff, "Render a verified Markdown handoff from a Relay run."],
    ["report", renderRelayReport, "Render a self-contained HTML report from a Relay run."]
  ] as const) {
    relay
      .command(name)
      .description(description)
      .option("--run <run>", "Relay run ID or latest", "latest")
      .action(async (options: { run: string }) => {
        const cwd = process.cwd();
        await requireWorkspace(cwd);
        const runDir = await resolveRelayRunDirectory(cwd, options.run, ["contract.json", "audit.json", "evidence.json"]);
        const [contract, audit, evidence] = await Promise.all([
          readTextFile(path.join(runDir, "contract.json")).then((raw) => JSON.parse(raw) as unknown),
          readTextFile(path.join(runDir, "audit.json")).then((raw) => JSON.parse(raw) as unknown),
          readTextFile(path.join(runDir, "evidence.json")).then((raw) => JSON.parse(raw) as unknown)
        ]);
        const outputName = name === "handoff" ? "handoff.md" : "report.html";
        await writeTextFileAtomic(path.join(runDir, outputName), render({ contract, audit, evidence }));
        console.log(`Relay ${name} saved: ${path.join(runDir, outputName)}`);
      });
  }
}
