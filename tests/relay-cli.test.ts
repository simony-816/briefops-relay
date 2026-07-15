import { describe, expect, it } from "vitest";
import { buildProgram } from "../src/cli.js";

describe("Relay CLI", () => {
  it("registers an additive Relay command group", () => {
    const program = buildProgram();

    expect(program.helpInformation()).toContain("relay");
    expect(program.helpInformation()).toContain("evidence-backed execution contracts");
  });
});
