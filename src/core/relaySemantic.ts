import { z } from "zod";
import { auditReportSchema, auditFindingSchema, executionContractSchema, relayEvidenceSchema, type ExecutionContract } from "../schemas/relay.js";
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

const contractSchema: Record<string, unknown> = { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array" } } };
const auditSchema: Record<string, unknown> = { type: "object", additionalProperties: false, required: ["findings"], properties: { findings: { type: "array" } } };

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
}
