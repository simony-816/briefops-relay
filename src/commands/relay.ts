import type { Command } from "commander";

export function registerRelayCommands(program: Command): void {
  program
    .command("relay")
    .description("Create and audit evidence-backed execution contracts.");
}
