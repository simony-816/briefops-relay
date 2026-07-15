import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/cli.js";
import { initWorkspace } from "../src/core/workspace.js";
import { withTempDir } from "./helpers.js";

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
      ) as { task: string; network_permitted: boolean; included_paths: string[]; excluded: Record<string, number> };
      expect(manifest).toMatchObject({
        task: "Inspect docs",
        network_permitted: false,
        included_paths: ["README.md"],
        excluded: { secret: 1 }
      });
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
        excluded: { secret: 1 }
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
        excluded: {}
      })
    ).toThrow();
  });
});
