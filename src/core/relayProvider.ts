import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { BriefOpsError } from "./errors.js";

const execFileAsync = promisify(execFile);

async function runCodexWithPrompt(command: string, args: string[], prompt: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(Object.assign(new Error("Codex CLI exited unsuccessfully."), { stderr }));
    });
    child.stdin.end(prompt);
  });
}

export type RelayStructuredRequest = {
  prompt: string;
  schema: Record<string, unknown>;
  schemaName: string;
};

type CodexStatusRunner = (args: string[]) => Promise<{ stdout: string }>;

export async function inspectCodexCli(
  options: { codexPath?: string; runner?: CodexStatusRunner } = {}
): Promise<{ version: string }> {
  const runner = options.runner ?? (async (args: string[]) => {
    const { stdout } = await execFileAsync(options.codexPath ?? "codex", args, { maxBuffer: 20_000 });
    return { stdout };
  });
  try {
    await runner(["login", "status"]);
    const { stdout } = await runner(["--version"]);
    return { version: stdout.trim() || "unknown" };
  } catch {
    throw new BriefOpsError("Codex CLI is not authenticated. Run `codex login` before using --provider codex.");
  }
}

function parseStructuredJson(raw: string, provider: string): unknown {
  try {
    return JSON.parse(raw.trim());
  } catch {
    throw new BriefOpsError(`${provider} returned invalid JSON for the Relay schema.`);
  }
}

export async function generateWithCodexCli(
  request: RelayStructuredRequest,
  options: { codexPath?: string; runner?: (args: string[]) => Promise<string> } = {}
): Promise<unknown> {
  const tempDirectory = await fs.mkdtemp(path.join(tmpdir(), "briefops-relay-codex-"));
  const schemaPath = path.join(tempDirectory, "schema.json");
  const outputPath = path.join(tempDirectory, "output.json");
  const args = [
    "exec",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath,
    "-"
  ];
  try {
    await fs.writeFile(schemaPath, `${JSON.stringify(request.schema)}\n`, "utf8");
    if (options.runner) return parseStructuredJson(await options.runner(args), "Codex CLI");
    await inspectCodexCli({ codexPath: options.codexPath });
    try {
      await runCodexWithPrompt(options.codexPath ?? "codex", args, request.prompt);
    } catch (error) {
      const stderr = String((error as { stderr?: unknown }).stderr ?? "")
        .replace(/\bsk-[A-Za-z0-9_-]+/g, "[redacted]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 500);
      throw new BriefOpsError(`Codex CLI could not complete the Relay semantic task.${stderr ? ` ${stderr}` : ""}`);
    }
    return parseStructuredJson(await fs.readFile(outputPath, "utf8"), "Codex CLI");
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true });
  }
}

export async function generateWithOpenAIResponses(
  request: RelayStructuredRequest,
  options: { apiKey: string; fetchImpl?: typeof fetch; model?: string }
): Promise<unknown> {
  if (!options.apiKey) throw new BriefOpsError("OPENAI_API_KEY is required for --provider openai.");
  const response = await (options.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: options.model ?? "gpt-5.6",
      store: false,
      reasoning: { effort: "medium" },
      input: request.prompt,
      text: { format: { type: "json_schema", name: request.schemaName, strict: true, schema: request.schema } }
    })
  });
  if (!response.ok) throw new BriefOpsError(`OpenAI Responses request failed (${response.status}).`);
  const payload = await response.json() as { output_text?: unknown; output?: Array<{ content?: Array<{ text?: unknown }> }> };
  const outputText = typeof payload.output_text === "string"
    ? payload.output_text
    : payload.output?.flatMap((item) => item.content ?? []).find((content) => typeof content.text === "string")?.text;
  if (typeof outputText !== "string") throw new BriefOpsError("OpenAI Responses response did not contain structured output text.");
  return parseStructuredJson(outputText, "OpenAI Responses");
}
