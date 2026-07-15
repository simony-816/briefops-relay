import { auditReportSchema, executionContractSchema, relayEvidenceSchema } from "../schemas/relay.js";
import { createRelayDemoArtifacts } from "./relayDemo.js";
import { validateRelayAudit, validateRelayContract } from "./relayContract.js";

export type RelayDemoEvaluation = {
  expected_violations: string[];
  detected_violations: string[];
  precision: number;
  recall: number;
  valid_evidence_reference_rate: number;
};

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

  return {
    expected_violations: expectedViolations,
    detected_violations: detectedViolations,
    precision: detectedViolations.length === 0 ? 0 : truePositives / detectedViolations.length,
    recall: expectedViolations.length === 0 ? 1 : truePositives / expectedViolations.length,
    valid_evidence_reference_rate:
      referencedIds.length === 0 ? 1 : referencedIds.filter((id) => evidenceIds.has(id)).length / referencedIds.length
  };
}
