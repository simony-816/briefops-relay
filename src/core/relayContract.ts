import { auditReportSchema, executionContractSchema, relayEvidenceSchema, type ExecutionContract, type RelayAuditReport, type RelayEvidence } from "../schemas/relay.js";
import { BriefOpsError } from "./errors.js";
import { calculateRelayIntegrity } from "./relayScore.js";

function parseEvidence(evidence: unknown): RelayEvidence[] {
  const parsed = relayEvidenceSchema.array().parse(evidence);
  const ids = new Set<string>();
  for (const item of parsed) {
    if (ids.has(item.id)) throw new BriefOpsError(`Relay evidence contains a duplicate evidence ID: ${item.id}`);
    ids.add(item.id);
  }
  return parsed;
}

function assertKnownEvidenceIds(ids: string[], evidenceIds: Set<string>, label: string): void {
  for (const id of ids) {
    if (!evidenceIds.has(id)) throw new BriefOpsError(`${label} references an unknown evidence ID: ${id}`);
  }
}

export function validateRelayContract(contract: unknown, evidence: unknown): ExecutionContract {
  const parsed = executionContractSchema.parse(contract);
  const parsedEvidence = parseEvidence(evidence);
  const evidenceIds = new Set(parsedEvidence.map((item) => item.id));
  const contractIds = new Set<string>();

  for (const item of parsed.items) {
    if (contractIds.has(item.id)) throw new BriefOpsError(`Execution Contract contains a duplicate contract ID: ${item.id}`);
    contractIds.add(item.id);
    assertKnownEvidenceIds(item.evidence_ids, evidenceIds, `Contract item ${item.id}`);
  }

  return parsed;
}

export function validateRelayAudit(
  contract: unknown,
  audit: unknown,
  evidence: unknown
): RelayAuditReport {
  const parsedContract = executionContractSchema.parse(contract);
  const parsedAudit = auditReportSchema.parse(audit);
  const parsedEvidence = parseEvidence(evidence);

  if (parsedAudit.run_id !== parsedContract.run_id) {
    throw new BriefOpsError("Audit report run ID does not match its Execution Contract.");
  }
  if (parsedAudit.baseline_sha !== parsedContract.baseline_sha || parsedAudit.head_sha !== parsedContract.head_sha) {
    throw new BriefOpsError("Audit report Git SHAs do not match its Execution Contract.");
  }

  const evidenceIds = new Set(parsedEvidence.map((item) => item.id));
  const findingsByContract = new Map<string, (typeof parsedAudit.findings)[number]>();
  const contractIds = new Set(parsedContract.items.map((item) => item.id));
  for (const finding of parsedAudit.findings) {
    if (!contractIds.has(finding.contract_id)) {
      throw new BriefOpsError(`Audit finding references an unknown contract ID: ${finding.contract_id}`);
    }
    if (findingsByContract.has(finding.contract_id)) {
      throw new BriefOpsError(`Audit report has more than one finding for contract item ${finding.contract_id}.`);
    }
    assertKnownEvidenceIds(finding.evidence_ids, evidenceIds, `Audit finding ${finding.contract_id}`);
    findingsByContract.set(finding.contract_id, finding);
  }

  const integrityItems = parsedContract.items.map((item) => {
    const finding = findingsByContract.get(item.id);
    if (!finding) throw new BriefOpsError(`Audit report must have exactly one finding for contract item ${item.id}.`);
    return { id: item.id, priority: item.priority, verdict: finding.verdict };
  });
  const expected = calculateRelayIntegrity(integrityItems);
  if (parsedAudit.score !== expected.score) {
    throw new BriefOpsError("Audit report score does not match the deterministic integrity score.");
  }
  if (parsedAudit.completion_gate !== expected.completionGate) {
    throw new BriefOpsError("Audit report completion gate does not match the deterministic integrity gate.");
  }
  if (JSON.stringify(parsedAudit.gate_reasons) !== JSON.stringify(expected.gateReasons)) {
    throw new BriefOpsError("Audit report gate reasons do not match the deterministic integrity gate.");
  }

  return parsedAudit;
}
