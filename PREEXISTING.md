# BriefOps Relay — Pre-existing Functionality Boundary

This repository is a Build Week derivative of BriefOps. The annotated Git tag
`buildweek-baseline` identifies the exact pre-existing state:

```text
cc18c0320cec84bc8f61347a96ca336478c55342
```

All Relay work is additive, follows this tag, and remains in unsquashed Git
history for the duration of judging.

## Capability Boundary

| Area | Present at baseline | Build Week addition |
| --- | --- | --- |
| Local-first CLI and `.briefops/` workspace | Yes | Preserved; Relay stores independent run artifacts under `.briefops/relay/` |
| Projects, skills, workers, briefs, memory, and handoffs | Yes | Preserved; Relay may reference them but does not alter their data contracts |
| Codex plugin and first-context workflow | Yes | One opt-in Relay task skill |
| Deterministic context assembly and token budgeting | Yes | Preserved |
| Repository-wide source scanning | No | Line-addressable, bounded evidence collector |
| Git-diff evidence | No | Baseline-to-current diff collector and change evidence |
| GPT-5.6 product integration | No | Explicit, opt-in Responses API calls for contract generation and audit |
| Task-scoped execution contract | No | Evidence-backed contract with validated citations |
| Contract-vs-diff audit | No | Per-item verdicts, deterministic integrity score, completion gate |
| Static audit report | No | Self-contained HTML report generated from local artifacts |
| Offline Relay demonstration and seeded evals | No | Fixture, precomputed artifacts, and reproducible evaluation tooling |
| Video-production automation | No | Build Week-only capture, narration, and verification scripts |

## Submission Claim

BriefOps Relay is not presented as a rewrite of BriefOps. The submission is the
new execution-contract loop: collect repository evidence, generate a contract,
audit a resulting diff, and preserve a verified handoff.

See `docs/superpowers/specs/2026-07-15-briefops-relay-design.md` for the
approved scope and `BUILD_LOG.md` for the implementation record.
