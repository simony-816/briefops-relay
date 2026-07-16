import { describe, expect, it } from "vitest";

describe("Relay semantic workflow", () => {
  it("builds an evidence-grounded contract and deterministic audit from a provider", async () => {
    const module = await import("../src/core/relaySemantic.js").catch(() => undefined);
    const buildContract = (module as { buildRelayContract?: (input: unknown) => Promise<unknown> } | undefined)?.buildRelayContract;
    const buildAudit = (module as { buildRelayAudit?: (input: unknown) => Promise<unknown> } | undefined)?.buildRelayAudit;
    expect(buildContract).toBeTypeOf("function");
    expect(buildAudit).toBeTypeOf("function");
    if (!buildContract || !buildAudit) return;
    const evidence = [{ id: "src_0123456789abcdef", kind: "source", source_type: "repository-file", path: "docs/adr.md", start_line: 1, end_line: 1, content_hash: "a".repeat(64), content: "Errors include requestId.", truncated: false }];
    const provider = { generate: async () => ({ items: [{ kind: "constraint", priority: "required", statement: "Errors include requestId.", evidence_ids: ["src_0123456789abcdef"], verification: "Check error responses.", confidence: 1 }] }) };
    const contract = await buildContract({ task: "Add endpoint", runId: "relay_20260715_135000_001", baselineSha: "a".repeat(40), headSha: "b".repeat(40), evidence, provider });
    expect(contract).toMatchObject({ items: [{ id: "C-001" }] });
    const audit = await buildAudit({ contract, evidence, provider: { generate: async () => ({ findings: [{ contract_id: "C-001", verdict: "met", severity: "minor", evidence_ids: ["src_0123456789abcdef"], explanation: "Verified.", recommended_action: "No action required." }] }) } });
    expect(audit).toMatchObject({ score: 100, completion_gate: "pass" });
  });

  it("retains raw audit output when semantic validation rejects it", async () => {
    const module = await import("../src/core/relaySemantic.js").catch(() => undefined);
    const buildAudit = (module as { buildRelayAudit?: (input: unknown) => Promise<unknown> } | undefined)?.buildRelayAudit;
    const SemanticOutputError = (module as { RelaySemanticOutputError?: new (...args: never[]) => Error } | undefined)
      ?.RelaySemanticOutputError;
    expect(buildAudit).toBeTypeOf("function");
    expect(SemanticOutputError).toBeTypeOf("function");
    if (!buildAudit || !SemanticOutputError) return;

    const evidence = [{ id: "src_0123456789abcdef", kind: "source", source_type: "repository-file", path: "docs/adr.md", start_line: 1, end_line: 1, content_hash: "a".repeat(64), content: "Errors include requestId.", truncated: false }];
    const contract = {
      schema_version: 1,
      run_id: "relay_20260715_135000_001",
      task: "Add endpoint",
      baseline_sha: "a".repeat(40),
      head_sha: "b".repeat(40),
      items: [{ id: "C-001", kind: "constraint", priority: "required", statement: "Errors include requestId.", evidence_ids: ["src_0123456789abcdef"], verification: "Check error responses.", confidence: 1 }]
    };
    const raw = { findings: [{ contract_id: "C-999", verdict: "met", severity: "minor", evidence_ids: ["src_0123456789abcdef"], explanation: "Wrong item.", recommended_action: "No action required." }] };

    await expect(buildAudit({ contract, evidence, provider: { generate: async () => raw } })).rejects.toMatchObject({
      name: "RelaySemanticOutputError",
      stage: "audit",
      raw
    });
  });

  it("serializes rejected semantic output for a local run artifact", async () => {
    const module = await import("../src/core/relaySemantic.js").catch(() => undefined);
    const SemanticOutputError = (module as { RelaySemanticOutputError?: new (stage: "contract" | "audit", raw: unknown, cause: unknown) => Error } | undefined)
      ?.RelaySemanticOutputError;
    const serialize = (module as { serializeRelaySemanticFailure?: (error: Error) => unknown } | undefined)
      ?.serializeRelaySemanticFailure;
    expect(SemanticOutputError).toBeTypeOf("function");
    expect(serialize).toBeTypeOf("function");
    if (!SemanticOutputError || !serialize) return;

    const raw = { findings: [] };
    expect(serialize(new SemanticOutputError("audit", raw, new Error("Missing findings.")))).toEqual({
      stage: "audit",
      message: "Relay audit output failed validation: Missing findings.",
      raw
    });
  });
});
