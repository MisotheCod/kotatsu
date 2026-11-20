// Claude through the Claude Agent SDK. Signs in with the Claude account already on this Mac
// (run `claude` once in a terminal), so there is no API key in the app.
// Write actions go through canUseTool, which turns into an approval card and a nudge.

import type { AgentAdapter, TurnHandlers, TurnInput, TurnResult } from "./types";
import { homedir } from "node:os";
import { join } from "node:path";

// Tools that never need a yes. Everything else asks first.
const READ_ONLY = new Set(["Read", "Glob", "Grep", "WebSearch", "WebFetch", "TodoWrite", "Task"]);

export class ClaudeAdapter implements AgentAdapter {
  readonly runtime = "claude" as const;
  private sdk: typeof import("@anthropic-ai/claude-agent-sdk") | null = null;
  private cfg: { cwd?: string; model?: string; instructions?: string };

  constructor(cfg: { cwd?: string; model?: string; instructions?: string } = {}) {
    this.cfg = cfg;
  }

  async start() {
    try {
      this.sdk = await import("@anthropic-ai/claude-agent-sdk");
    } catch {
      console.warn("[claude] @anthropic-ai/claude-agent-sdk is not installed, Claude stays offline");
    }
  }

  online() { return this.sdk !== null; }

  async turn(input: TurnInput, on: TurnHandlers, signal: AbortSignal): Promise<TurnResult> {
    if (!this.sdk) throw new Error("Claude is offline");
    const abort = new AbortController();
    signal.addEventListener("abort", () => abort.abort(), { once: true });

    const prompt = input.sessionId ? input.text
      : [this.cfg.instructions, input.context, input.text].filter(Boolean).join("\n\n");
    let sessionId = input.sessionId ?? "";
    let text = "";

    const q = this.sdk.query({
      prompt,
      options: {
        resume: input.sessionId,
        cwd: input.cwd ?? this.cfg.cwd ?? join(homedir(), "Projects"),
        model: input.model ?? this.cfg.model,
        abortController: abort,
        includePartialMessages: true,
        canUseTool: async (toolName: string, toolInput: Record<string, unknown>) => {
          if (READ_ONLY.has(toolName)) return { behavior: "allow", updatedInput: toolInput };
          on.status?.("Waiting for your OK");
          const decision = await on.approval({
            title: describe(toolName, toolInput),
            command: typeof toolInput.command === "string" ? toolInput.command : JSON.stringify(toolInput).slice(0, 400),
            tool: toolName,
          });
          on.status?.("Working");
          return decision === "approve"
            ? { behavior: "allow", updatedInput: toolInput }
            : { behavior: "deny", message: "The person said no." };
        },
      },
    });

    for await (const msg of q as AsyncIterable<any>) {
      if (msg.session_id) sessionId = msg.session_id;
      if (msg.type === "stream_event" && msg.event?.type === "content_block_delta" && msg.event.delta?.type === "text_delta") {
        text += msg.event.delta.text;
        on.delta(text);
      } else if (msg.type === "assistant") {
        const blocks = msg.message?.content ?? [];
        const tool = blocks.find((b: any) => b.type === "tool_use");
        if (tool) on.status?.(`Using ${tool.name}`);
      } else if (msg.type === "result") {
        if (typeof msg.result === "string" && msg.result.length >= text.length) text = msg.result;
        if (msg.subtype && msg.subtype !== "success") throw new Error(`Claude stopped: ${msg.subtype}`);
      }
    }
    on.delta(text);
    return { sessionId, text };
  }
}

function describe(tool: string, input: Record<string, unknown>): string {
  if (tool === "Bash") return `Run a command`;
  if (tool === "Write" || tool === "Edit") return `Change ${String(input.file_path ?? "a file").split("/").pop()}`;
  return `Use ${tool}`;
}
