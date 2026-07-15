import { validateRelayAudit, validateRelayContract } from "./relayContract.js";

function titleCase(value: string): string {
  return value.replaceAll("_", " ").toUpperCase();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function renderRelayHandoff(input: {
  contract: unknown;
  audit: unknown;
  evidence: unknown;
}): string {
  const contract = validateRelayContract(input.contract, input.evidence);
  const audit = validateRelayAudit(contract, input.audit, input.evidence);
  const findings = new Map(audit.findings.map((finding) => [finding.contract_id, finding]));
  const evidence = input.evidence as Array<{ kind?: string; path?: string }>;
  const changedFiles = uniqueSorted(
    evidence
      .filter((item) => item.kind === "change" && typeof item.path === "string")
      .map((item) => item.path as string)
  );
  const unresolved = contract.items.filter((item) => {
    const verdict = findings.get(item.id)?.verdict;
    return verdict === "violated" || verdict === "unverified";
  });

  const sections = [
    "# BriefOps Relay — Verified Handoff",
    "",
    "## Task",
    "",
    contract.task,
    "",
    "## Run",
    "",
    `- Run: \`${contract.run_id}\``,
    `- Baseline: \`${contract.baseline_sha}\``,
    `- Current: \`${contract.head_sha}\``,
    `- Integrity Score: **${audit.score}**`,
    `- Completion Gate: **${audit.completion_gate.toUpperCase()}**`,
    "",
    "## Contract Audit",
    "",
    ...contract.items.flatMap((item) => {
      const finding = findings.get(item.id);
      if (!finding) return [];
      return [
        `### ${item.id} · ${titleCase(finding.verdict)}`,
        "",
        item.statement,
        "",
        `- Priority: ${item.priority}`,
        `- Evidence: ${finding.evidence_ids.map((id) => `\`${id}\``).join(", ")}`,
        `- Action: ${finding.recommended_action}`,
        ""
      ];
    }),
    "## Changed Files",
    "",
    ...(changedFiles.length > 0 ? changedFiles.map((file) => `- \`${file}\``) : ["- No Git diff evidence was recorded."]),
    "",
    "## Next Codex Session",
    "",
    unresolved.length > 0
      ? `Resolve ${unresolved.map((item) => item.id).join(", ")} before treating this task as complete, then rerun \`briefops relay audit\`.`
      : "The recorded contract items passed their audit. Review the changed files, then continue with the next scoped task.",
    ""
  ];

  return sections.join("\n");
}
