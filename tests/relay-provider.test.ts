import { describe, expect, it } from "vitest";

describe("Relay semantic providers", () => {
  it("uses an authenticated local Codex CLI with a schema-constrained ephemeral run", async () => {
    const module = await import("../src/core/relayProvider.js").catch(() => undefined);
    const run = (module as
      | {
          generateWithCodexCli?: (request: { prompt: string; schema: Record<string, unknown>; schemaName: string }, options: {
            runner: (args: string[]) => Promise<string>;
          }) => Promise<unknown>;
        }
      | undefined)?.generateWithCodexCli;

    expect(run).toBeTypeOf("function");
    if (!run) return;
    let args: string[] = [];
    await expect(run({ prompt: "Return JSON.", schema: { type: "object" }, schemaName: "relay_contract" }, {
      runner: async (received) => {
        args = received;
        return '{"items":[]}';
      }
    })).resolves.toEqual({ items: [] });
    expect(args).toEqual(expect.arrayContaining(["exec", "--ephemeral", "--sandbox", "read-only", "--output-schema"]));
  });

  it("uses an explicit, non-stored Responses request when an API key is supplied", async () => {
    const module = await import("../src/core/relayProvider.js").catch(() => undefined);
    const run = (module as
      | {
          generateWithOpenAIResponses?: (request: { prompt: string; schema: Record<string, unknown>; schemaName: string }, options: {
            apiKey: string;
            fetchImpl: typeof fetch;
          }) => Promise<unknown>;
        }
      | undefined)?.generateWithOpenAIResponses;

    expect(run).toBeTypeOf("function");
    if (!run) return;
    let request: Request | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      request = new Request(input, init);
      return new Response(JSON.stringify({ output_text: '{"items":[]}' }), { status: 200 });
    };
    await expect(run({ prompt: "Return JSON.", schema: { type: "object" }, schemaName: "relay_contract" }, {
      apiKey: "test-key",
      fetchImpl
    })).resolves.toEqual({ items: [] });
    const body = await request?.json() as Record<string, unknown>;
    expect(request?.headers.get("authorization")).toBe("Bearer test-key");
    expect(body).toMatchObject({ model: "gpt-5.6", store: false });
  });
});
