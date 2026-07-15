export type RelayPriority = "required" | "important" | "optional";
export type RelayVerdict = "met" | "at_risk" | "violated" | "unverified";

const weightByPriority: Record<RelayPriority, number> = {
  required: 3,
  important: 2,
  optional: 1
};

const valueByVerdict: Record<RelayVerdict, number> = {
  met: 1,
  at_risk: 0.5,
  violated: 0,
  unverified: 0
};

export function calculateRelayIntegrity(
  items: Array<{ id: string; priority: RelayPriority; verdict: RelayVerdict }>
): { score: number; completionGate: "pass" | "fail"; gateReasons: string[] } {
  const totalWeight = items.reduce((total, item) => total + weightByPriority[item.priority], 0);
  const weightedValue = items.reduce(
    (total, item) => total + weightByPriority[item.priority] * valueByVerdict[item.verdict],
    0
  );
  const gateReasons = items
    .filter((item) => item.priority === "required" && item.verdict !== "met" && item.verdict !== "at_risk")
    .map((item) => `Required contract item ${item.id} is ${item.verdict.replace("_", " ")}.`);

  return {
    score: totalWeight === 0 ? 0 : Math.round((100 * weightedValue) / totalWeight),
    completionGate: gateReasons.length === 0 ? "pass" : "fail",
    gateReasons
  };
}
