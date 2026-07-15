import { relayEvidenceSchema } from "../schemas/relay.js";
import { validateRelayAudit, validateRelayContract } from "./relayContract.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function statusClass(verdict: string): string {
  return `status-${verdict.replaceAll("_", "-")}`;
}

export function renderRelayReport(input: {
  contract: unknown;
  audit: unknown;
  evidence: unknown;
}): string {
  const contract = validateRelayContract(input.contract, input.evidence);
  const audit = validateRelayAudit(contract, input.audit, input.evidence);
  const evidence = relayEvidenceSchema.array().parse(input.evidence);
  const findings = new Map(audit.findings.map((finding) => [finding.contract_id, finding]));
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const cards = contract.items.map((item) => {
    const finding = findings.get(item.id);
    if (!finding) return "";
    const evidenceLinks = finding.evidence_ids.map((id) => {
      const reference = evidenceById.get(id);
      const location = reference && reference.kind === "source"
        ? `${reference.path}:${reference.start_line}-${reference.end_line}`
        : reference?.path ?? "unavailable";
      return `<li><code>${escapeHtml(id)}</code> · ${escapeHtml(location)}</li>`;
    }).join("");
    return `<article class="contract-card ${statusClass(finding.verdict)}">
      <div class="card-heading"><span class="contract-id">${escapeHtml(item.id)}</span><span class="status">${escapeHtml(finding.verdict.replaceAll("_", " "))}</span></div>
      <p class="statement">${escapeHtml(item.statement)}</p>
      <dl><dt>Priority</dt><dd>${escapeHtml(item.priority)}</dd><dt>Verification</dt><dd>${escapeHtml(item.verification)}</dd><dt>Finding</dt><dd>${escapeHtml(finding.explanation)}</dd><dt>Recommended action</dt><dd>${escapeHtml(finding.recommended_action)}</dd></dl>
      <h3>Evidence</h3><ul>${evidenceLinks}</ul>
    </article>`;
  }).join("\n");
  const gateReasons = audit.gate_reasons.length > 0
    ? `<ul>${audit.gate_reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>`
    : "<p>No required contract item is blocked.</p>";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BriefOps Relay Report</title>
<style>
:root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; background: #10131a; color: #eef2ff; }
* { box-sizing: border-box; } body { margin: 0; } main { max-width: 1160px; margin: 0 auto; padding: 48px 32px 72px; }
.eyebrow { color: #9fb4ff; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; } h1 { font-size: 42px; margin: 10px 0 8px; } .task { color: #c7cedd; font-size: 20px; margin: 0; }
.summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 32px 0; } .metric, .contract-card, .gate { background: #191f2b; border: 1px solid #2c3546; border-radius: 14px; padding: 20px; } .metric span { color: #aeb9ce; display: block; font-size: 13px; } .metric strong { display: block; font-size: 31px; margin-top: 8px; }
h2 { margin: 42px 0 16px; } .contracts { display: grid; gap: 16px; } .card-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; } .contract-id { font-weight: 800; } .status { border-radius: 999px; font-size: 12px; font-weight: 700; padding: 5px 9px; text-transform: uppercase; } .statement { font-size: 18px; margin: 16px 0; } dl { display: grid; grid-template-columns: 150px 1fr; gap: 8px 16px; margin: 0; } dt { color: #aeb9ce; } dd { margin: 0; } h3 { font-size: 14px; margin: 20px 0 8px; } ul { margin: 0; padding-left: 20px; } code { color: #c8d5ff; }
.status-met { border-left: 4px solid #45c189; } .status-met .status { background: #123d2b; color: #a9f1cb; } .status-at-risk { border-left: 4px solid #e1b655; } .status-at-risk .status { background: #4a3b14; color: #ffe5a5; } .status-violated, .status-unverified { border-left: 4px solid #ee7272; } .status-violated .status, .status-unverified .status { background: #4d2028; color: #ffc0c7; }
@media (max-width: 700px) { main { padding: 28px 20px; } h1 { font-size: 32px; } .summary { grid-template-columns: 1fr; } dl { grid-template-columns: 1fr; gap: 4px; } dd { margin-bottom: 10px; } }
</style>
</head>
<body><main>
<div class="eyebrow">Evidence-backed execution contract</div>
<h1>BriefOps Relay</h1>
<p class="task">${escapeHtml(contract.task)}</p>
<section class="summary" aria-label="Run summary"><div class="metric"><span>Integrity score</span><strong>${audit.score}</strong></div><div class="metric"><span>Completion gate</span><strong>${escapeHtml(audit.completion_gate.toUpperCase())}</strong></div><div class="metric"><span>Contract items</span><strong>${contract.items.length}</strong></div></section>
<section class="gate"><h2>Gate decision</h2>${gateReasons}</section>
<section><h2>Contract audit</h2><div class="contracts">${cards}</div></section>
<section><h2>Run evidence</h2><p>Baseline <code>${escapeHtml(contract.baseline_sha)}</code> · Current <code>${escapeHtml(contract.head_sha)}</code> · Run <code>${escapeHtml(contract.run_id)}</code></p></section>
</main></body>
</html>`;
}
