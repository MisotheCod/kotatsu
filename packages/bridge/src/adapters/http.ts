// Any agent that speaks HTTP. The protocol is small on purpose: docs/AGENT_PROTOCOL.md.
// POST to the address the user typed, read back server sent events, post approvals back.

import type { AgentAdapter, TurnHandlers, TurnInput, TurnResult } from "./types";

type Cfg = { url?: string; token?: string; cwd?: string; model?: string };

export class HttpAdapter implements AgentAdapter {
  readonly runtime = "http" as const;
  private cfg: Cfg;
  private up = false;

  constructor(cfg: Cfg = {}) {
    this.cfg = cfg;
  }

  async start() {
    // Nothing to install. Healthy means the address answers.
    this.up = Boolean(this.cfg.url);
  }

  online() { return this.up; }

  async turn(input: TurnInput, on: TurnHandlers, signal: AbortSignal): Promise<TurnResult> {
    if (!this.cfg.url) throw new Error("This agent has no address yet");
    const res = await fetch(this.cfg.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        ...(this.cfg.token ? { authorization: `Bearer ${this.cfg.token}` } : {}),
      },
      body: JSON.stringify({
        sessionId: input.sessionId ?? null,
        channelId: input.channelId,
        text: input.text,
        context: input.context,
        model: input.model ?? this.cfg.model,
        cwd: input.cwd ?? this.cfg.cwd,
      }),
      signal,
    });

    if (!res.ok || !res.body) throw new Error(`The agent answered ${res.status}`);
    this.up = true;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    let sessionId = input.sessionId ?? "";

    const handle = async (event: string, data: any) => {
      if (event === "delta") {
        text += String(data?.text ?? "");
        on.delta(text);
      } else if (event === "status") {
        on.status?.(String(data?.text ?? ""));
      } else if (event === "session") {
        sessionId = String(data?.sessionId ?? sessionId);
      } else if (event === "approval") {
        const verdict = await on.approval({
          title: String(data?.title ?? "The agent wants to do something"),
          command: data?.command,
          tool: data?.tool,
        });
        await fetch(String(data?.replyUrl ?? this.cfg.url), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(this.cfg.token ? { authorization: `Bearer ${this.cfg.token}` } : {}),
          },
          body: JSON.stringify({ approvalId: data?.id, verdict }),
        }).catch(() => {});
      } else if (event === "done") {
        if (data?.text) { text = String(data.text); on.delta(text); }
        if (data?.sessionId) sessionId = String(data.sessionId);
      } else if (event === "error") {
        throw new Error(String(data?.message ?? "The agent failed"));
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const lines = frame.split("\n");
        let event = "message";
        let data = "";
        for (const line of lines) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }
        if (data) {
          let parsed: any = data;
          try { parsed = JSON.parse(data); } catch { /* plain text is fine */ }
          await handle(event, parsed);
        }
      }
    }

    if (buffer.trim()) await handle("message", buffer.trim());
    return { sessionId: sessionId || input.sessionId || "", text };
  }
}
