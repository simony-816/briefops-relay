import path from "node:path";
import { promises as fs } from "node:fs";
import type { Command } from "commander";
import { collectRelayEvidence } from "../core/relayEvidence.js";
import { collectRelayDiffEvidence } from "../core/relayDiff.js";
import { BriefOpsError } from "../core/errors.js";
import { inspectRelayGit } from "../core/relayGit.js";
import { formatDateStamp, workspacePaths } from "../core/paths.js";
import { relayRunDirectory, resolveRelayRunDirectory } from "../core/relayPaths.js";
import { createRelayDemoArtifacts } from "../core/relayDemo.js";
import { renderRelayHandoff } from "../core/relayHandoff.js";
import { renderRelayReport } from "../core/relayReport.js";
import { validateRelayAudit, validateRelayContract } from "../core/relayContract.js";
import { generateWithCodexCli, generateWithOpenAIResponses, inspectCodexCli } from "../core/relayProvider.js";
import {
  buildRelayAudit,
  buildRelayContract,
  RelaySemanticOutputError,
  serializeRelaySemanticFailure,
  type RelaySemanticProvider
} from "../core/relaySemantic.js";
import { readTextFile, writeTextFileAtomic } from "../core/storage.js";
import { initWorkspace, requireWorkspace } from "../core/workspace.js";
import { relayManifestSchema } from "../schemas/relay.js";

function semanticProvider(name: string): RelaySemanticProvider {
  if (name === "codex") return { generate: generateWithCodexCli };
  if (name === "openai") {
    return {
      generate: (request) => generateWithOpenAIResponses(request, { apiKey: process.env.OPENAI_API_KEY ?? "" })
    };
  }
  throw new BriefOpsError(`Unsupported Relay provider: ${name}. Use codex or openai.`);
}

async function writeRelaySemanticFailure(runDir: string, error: unknown): Promise<void> {
  if (!(error instanceof RelaySemanticOutputError)) return;
  await writeTextFileAtomic(
    path.join(runDir, "semantic-failure.json"),
    `${JSON.stringify(serializeRelaySemanticFailure(error), null, 2)}\n`
  );
}

