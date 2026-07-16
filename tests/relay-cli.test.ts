import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/cli.js";
import { initWorkspace } from "../src/core/workspace.js";
import { withTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

describe("Relay CLI", () => {
  it("registers an additive Relay command group", () => {
    const program = buildProgram();

    expect(program.helpInformation()).toContain("relay");
    expect(program.helpInformation()).toContain("evidence-backed execution contracts");
  });

  it("offers an offline prepare dry run", () => {
    const relay = buildProgram().commands.find((command) => command.name() === "relay");
    const prepare = relay?.commands.find((command) => command.name() === "prepare");

    expect(prepare).toBeDefined();
    expect(prepare?.helpInformation()).toContain("--dry-run");
  });

  it("offers offline demo, handoff, and report commands", () => {
    const relay = buildProgram().commands.find((command) => command.name() === "relay");
    const commandNames = relay?.commands.map((command) => command.name());

    expect(commandNames).toEqual(expect.arrayContaining(["audit", "demo", "handoff", "report"]));
  });

  it("offers a Codex provider readiness check without a semantic call", () => {
    const relay = buildProgram().commands.find((command) => command.name() === "relay");
    const doctor = relay?.commands.find((command) => command.name() === "doctor");

    expect(doctor).toBeDefined();
    expect(doctor?.description()).toContain("Codex");
  });

  it("collects stable line-aware evidence while excluding secret files", async () => {
    const module = await import("../src/core/relayEvidence.js").catch(() => undefined);
    const collect = (module as
      | {
          collectRelayEvidence?: (options: {
            root: string;
            maxFiles: number;
            maxFileBytes: number;
            maxChunkBytes: number;
          }) => Promise<{
            evidence: Array<{ id: string; path?: string; start_line?: number; end_line?: number }>;
            excluded: Record<string, number>;
          }>;
        }
      | undefined)?.collectRelayEvidence;

    expect(collect).toBeTypeOf("function");
    if (!collect) return;

    await withTempDir(async (dir) => {
      await fs.mkdir(path.join(dir, "node_modules", "ignored"), { recursive: true });
      await fs.writeFile(path.join(dir, "README.md"), "# Relay\n\nKeep evidence local.\n", "utf8");
      await fs.writeFile(path.join(dir, ".env"), "OPENAI_API_KEY=secret\n", "utf8");
      await fs.writeFile(path.join(dir, "node_modules", "ignored", "index.js"), "ignored\n", "utf8");

      const result = await collect({
        root: dir,
        maxFiles: 10,
        maxFileBytes: 1_000,
        maxChunkBytes: 1_000
      });

      expect(result.evidence).toEqual([
        expect.objectContaining({
          id: expect.stringMatching(/^src_[a-f0-9]{16}$/),
          path: "README.md",
          start_line: 1,
          end_line: 3
        })
      ]);
      expect(result.excluded).toMatchObject({ secret: 1, dependency: 1 });
    });
  });

  it("writes a reviewable offline manifest for relay prepare", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace(dir);
      await fs.writeFile(path.join(dir, "README.md"), "# Relay\n", "utf8");
      await execFileAsync("git", ["init"], { cwd: dir });
      await execFileAsync("git", ["config", "user.email", "relay@example.test"], { cwd: dir });
      await execFileAsync("git", ["config", "user.name", "Relay Test"], { cwd: dir });
      await execFileAsync("git", ["add", "README.md"], { cwd: dir });
      await execFileAsync("git", ["commit", "-m", "baseline"], { cwd: dir });
      await fs.writeFile(path.join(dir, ".env"), "OPENAI_API_KEY=secret\n", "utf8");

      const originalCwd = process.cwd();
      process.chdir(dir);
      try {
        await buildProgram().parseAsync(["node", "briefops", "relay", "prepare", "Inspect docs", "--dry-run"]);
      } finally {
        process.chdir(originalCwd);
      }

      const runs = await fs.readdir(path.join(dir, ".briefops", "relay", "runs"));
      expect(runs).toHaveLength(1);
      const manifest = JSON.parse(
        await fs.readFile(path.join(dir, ".briefops", "relay", "runs", runs[0] as string, "manifest.json"), "utf8")
      ) as {
        task: string;
        network_permitted: boolean;
        included_paths: string[];
        excluded: Record<string, number>;
        baseline_sha: string;
        head_sha: string;
        dirty: boolean;
      };
      expect(manifest).toMatchObject({
        task: "Inspect docs",
        network_permitted: false,
        included_paths: ["README.md"],
        excluded: { secret: 1 }
      });
      expect(manifest.baseline_sha).toMatch(/^[a-f0-9]{40}$/);
      expect(manifest.head_sha).toBe(manifest.baseline_sha);
      expect(manifest.dirty).toBe(true);
    });
  });

  it("records explicit network permission even when a live provider is rejected", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace(dir);
      await fs.writeFile(path.join(dir, "README.md"), "# Relay\n", "utf8");
      await execFileAsync("git", ["init"], { cwd: dir });
      await execFileAsync("git", ["config", "user.email", "relay@example.test"], { cwd: dir });
      await execFileAsync("git", ["config", "user.name", "Relay Test"], { cwd: dir });
      await execFileAsync("git", ["add", "README.md"], { cwd: dir });
      await execFileAsync("git", ["commit", "-m", "baseline"], { cwd: dir });

      const originalCwd = process.cwd();
      process.chdir(dir);
      try {
        await expect(
          buildProgram().parseAsync([
            "node", "briefops", "relay", "prepare", "Inspect docs", "--allow-network", "--provider", "unsupported"
          ])
        ).rejects.toThrow("Unsupported Relay provider");
      } finally {
        process.chdir(originalCwd);
      }

      const runs = await fs.readdir(path.join(dir, ".briefops", "relay", "runs"));
      const manifest = JSON.parse(
        await fs.readFile(path.join(dir, ".briefops", "relay", "runs", runs[0] as string, "manifest.json"), "utf8")
      ) as { network_permitted: boolean };
      expect(manifest.network_permitted).toBe(true);
    });
  });

  it("collects real Git diff evidence for a prepared run without semantic analysis", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace(dir);
      await fs.writeFile(path.join(dir, "README.md"), "baseline\n", "utf8");
      await execFileAsync("git", ["init"], { cwd: dir });
      await execFileAsync("git", ["config", "user.email", "relay@example.test"], { cwd: dir });
      await execFileAsync("git", ["config", "user.name", "Relay Test"], { cwd: dir });
      await execFileAsync("git", ["add", "README.md"], { cwd: dir });
      await execFileAsync("git", ["commit", "-m", "baseline"], { cwd: dir });

      const originalCwd = process.cwd();
      process.chdir(dir);
      try {
        await buildProgram().parseAsync(["node", "briefops", "relay", "prepare", "Inspect docs", "--dry-run"]);
        await fs.writeFile(path.join(dir, "README.md"), "changed\n", "utf8");
        const runs = await fs.readdir(path.join(dir, ".briefops", "relay", "runs"));
        await buildProgram().parseAsync(["node", "briefops", "relay", "audit", "--run", runs[0] as string, "--collect-diff"]);
        const diffEvidence = JSON.parse(
          await fs.readFile(path.join(dir, ".briefops", "relay", "runs", runs[0] as string, "diff-evidence.json"), "utf8")
        ) as Array<{ path: string }>;
        expect(diffEvidence).toEqual([expect.objectContaining({ path: "README.md" })]);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  it("validates Relay manifests without absolute paths", async () => {
    const module = await import("../src/schemas/relay.js").catch(() => undefined);
    const schema = (module as { relayManifestSchema?: { parse: (value: unknown) => unknown } } | undefined)
      ?.relayManifestSchema;

    expect(schema).toBeDefined();
    if (!schema) return;

    expect(
      schema.parse({
        schema_version: 1,
        run_id: "relay_20260715_135000_001",
        task: "Inspect docs",
        network_permitted: false,
        evidence_count: 1,
        total_bytes: 12,
        included_paths: ["README.md"],
        excluded: { secret: 1 },
        baseline_sha: "a".repeat(40),
        head_sha: "b".repeat(40),
        dirty: false
      })
    ).toBeTruthy();
    expect(() =>
      schema.parse({
        schema_version: 1,
        run_id: "relay_20260715_135000_001",
        task: "Inspect docs",
        network_permitted: false,
        evidence_count: 1,
        total_bytes: 12,
        included_paths: ["/Users/simon/private.txt"],
        excluded: {},
        baseline_sha: "a".repeat(40),
        head_sha: "b".repeat(40),
        dirty: false
      })
    ).toThrow();
  });

  it("records the Git baseline and dirty state for a Relay run", async () => {
    const module = await import("../src/core/relayGit.js").catch(() => undefined);
    const inspect = (module as
      | {
          inspectRelayGit?: (options: { cwd: string; baselineRef: string }) => Promise<{
            root: string;
            baselineSha: string;
            headSha: string;
            dirty: boolean;
          }>;
        }
      | undefined)?.inspectRelayGit;

    expect(inspect).toBeTypeOf("function");
    if (!inspect) return;

    await withTempDir(async (dir) => {
      await execFileAsync("git", ["init"], { cwd: dir });
      await execFileAsync("git", ["config", "user.email", "relay@example.test"], { cwd: dir });
      await execFileAsync("git", ["config", "user.name", "Relay Test"], { cwd: dir });
      await fs.writeFile(path.join(dir, "README.md"), "baseline\n", "utf8");
      await execFileAsync("git", ["add", "README.md"], { cwd: dir });
      await execFileAsync("git", ["commit", "-m", "baseline"], { cwd: dir });
      await fs.writeFile(path.join(dir, "README.md"), "changed\n", "utf8");

      const metadata = await inspect({ cwd: dir, baselineRef: "HEAD" });
      expect(await fs.realpath(metadata.root)).toBe(await fs.realpath(dir));
      expect(metadata.baselineSha).toMatch(/^[a-f0-9]{40}$/);
      expect(metadata.headSha).toBe(metadata.baselineSha);
      expect(metadata.dirty).toBe(true);
    });
  });

  it("computes an evidence-independent integrity score and blocks required gaps", async () => {
    const module = await import("../src/core/relayScore.js").catch(() => undefined);
    const calculate = (module as
      | {
          calculateRelayIntegrity?: (items: Array<{
            id: string;
            priority: "required" | "important" | "optional";
            verdict: "met" | "at_risk" | "violated" | "unverified";
          }>) => { score: number; completionGate: "pass" | "fail"; gateReasons: string[] };
        }
      | undefined)?.calculateRelayIntegrity;

    expect(calculate).toBeTypeOf("function");
    if (!calculate) return;

    expect(
      calculate([
        { id: "C-001", priority: "required", verdict: "met" },
        { id: "C-002", priority: "important", verdict: "at_risk" },
        { id: "C-003", priority: "optional", verdict: "violated" }
      ])
    ).toEqual({ score: 67, completionGate: "pass", gateReasons: [] });
    expect(calculate([{ id: "C-001", priority: "required", verdict: "unverified" }])).toEqual({
      score: 0,
      completionGate: "fail",
      gateReasons: ["Required contract item C-001 is unverified."]
    });
  });

  it("collects hunk-level change evidence from the baseline through the worktree", async () => {
    const module = await import("../src/core/relayDiff.js").catch(() => undefined);
    const collect = (module as
      | {
          collectRelayDiffEvidence?: (options: { cwd: string; baselineSha: string; headSha: string }) => Promise<
            Array<{ id: string; path?: string; new_start_line?: number; new_end_line?: number; content: string }>
          >;
        }
      | undefined)?.collectRelayDiffEvidence;

    expect(collect).toBeTypeOf("function");
    if (!collect) return;

    await withTempDir(async (dir) => {
      await execFileAsync("git", ["init"], { cwd: dir });
      await execFileAsync("git", ["config", "user.email", "relay@example.test"], { cwd: dir });
      await execFileAsync("git", ["config", "user.name", "Relay Test"], { cwd: dir });
      await fs.writeFile(path.join(dir, "customer.ts"), "export const requestId = 'old';\n", "utf8");
      await execFileAsync("git", ["add", "customer.ts"], { cwd: dir });
      await execFileAsync("git", ["commit", "-m", "baseline"], { cwd: dir });
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: dir });
      await fs.writeFile(path.join(dir, "customer.ts"), "export const requestId = 'new';\n", "utf8");

      const evidence = await collect({ cwd: dir, baselineSha: stdout.trim(), headSha: stdout.trim() });
      expect(evidence).toEqual([
        expect.objectContaining({
          id: expect.stringMatching(/^chg_[a-f0-9]{16}$/),
          path: "customer.ts",
          new_start_line: 1,
          new_end_line: 1,
          content: expect.stringContaining("+export const requestId = 'new';")
        })
      ]);
    });
  });

  it("accepts only execution contracts grounded in known source evidence", async () => {
    const module = await import("../src/core/relayContract.js").catch(() => undefined);
    const validate = (module as
      | {
          validateRelayContract?: (contract: unknown, evidence: unknown) => {
            items: Array<{ id: string }>;
          };
        }
      | undefined)?.validateRelayContract;

    expect(validate).toBeTypeOf("function");
    if (!validate) return;

    const evidence = [
      {
        id: "src_0123456789abcdef",
        kind: "source",
        source_type: "repository-file",
        path: "docs/adr/api-errors.md",
        start_line: 1,
        end_line: 3,
        content_hash: "a".repeat(64),
        content: "Public errors include requestId.",
        truncated: false
      }
    ];
    const contract = {
      schema_version: 1,
      run_id: "relay_20260715_135000_001",
      task: "Add bulk deletion",
      baseline_sha: "a".repeat(40),
      head_sha: "a".repeat(40),
      items: [
        {
          id: "C-001",
          kind: "constraint",
          priority: "required",
          statement: "Public errors include requestId.",
          evidence_ids: ["src_0123456789abcdef"],
          verification: "Check all public error responses.",
          confidence: 1
        }
      ]
    };

    expect(validate(contract, evidence).items).toHaveLength(1);
    expect(() =>
      validate({ ...contract, items: [{ ...contract.items[0], evidence_ids: ["src_ffffffffffffffff"] }] }, evidence)
    ).toThrow("unknown evidence ID");
  });

  it("rejects audit reports that omit contract items or claim a model-selected score", async () => {
    const module = await import("../src/core/relayContract.js").catch(() => undefined);
    const validateContract = (module as { validateRelayContract?: (contract: unknown, evidence: unknown) => unknown } | undefined)
      ?.validateRelayContract;
    const validateAudit = (module as
      | {
          validateRelayAudit?: (contract: unknown, audit: unknown, evidence: unknown) => {
            score: number;
            completion_gate: string;
          };
        }
      | undefined)?.validateRelayAudit;

    expect(validateContract).toBeTypeOf("function");
    expect(validateAudit).toBeTypeOf("function");
    if (!validateContract || !validateAudit) return;

    const sourceEvidence = {
      id: "src_0123456789abcdef",
      kind: "source",
      source_type: "repository-file",
      path: "docs/adr/api-errors.md",
      start_line: 1,
      end_line: 3,
      content_hash: "a".repeat(64),
      content: "Public errors include requestId.",
      truncated: false
    };
    const changeEvidence = {
      id: "chg_0123456789abcdef",
      kind: "change",
      source_type: "git-diff",
      path: "src/customer.ts",
      old_start_line: 1,
      old_end_line: 1,
      new_start_line: 1,
      new_end_line: 1,
      base_sha: "a".repeat(40),
      head_sha: "b".repeat(40),
      content_hash: "b".repeat(64),
      content: "+return notFound();",
      truncated: false
    };
    const contract = {
      schema_version: 1,
      run_id: "relay_20260715_135000_001",
      task: "Add bulk deletion",
      baseline_sha: "a".repeat(40),
      head_sha: "b".repeat(40),
      items: [
        {
          id: "C-001",
          kind: "constraint",
          priority: "required",
          statement: "Public errors include requestId.",
          evidence_ids: [sourceEvidence.id],
          verification: "Check all public error responses.",
          confidence: 1
        }
      ]
    };
    const audit = {
      schema_version: 1,
      run_id: contract.run_id,
      baseline_sha: contract.baseline_sha,
      head_sha: contract.head_sha,
      findings: [
        {
          contract_id: "C-001",
          verdict: "violated",
          severity: "blocker",
          evidence_ids: [sourceEvidence.id, changeEvidence.id],
          explanation: "The new error bypasses requestId.",
          recommended_action: "Use the shared error helper."
        }
      ],
      score: 0,
      completion_gate: "fail",
      gate_reasons: ["Required contract item C-001 is violated."]
    };

    expect(validateAudit(validateContract(contract, [sourceEvidence]), audit, [sourceEvidence, changeEvidence])).toMatchObject({
      score: 0,
      completion_gate: "fail"
    });
    expect(() =>
      validateAudit(validateContract(contract, [sourceEvidence]), { ...audit, score: 100 }, [sourceEvidence, changeEvidence])
    ).toThrow("does not match the deterministic integrity score");
    expect(() =>
      validateAudit(validateContract(contract, [sourceEvidence]), { ...audit, findings: [] }, [sourceEvidence, changeEvidence])
    ).toThrow("must have exactly one finding");
  });

  it("renders a verified handoff from validated artifacts without absolute paths", async () => {
    const module = await import("../src/core/relayHandoff.js").catch(() => undefined);
    const render = (module as
      | {
          renderRelayHandoff?: (input: {
            contract: unknown;
            audit: unknown;
            evidence: unknown;
          }) => string;
        }
      | undefined)?.renderRelayHandoff;

    expect(render).toBeTypeOf("function");
    if (!render) return;

    const sourceEvidence = {
      id: "src_0123456789abcdef",
      kind: "source",
      source_type: "repository-file",
      path: "docs/adr/api-errors.md",
      start_line: 1,
      end_line: 3,
      content_hash: "a".repeat(64),
      content: "Public errors include requestId.",
      truncated: false
    };
    const changeEvidence = {
      id: "chg_0123456789abcdef",
      kind: "change",
      source_type: "git-diff",
      path: "src/customer.ts",
      old_start_line: 1,
      old_end_line: 1,
      new_start_line: 1,
      new_end_line: 1,
      base_sha: "a".repeat(40),
      head_sha: "b".repeat(40),
      content_hash: "b".repeat(64),
      content: "+return notFound();",
      truncated: false
    };
    const contract = {
      schema_version: 1,
      run_id: "relay_20260715_135000_001",
      task: "Add bulk deletion",
      baseline_sha: "a".repeat(40),
      head_sha: "b".repeat(40),
      items: [
        {
          id: "C-001",
          kind: "constraint",
          priority: "required",
          statement: "Public errors include requestId.",
          evidence_ids: [sourceEvidence.id],
          verification: "Check all public error responses.",
          confidence: 1
        }
      ]
    };
    const audit = {
      schema_version: 1,
      run_id: contract.run_id,
      baseline_sha: contract.baseline_sha,
      head_sha: contract.head_sha,
      findings: [
        {
          contract_id: "C-001",
          verdict: "violated",
          severity: "blocker",
          evidence_ids: [sourceEvidence.id, changeEvidence.id],
          explanation: "The new error bypasses requestId.",
          recommended_action: "Use the shared error helper."
        }
      ],
      score: 0,
      completion_gate: "fail",
      gate_reasons: ["Required contract item C-001 is violated."]
    };

    const handoff = render({ contract, audit, evidence: [sourceEvidence, changeEvidence] });
    expect(handoff).toContain("# BriefOps Relay — Verified Handoff");
    expect(handoff).toContain("C-001 · VIOLATED");
    expect(handoff).toContain("src/customer.ts");
    expect(handoff).not.toContain("/Users/");
  });

  it("renders a self-contained report that escapes artifact content", async () => {
    const module = await import("../src/core/relayReport.js").catch(() => undefined);
    const render = (module as
      | {
          renderRelayReport?: (input: {
            contract: unknown;
            audit: unknown;
            evidence: unknown;
          }) => string;
        }
      | undefined)?.renderRelayReport;

    expect(render).toBeTypeOf("function");
    if (!render) return;

    const sourceEvidence = {
      id: "src_0123456789abcdef",
      kind: "source",
      source_type: "repository-file",
      path: "docs/adr/api-errors.md",
      start_line: 1,
      end_line: 3,
      content_hash: "a".repeat(64),
      content: "Public errors include requestId.",
      truncated: false
    };
    const contract = {
      schema_version: 1,
      run_id: "relay_20260715_135000_001",
      task: "Add <script>alert(1)</script> safely",
      baseline_sha: "a".repeat(40),
      head_sha: "a".repeat(40),
      items: [
        {
          id: "C-001",
          kind: "constraint",
          priority: "required",
          statement: "Public errors include requestId.",
          evidence_ids: [sourceEvidence.id],
          verification: "Check all public error responses.",
          confidence: 1
        }
      ]
    };
    const audit = {
      schema_version: 1,
      run_id: contract.run_id,
      baseline_sha: contract.baseline_sha,
      head_sha: contract.head_sha,
      findings: [
        {
          contract_id: "C-001",
          verdict: "met",
          severity: "minor",
          evidence_ids: [sourceEvidence.id],
          explanation: "Verified.",
          recommended_action: "No action needed."
        }
      ],
      score: 100,
      completion_gate: "pass",
      gate_reasons: []
    };

    const report = render({ contract, audit, evidence: [sourceEvidence] });
    expect(report).toContain("<!doctype html>");
    expect(report).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(report).not.toContain("<script>alert(1)</script>");
    expect(report).not.toContain("https://");
    expect(report).not.toContain("src=\"");
  });

  it("creates an API-key-free demo run with report and handoff artifacts", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace(dir);
      const originalCwd = process.cwd();
      process.chdir(dir);
      try {
        await buildProgram().parseAsync(["node", "briefops", "relay", "demo"]);
        await buildProgram().parseAsync(["node", "briefops", "relay", "audit", "--run", "latest"]);
      } finally {
        process.chdir(originalCwd);
      }

      const runs = await fs.readdir(path.join(dir, ".briefops", "relay", "runs"));
      expect(runs).toHaveLength(1);
      const runDirectory = path.join(dir, ".briefops", "relay", "runs", runs[0] as string);
      await expect(fs.readFile(path.join(runDirectory, "contract.json"), "utf8")).resolves.toContain("C-002");
      await expect(fs.readFile(path.join(runDirectory, "audit.json"), "utf8")).resolves.toContain("violated");
      await expect(fs.readFile(path.join(runDirectory, "handoff.md"), "utf8")).resolves.toContain("Verified Handoff");
      await expect(fs.readFile(path.join(runDirectory, "report.html"), "utf8")).resolves.toContain("<!doctype html>");
    });
  });

  it("renders handoff and report when Git diff evidence is stored separately", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace(dir);
      const originalCwd = process.cwd();
      process.chdir(dir);
      try {
        await buildProgram().parseAsync(["node", "briefops", "relay", "demo"]);
        const runDir = path.join(dir, ".briefops", "relay", "runs", "relay_20260715_000000_001");
        const evidence = JSON.parse(await fs.readFile(path.join(runDir, "evidence.json"), "utf8")) as Array<{ kind: string }>;
        await fs.writeFile(path.join(runDir, "evidence.json"), `${JSON.stringify(evidence.filter((item) => item.kind === "source"), null, 2)}\n`, "utf8");
        await fs.writeFile(path.join(runDir, "diff-evidence.json"), `${JSON.stringify(evidence.filter((item) => item.kind === "change"), null, 2)}\n`, "utf8");
        await buildProgram().parseAsync(["node", "briefops", "relay", "handoff", "--run", "latest"]);
        await buildProgram().parseAsync(["node", "briefops", "relay", "report", "--run", "latest"]);
      } finally {
        process.chdir(originalCwd);
      }

      const runDir = path.join(dir, ".briefops", "relay", "runs", "relay_20260715_000000_001");
      await expect(fs.readFile(path.join(runDir, "handoff.md"), "utf8")).resolves.toContain("src/routes/customers.ts");
      await expect(fs.readFile(path.join(runDir, "report.html"), "utf8")).resolves.toContain("src/routes/customers.ts");
    });
  });
});
