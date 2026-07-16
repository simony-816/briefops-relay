import { auditReportSchema, executionContractSchema, relayEvidenceSchema } from "../schemas/relay.js";
import { createRelayDemoArtifacts } from "./relayDemo.js";
import { validateRelayAudit, validateRelayContract } from "./relayContract.js";

export type RelayDemoEvaluation = {
  expected_violations: string[];
  detected_violations: string[];
  precision: number;
  recall: number;
  valid_evidence_reference_rate: number;
  scenario_count: number;
  rejected_invalid_artifacts: number;
  scenarios: Array<{ id: string; status: "pass" | "fail" }>;
};

function cloneArtifact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function evaluateScenario(id: string, expectsRejection: boolean, verify: () => void): { id: string; status: "pass" | "fail" } {
  try {
    verify();
    return { id, status: expectsRejection ? "fail" : "pass" };
  } catch {
    return { id, status: expectsRejection ? "pass" : "fail" };
  }
}

export function runRelayDemoEvaluation(): RelayDemoEvaluation {
  const artifacts = createRelayDemoArtifacts();
  const evidence = relayEvidenceSchema.array().parse(JSON.parse(artifacts["evidence.json"] as string));
  const contract = validateRelayContract(
    executionContractSchema.parse(JSON.parse(artifacts["contract.json"] as string)),
    evidence
  );
  const audit = validateRelayAudit(
    contract,
    auditReportSchema.parse(JSON.parse(artifacts["audit.json"] as string)),
    evidence
  );
  const expectedViolations = ["C-001"];
  const detectedViolations = audit.findings
    .filter((finding) => finding.verdict === "violated")
    .map((finding) => finding.contract_id)
    .sort();
  const truePositives = detectedViolations.filter((id) => expectedViolations.includes(id)).length;
  const referencedIds = audit.findings.flatMap((finding) => finding.evidence_ids);
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const scenarios = [
    evaluateScenario("missing-request-id", false, () => {
      if (!detectedViolations.includes("C-001")) throw new Error("Expected seeded violation was not detected.");
    }),
    evaluateScenario("unknown-evidence-id", true, () => {
      const invalid = cloneArtifact(audit);
      invalid.findings[0]!.evidence_ids = ["src_ffffffffffffffff"];
      validateRelayAudit(contract, invalid, evidence);
    }),
    evaluateScenario("duplicate-finding", true, () => {
      const invalid = cloneArtifact(audit);
      invalid.findings.push(cloneArtifact(invalid.findings[0]!));
      validateRelayAudit(contract, invalid, evidence);
    }),
    evaluateScenario("missing-finding", true, () => {
      const invalid = cloneArtifact(audit);
      invalid.findings = invalid.findings.slice(0, 1);
      validateRelayAudit(contract, invalid, evidence);
    }),
    evaluateScenario("score-tampering", true, () => {
      const invalid = cloneArtifact(audit);
      invalid.score = 100;
      validateRelayAudit(contract, invalid, evidence);
    }),
    evaluateScenario("all-met-control", false, () => {
      const control = cloneArtifact(audit);
      control.findings = control.findings.map((finding) => ({ ...finding, verdict: "met" as const }));
      control.score = 100;
      control.completion_gate = "pass";
      control.gate_reasons = [];
      validateRelayAudit(contract, control, evidence);
    })
  ];

  return {
    expected_violations: expectedViolations,
    detected_violations: detectedViolations,
    precision: detectedViolations.length === 0 ? 0 : truePositives / detectedViolations.length,
    recall: expectedViolations.length === 0 ? 1 : truePositives / expectedViolations.length,
    valid_evidence_reference_rate:
      referencedIds.length === 0 ? 1 : referencedIds.filter((id) => evidenceIds.has(id)).length / referencedIds.length,
    scenario_count: scenarios.length,
    rejected_invalid_artifacts: scenarios.filter((scenario) => ["unknown-evidence-id", "duplicate-finding", "missing-finding", "score-tampering"].includes(scenario.id) && scenario.status === "pass").length,
    scenarios
  };
}