async function readRelayRunEvidence(runDir: string): Promise<unknown[]> {
  const sourceEvidence = JSON.parse(await readTextFile(path.join(runDir, "evidence.json"))) as unknown[];
  const diffPath = path.join(runDir, "diff-evidence.json");
  try {
    await fs.access(diffPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return sourceEvidence;
    throw error;
  }
  const changeEvidence = JSON.parse(await readTextFile(diffPath)) as unknown[];
  return [...sourceEvidence, ...changeEvidence];
}

export function registerRelayCommands(program: Command): void {
  const relay = program
    .command("relay")
    .description("Create and audit evidence-backed execution contracts.");

  relay
    .command("doctor")
    .description("Check Codex provider readiness without running a semantic task.")
    .action(async () => {
      const { version } = await inspectCodexCli();
      console.log("Relay Codex provider: ready");
      console.log(`Codex CLI: ${version}`);
      console.log("No model request was made.");
    });

  relay
    .command("prepare <task>")
    .description("Collect repository evidence for a task-scoped execution contract.")
    .option("--dry-run", "Write the outgoing-data manifest without making a network request.")
    .option("--allow-network", "Explicitly allow a semantic provider call.")
    .option("--provider <provider>", "Semantic provider: codex or openai", "codex")
    .action(async (task: string, options: Record<string, unknown>) => {
      if (!options.dryRun && !options.allowNetwork) {
        throw new BriefOpsError("Live Relay prepare requires --allow-network. Use --dry-run to inspect evidence locally.");
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
        network_permitted: Boolean(options.allowNetwork),
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

      if (!options.dryRun) {
        try {
          const contract = await buildRelayContract({
            task,
            runId,
            baselineSha: git.baselineSha,
            headSha: git.headSha,
            evidence: collection.evidence,
            provider: semanticProvider(String(options.provider))
          });
          await writeTextFileAtomic(path.join(runDir, "contract.json"), `${JSON.stringify(contract, null, 2)}\n`);
          console.log(`Relay contract saved: ${path.join(runDir, "contract.json")}`);
        } catch (error) {
          await writeRelaySemanticFailure(runDir, error);
          throw error;
        }
      }

      console.log(`Relay dry run saved: ${runDir}`);
      console.log(`Evidence: ${collection.evidence.length}`);
      console.log(`Included files: ${includedPaths.length}`);
    });

  relay
    .command("demo")
    .description("Create a complete API-key-free Relay demonstration run.")
    .action(async () => {
      const cwd = process.cwd();
      await initWorkspace(cwd);
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
    .option("--collect-diff", "Collect Git hunk evidence without performing semantic analysis.")
    .option("--allow-network", "Explicitly allow a semantic provider call.")
    .option("--provider <provider>", "Semantic provider: codex or openai", "codex")
    .action(async (options: { run: string; collectDiff?: boolean; allowNetwork?: boolean; provider: string }) => {
      const cwd = process.cwd();
      await requireWorkspace(cwd);
      if (options.collectDiff) {
        const runDir = await resolveRelayRunDirectory(cwd, options.run);
        const manifest = relayManifestSchema.parse(
          JSON.parse(await readTextFile(path.join(runDir, "manifest.json"))) as unknown
        );
        const evidence = await collectRelayDiffEvidence({
          cwd,
          baselineSha: manifest.baseline_sha,
          headSha: manifest.head_sha
        });
        await writeTextFileAtomic(path.join(runDir, "diff-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
        console.log(`Relay diff evidence saved: ${path.join(runDir, "diff-evidence.json")}`);
        console.log(`Change evidence: ${evidence.length}`);
        return;
      }
      if (options.allowNetwork) {
        const runDir = await resolveRelayRunDirectory(cwd, options.run, ["manifest.json", "contract.json", "evidence.json"]);
        const [manifest, contract, sourceEvidence] = await Promise.all([
          readTextFile(path.join(runDir, "manifest.json")).then((raw) => relayManifestSchema.parse(JSON.parse(raw) as unknown)),
          readTextFile(path.join(runDir, "contract.json")).then((raw) => JSON.parse(raw) as unknown),
          readTextFile(path.join(runDir, "evidence.json")).then((raw) => JSON.parse(raw) as unknown)
        ]);
        const changeEvidence = await collectRelayDiffEvidence({ cwd, baselineSha: manifest.baseline_sha, headSha: manifest.head_sha });
        const evidence = [...(sourceEvidence as unknown[]), ...changeEvidence];
        await writeTextFileAtomic(path.join(runDir, "diff-evidence.json"), `${JSON.stringify(changeEvidence, null, 2)}\n`);
        try {
          const audit = await buildRelayAudit({ contract, evidence, provider: semanticProvider(options.provider) });
          await writeTextFileAtomic(path.join(runDir, "audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
          console.log(`Relay audit saved: ${path.join(runDir, "audit.json")}`);
          console.log(`Integrity Score: ${audit.score} · Completion Gate: ${audit.completion_gate.toUpperCase()}`);
        } catch (error) {
          await writeRelaySemanticFailure(runDir, error);
          throw error;
        }
        return;
      }
      const runDir = await resolveRelayRunDirectory(cwd, options.run, ["contract.json", "audit.json", "evidence.json"]);
      const [contract, audit, evidence] = await Promise.all([
        readTextFile(path.join(runDir, "contract.json")).then((raw) => JSON.parse(raw) as unknown),
        readTextFile(path.join(runDir, "audit.json")).then((raw) => JSON.parse(raw) as unknown),
        readRelayRunEvidence(runDir)
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
          readRelayRunEvidence(runDir)
        ]);
        const outputName = name === "handoff" ? "handoff.md" : "report.html";
        await writeTextFileAtomic(path.join(runDir, outputName), render({ contract, audit, evidence }));
        console.log(`Relay ${name} saved: ${path.join(runDir, outputName)}`);
      });
  }
}
