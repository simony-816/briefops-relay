import { z } from "zod";

const repositoryRelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !/^[a-zA-Z]:[\\/]/.test(value) &&
      !value.split("/").includes(".."),
    "Expected a repository-relative path."
  );

export const relayManifestSchema = z.object({
  schema_version: z.literal(1),
  run_id: z.string().regex(/^relay_\d{8}_\d{6}_\d{3}$/),
  task: z.string().min(1),
  network_permitted: z.boolean(),
  evidence_count: z.number().int().nonnegative(),
  total_bytes: z.number().int().nonnegative(),
  included_paths: z.array(repositoryRelativePathSchema),
  excluded: z.record(z.string(), z.number().int().nonnegative()),
  baseline_sha: z.string().regex(/^[a-f0-9]{40}$/),
  head_sha: z.string().regex(/^[a-f0-9]{40}$/),
  dirty: z.boolean()
});

export type RelayManifest = z.infer<typeof relayManifestSchema>;

const shaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const contentHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const relayRunIdSchema = z.string().regex(/^relay_\d{8}_\d{6}_\d{3}$/);
const relayEvidenceIdSchema = z.string().regex(/^(src|chg)_[a-f0-9]{16}$/);

const relayEvidenceBaseSchema = z.object({
  id: relayEvidenceIdSchema,
  path: repositoryRelativePathSchema,
  content_hash: contentHashSchema,
  content: z.string(),
  truncated: z.boolean()
});

export const relaySourceEvidenceSchema = relayEvidenceBaseSchema.extend({
  id: z.string().regex(/^src_[a-f0-9]{16}$/),
  kind: z.literal("source"),
  source_type: z.literal("repository-file"),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive()
}).refine((value) => value.end_line >= value.start_line, "Source evidence must end on or after its start line.");

export const relayChangeEvidenceSchema = relayEvidenceBaseSchema.extend({
  id: z.string().regex(/^chg_[a-f0-9]{16}$/),
  kind: z.literal("change"),
  source_type: z.literal("git-diff"),
  old_start_line: z.number().int().nonnegative(),
  old_end_line: z.number().int().nonnegative(),
  new_start_line: z.number().int().nonnegative(),
  new_end_line: z.number().int().nonnegative(),
  base_sha: shaSchema,
  head_sha: shaSchema
});

export const relayEvidenceSchema = z.union([
  relaySourceEvidenceSchema,
  relayChangeEvidenceSchema
]);

export const contractItemSchema = z.object({
  id: z.string().regex(/^C-\d{3}$/),
  kind: z.enum(["requirement", "constraint", "decision", "risk"]),
  priority: z.enum(["required", "important", "optional"]),
  statement: z.string().min(1),
  evidence_ids: z.array(z.string().regex(/^src_[a-f0-9]{16}$/)).min(1),
  verification: z.string().min(1),
  confidence: z.number().min(0).max(1)
});

export const executionContractSchema = z.object({
  schema_version: z.literal(1),
  run_id: relayRunIdSchema,
  task: z.string().min(1),
  baseline_sha: shaSchema,
  head_sha: shaSchema,
  items: z.array(contractItemSchema).min(1)
});

export const auditFindingSchema = z.object({
  contract_id: z.string().regex(/^C-\d{3}$/),
  verdict: z.enum(["met", "at_risk", "violated", "unverified"]),
  severity: z.enum(["blocker", "major", "minor"]),
  evidence_ids: z.array(relayEvidenceIdSchema).min(1),
  explanation: z.string().min(1),
  recommended_action: z.string().min(1)
});

export const auditReportSchema = z.object({
  schema_version: z.literal(1),
  run_id: relayRunIdSchema,
  baseline_sha: shaSchema,
  head_sha: shaSchema,
  findings: z.array(auditFindingSchema),
  score: z.number().int().min(0).max(100),
  completion_gate: z.enum(["pass", "fail"]),
  gate_reasons: z.array(z.string())
});

export type RelayEvidence = z.infer<typeof relayEvidenceSchema>;
export type ExecutionContract = z.infer<typeof executionContractSchema>;
export type RelayAuditReport = z.infer<typeof auditReportSchema>;
