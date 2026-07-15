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
