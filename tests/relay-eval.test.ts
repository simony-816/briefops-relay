import { describe, expect, it } from "vitest";

describe("Relay offline evaluation", () => {
  it("detects every seeded violation with valid evidence references", async () => {
    const module = await import("../src/core/relayEval.js").catch(() => undefined);
    const evaluate = (module as
      | {
          runRelayDemoEvaluation?: () => {
            expected_violations: string[];
            detected_violations: string[];
            precision: number;
            recall: number;
            valid_evidence_reference_rate: number;
            scenario_count: number;
            rejected_invalid_artifacts: number;
            scenarios: Array<{ id: string; status: "pass" | "fail" }>;
          };
        }
      | undefined)?.runRelayDemoEvaluation;

    expect(evaluate).toBeTypeOf("function");
    if (!evaluate) return;

    expect(evaluate()).toMatchObject({
      expected_violations: ["C-001"],
      detected_violations: ["C-001"],
      precision: 1,
      recall: 1,
      valid_evidence_reference_rate: 1,
      scenario_count: 6,
      rejected_invalid_artifacts: 4
    });
    expect(evaluate().scenarios).toEqual([
      { id: "missing-request-id", status: "pass" },
      { id: "unknown-evidence-id", status: "pass" },
      { id: "duplicate-finding", status: "pass" },
      { id: "missing-finding", status: "pass" },
      { id: "score-tampering", status: "pass" },
      { id: "all-met-control", status: "pass" }
    ]);
  });
});
