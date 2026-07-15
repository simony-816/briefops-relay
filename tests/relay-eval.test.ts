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
          };
        }
      | undefined)?.runRelayDemoEvaluation;

    expect(evaluate).toBeTypeOf("function");
    if (!evaluate) return;

    expect(evaluate()).toEqual({
      expected_violations: ["C-001"],
      detected_violations: ["C-001"],
      precision: 1,
      recall: 1,
      valid_evidence_reference_rate: 1
    });
  });
});
