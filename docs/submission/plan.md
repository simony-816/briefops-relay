# BriefOps Relay — Submission Plan

## Submission position

**Category:** Developer Tools

**One sentence:** BriefOps Relay turns bounded repository evidence into an
execution contract, audits the resulting diff against that contract, and leaves
a verified handoff for the next Codex session.

## Evidence ready today

- public Build Week derivative repository with `buildweek-baseline` history;
- `PREEXISTING.md` and `BUILD_LOG.md` separating prior work from the Build Week delta;
- offline demo that requires neither an API key nor a hosted service;
- self-contained `report.html` and verified `handoff.md` generated locally;
- local Codex-authenticated live Contract and Audit path behind `--allow-network`;
- deterministic integrity evaluation with six adversarial artifact scenarios;
- full automated suite and TypeScript build verification.

## Devpost draft checklist

1. **Project name:** BriefOps Relay.
2. **Tagline:** Evidence-backed execution contracts for long-running Codex projects.
3. **Problem:** Over multiple sessions, project decisions, requirements, and code drift apart. More context alone does not prove that an implementation honored it.
4. **Solution:** Relay collects bounded, line-addressable evidence; produces a task-scoped Contract; audits the diff; validates every cited ID locally; then produces a handoff and report.
5. **How Codex was used:** Codex audited the base repository, implemented Relay modules and tests, executed the live Contract/Audit workflow through authenticated local Codex, and generated repeatable submission assets. Product scope, evidence policy, scoring semantics, feature cuts, and final claims remain owner decisions.
6. **How GPT-5.6 is used:** The optional `openai` provider uses a structured, non-stored Responses request. The primary demo path uses the authenticated Codex provider so judges can reproduce the offline path without an API key.
7. **Testing route for judges:** `npm ci`, `npm run build`, `npm test`, then `node dist/index.js relay demo` and open the generated report. Do not require live credentials.
8. **Limitations:** The offline demo is a seeded artifact workflow, not a benchmark of broad model reliability. Live evidence transfer is explicitly opt-in and bounded. File selection is rule-based, so an omitted relevant file remains a risk to surface, not a solved problem.

## Required before final submission

- [ ] Add final Devpost copy and repository URL.
- [ ] Add three screenshots: Summary, finding, and evidence detail.
- [ ] Add the public video URL and verify it remains below three minutes.
- [ ] Record the primary Codex `/feedback` session ID in `CODEX_USAGE.md`.
- [ ] Run a fresh-clone installation and package dry run on the release candidate.
- [ ] Confirm the repository is public and the baseline tag resolves on GitHub.
- [ ] Verify no API key, local path, or private run artifact is committed.

## Claims to avoid

- Do not claim that Relay prevents all context drift.
- Do not claim that the six offline integrity scenarios measure general model accuracy.
- Do not imply that ChatGPT/Codex credits are Platform API credits.
- Do not show a synthetic UI as though it were a real Relay run.
