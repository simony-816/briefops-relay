import { z } from "zod";
import { auditReportSchema, auditFindingSchema, executionContractSchema, relayEvidenceSchema, type ExecutionContract } from "../schemas/relay.js";
import { BriefOpsError } from "./errors.js";
import { validateRelayAudit, validateRelayContract } from "./relayContract.js";
import { calculateRelayIntegrity } from "./relayScore.js";

const contractCandidateSchema = z.object({
  kind: z.enum(["requirement", "constraint", "decision", "risk"]),
  priority: z.enum(["required", "important", "optional"]),
  statement: z.string().min(1),
  evidence_ids: z.array(z.string()).min(1),
  verification: z.string().min(1),
  confidence: z.number().min(0).max(1)
});
const contractOutputSchema = z.object({ items: z.array(contractCandidateSchema).min(1) });
const auditOutputSchema = z.object({ findings: z.array(auditFindingSchema).min(1) });

export type RelaySemanticProvider = { generate(request: { prompt: string; schema: Record<string, unknown>; schemaName: string }): Promise<unknown> };

export class RelaySemanticOutputError extends BriefOpsError {
  readonly name = "RelaySemanticOutputError";

  constructor(
    readonly stage: "contract" | "audit",
    readonly raw: unknown,
    cause: unknown
  ) {
    super(`Relay ${stage} output failed validation: ${cause instanceof Error ? cause.message : "Unknown validation error."}`);
  }
}

export function serializeRelaySemanticFailure(error: RelaySemanticOutputError): {
  stage: "contract" | "audit";
  message: string;
  raw: unknown;
} {
  return { stage: error.stage, message: error.message, raw: error.raw };
}

const contractSchema: Record<string, unknown> = {
  type: "object", additionalProperties: false, required: ["items"], properties: {
    items: { type: "array", items: { type: "object", additionalProperties: false, required: ["kind", "priority", "statement", "evidence_ids", "verification", "confidence"], properties: {
      kind: { type: "string", enum: ["requirement", "constraint", "decision", "risk"] }, priority: { type: "string", enum: ["required", "important", "optional"] }, statement: { type: "string" }, evidence_ids: { type: "array", items: { type: "string" } }, verification: { type: "string" }, confidence: { type: "number" }
    } } }
  }
};
const auditSchema: Record<string, unknown> = {
  type: "object", additionalProperties: false, required: ["findings"], properties: {
    findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["contract_id", "verdict", "severity", "evidence_ids", "explanation", "recommended_action"], properties: {
      contract_id: { type: "string" }, verdict: { type: "string", enum: ["met", "at_risk", "violated", "unverified"] }, severity: { type: "string", enum: ["blocker", "major", "minor"] }, evidence_ids: { type: "array", items: { type: "string" } }, explanation: { type: "string" }, recommended_action: { type: "string" }
    } } }
  }
};

export async function buildRelayContract(input: {
  task: string;
  runId: string;
  baselineSha: string;
  headSha: string;
  evidence: unknown;
  provider: RelaySemanticProvider;
}): Promise<ExecutionContract> {
  const evidence = relayEvidenceSchema.array().parse(input.evidence);
  const raw = await input.provider.generate({
    schemaName: "relay_contract",
    schema: contractSchema,
    prompt: `Create only JSON for an execution contract. Task: ${input.task}\nUse only these evidence IDs: ${JSON.stringify(evidence)}`
  });
  try {
    const output = contractOutputSchema.parse(raw);
    const contract = executionContractSchema.parse({
      schema_version: 1,
      run_id: input.runId,
      task: input.task,
      baseline_sha: input.baselineSha,
      head_sha: input.headSha,
      items: output.items.map((item, index) => ({ ...item, id: `C-${String(index + 1).padStart(3, "0")}` }))
    });
    return validateRelayContract(contract, evidence);
  } catch (error) {
    throw new RelaySemanticOutputError("contract", raw, error);
  }
}

export async function buildRelayAudit(input: {
  contract: unknown;
  evidence: unknown;
  provider: RelaySemanticProvider;
}) {
  const evidence = relayEvidenceSchema.array().parse(input.evidence);
  const contract = validateRelayContract(input.contract, evidence.filter((item) => item.kind === "source"));
  const raw = await input.provider.generate({
    schemaName: "relay_audit",
    schema: auditSchema,
    prompt: `Create only JSON audit findings for every contract item. Contract: ${JSON.stringify(contract)}\nEvidence: ${JSON.stringify(evidence)}`
  });
  try {
    const output = auditOutputSchema.parse(raw);
    const verdicts = new Map(output.findings.map((finding) => [finding.contract_id, finding.verdict]));
    const integrity = calculateRelayIntegrity(contract.items.map((item) => ({ id: item.id, priority: item.priority, verdict: verdicts.get(item.id) ?? "unverified" })));
    const audit = auditReportSchema.parse({
      schema_version: 1,
      run_id: contract.run_id,
      baseline_sha: contract.baseline_sha,
      head_sha: contract.head_sha,
      findings: output.findings,
      score: integrity.score,
      completion_gate: integrity.completionGate,
      gate_reasons: integrity.gateReasons
    });
    return validateRelayAudit(contract, audit, evidence);
  } catch (error) {
    throw new RelaySemanticOutputError("audit", raw, error);
  }
}
