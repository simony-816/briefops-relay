---
name: briefops-relay-task
description: Use when a Codex task needs BriefOps Relay evidence preparation, an offline audit demonstration, a verified handoff, or a self-contained report
---

# BriefOps Relay Task

The BriefOps plugin is a local CLI helper. It does not require network access and does not publish to a marketplace.

Before any BriefOps command, run `command -v briefops`. If `briefops` is not on `PATH`, stop and report `Status: setup-required`. Do not continue by silently skipping BriefOps. Ask the user to install `briefops`, use `npx briefops@latest`, or explicitly continue from an already supplied Brief/Spec/Plan.

BriefOps may update directory-local `.briefops/` memory. Use `--export-policy shared-only` before copying context outside the local workspace, and ask before applying skill patches.

Use this workflow for the evidence-backed Relay loop: prepare bounded repository evidence, verify an audit artifact, and create a handoff plus report.

Run the environment gate first:

```bash
command -v briefops
```

For local evidence preparation without a model call:

```bash
briefops relay prepare "<task>" --dry-run
```

For the complete API-key-free product demonstration:

```bash
briefops relay demo
briefops relay audit --run latest
briefops relay handoff --run latest
briefops relay report --run latest
```

The current offline workflow validates evidence references, one finding per contract item, and the deterministic integrity score. It does not generate a semantic contract or semantic audit without an explicitly enabled model integration.

Never claim that a fixture result was generated from the current repository. Keep generated Relay artifacts under `.briefops/relay/`, inspect them before sharing, and do not place secrets or absolute paths in a contract, audit, handoff, or report.
