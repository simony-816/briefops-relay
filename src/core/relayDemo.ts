import { auditReportSchema, executionContractSchema, relayManifestSchema } from "../schemas/relay.js";
import { renderRelayHandoff } from "./relayHandoff.js";
import { renderRelayReport } from "./relayReport.js";
import { calculateRelayIntegrity } from "./relayScore.js";

const baselineSha = "1".repeat(40);
const headSha = "2".repeat(40);
const runId = "relay_20260715_000000_001";

export function createRelayDemoArtifacts(): Record<string, string> {
  const evidence = [
    {
      id: "src_0123456789abcdef",
      kind: "source" as const,
      source_type: "repository-file" as const,
      path: "docs/adr/0012-api-errors.md",
      start_line: 1,
      end_line: 3,
      content_hash: "a".repeat(64),
      content: "All public API errors must include a requestId and use createProblemDetails().",
      truncated: false
    },
    {
      id: "src_fedcba9876543210",
      kind: "source" as const,
      source_type: "repository-file" as const,
      path: "tests/customers.test.ts",
      start_line: 1,
      end_line: 3,
      content_hash: "b".repeat(64),
      content: "Bulk deletion requires an authorization test.",
      truncated: false
    },
    {
      id: "chg_0123456789abcdef",
      kind: "change" as const,
      source_type: "git-diff" as const,
      path: "src/routes/customers.ts",
      old_start_line: 80,
      old_end_line: 80,
      new_start_line: 80,
      new_end_line: 87,
      base_sha: baselineSha,
      head_sha: headSha,
      content_hash: "c".repeat(64),
      content: "+return res.status(404).json({ error: \"Not found\" });",
      truncated: false
    }
  ];
  const contract = executionContractSchema.parse({
    schema_version: 1,
    run_id: runId,
    task: "Add bulk deletion support to the customer API",
    baseline_sha: baselineSha,
    head_sha: headSha,
    items: [
      {
        id: "C-001",
        kind: "constraint",
        priority: "required",
        statement: "All public API errors include requestId and use the shared error helper.",
        evidence_ids: ["src_0123456789abcdef"],
        verification: "Inspect new error responses and their tests.",
        confidence: 1
      },
      {
        id: "C-002",
        kind: "requirement",
        priority: "important",
        statement: "Bulk deletion supports an authorized success path.",
        evidence_ids: ["src_fedcba9876543210"],
        verification: "Run the customer API test suite.",
        confidence: 0.9
      }
    ]
  });
  const integrity = calculateRelayIntegrity([
    { id: "C-001", priority: "required", verdict: "violated" },
    { id: "C-002", priority: "important", verdict: "met" }
  ]);
  const audit = auditReportSchema.parse({
    schema_version: 1,
    run_id: runId,
    baseline_sha: baselineSha,
    head_sha: headSha,
    findings: [
      {
        contract_id: "C-001",
        verdict: "violated",
        severity: "blocker",
        evidence_ids: ["src_0123456789abcdef", "chg_0123456789abcdef"],
        explanation: "The new 404 response bypasses the shared helper and does not include requestId.",
        recommended_action: "Use createProblemDetails() and add a requestId assertion."
      },
      {
        contract_id: "C-002",
        verdict: "met",
        severity: "minor",
        evidence_ids: ["src_fedcba9876543210"],
        explanation: "The authorized success path is covered.",
        recommended_action: "No action required."
      }
    ],
    score: integrity.score,
    completion_gate: integrity.completionGate,
    gate_reasons: integrity.gateReasons
  });
  const manifest = relayManifestSchema.parse({
    schema_version: 1,
    run_id: runId,
    task: contract.task,
    network_permitted: false,
    evidence_count: evidence.length,
    total_bytes: evidence.reduce((total, item) => total + Buffer.byteLength(item.content, "utf8"), 0),
    included_paths: ["docs/adr/0012-api-errors.md", "src/routes/customers.ts", "tests/customers.test.ts"],
    excluded: {},
    baseline_sha: baselineSha,
    head_sha: headSha,
    dirty: true
  });

  return {
    "manifest.json": `${JSON.stringify(manifest, null, 2)}\n`,
    "evidence.json": `${JSON.stringify(evidence, null, 2)}\n`,
    "contract.json": `${JSON.stringify(contract, null, 2)}\n`,
    "audit.json": `${JSON.stringify(audit, null, 2)}\n`,
    "handoff.md": renderRelayHandoff({ contract, audit, evidence }),
    "report.html": renderRelayReport({ contract, audit, evidence })
  };
}
