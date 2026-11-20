// Codex through OpenAI's Codex SDK, signed in with the user's own ChatGPT account.
// Nothing here holds a key: `codex` signs in once on the Mac and the SDK reuses that login.
//
// Approvals: the SDK has no callback for the approval card, so Codex runs in its own
// workspace-write sandbox. It can only touch the folder it was given, and network is off,
// which is the same promise the approval card makes in a different way.

import type { AgentAdapter, TurnHandlers, TurnInput, TurnResult } from "./types";

type Cfg = { cwd?: string; model?: string; instructions?: string };

export class CodexAdapter implements AgentAdapter {
  readonly runtime = "codex" as const;
  private sdk: typeof import("@openai/codex-sdk") | null = null;
  private client: any = null;
  private cfg: Cfg;

  constructor(cfg: Cfg = {}) {
    this.cfg = cfg;
  }

  async start() {
    try {
      this.sdk = await import("@openai/codex-sdk");
      this.client = new this.sdk.Codex();
    } catch {
      console.warn("[codex] @openai/codex-sdk is not installed, Codex stays offline");
    }
  }

  online() { return this.sdk !== null && this.client !== null; }

  async turn(input: TurnInput, on: TurnHandlers, signal: AbortSignal): Promise<TurnResult> {
    if (!this.client) throw new Error("Codex is offline");

    const thread = input.sessionId
      ? this.client.resumeThread(input.sessionId, {
          workingDirectory: input.cwd ?? this.cfg.cwd,
          skipGitRepoCheck: true,
          model: input.model ?? this.cfg.model,
          approvalPolicy: "never",
          sandboxMode: "workspace-write",
        })
      : this.client.startThread({
          workingDirectory: input.cwd ?? this.cfg.cwd,
          skipGitRepoCheck: true,
          model: input.model ?? this.cfg.model,
          approvalPolicy: "never",
          sandboxMode: "workspace-write",
        });

    const prompt = input.sessionId
      ? input.text
      : [this.cfg.instructions, input.context, input.text].filter(Boolean).join("\n\n");

    const { events } = await thread.runStreamed(prompt, { signal });

    let text = "";
    let threadId = input.sessionId ?? "";

    for await (const e of events) {
      if (e.type === "thread.started") {
        threadId = (e as any).thread_id ?? threadId;
      } else if (e.type === "item.completed") {
        const item = (e as any).item;
        if (item?.type === "agent_message") {
          text += (text ? "\n\n" : "") + String(item.text ?? "");
          on.delta(text);
        } else if (item?.type === "command_execution" || item?.type === "file_change") {
          on.status?.(item.type === "file_change" ? "Editing files" : "Running a command");
        }
      } else if (e.type === "turn.failed" || e.type === "error") {
        throw new Error(String((e as any).error?.message ?? (e as any).message ?? "Codex failed"));
      }
    }

    return { sessionId: threadId, text };
  }
}
