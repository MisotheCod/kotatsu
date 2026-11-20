// A fake agent so the whole app runs without Hermes or Claude. Used with AGENTS=mock and in dev.

import type { AgentAdapter, TurnHandlers, TurnInput, TurnResult } from "./types";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const t = setTimeout(res, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); rej(new Error("stopped")); }, { once: true });
  });

export class MockAdapter implements AgentAdapter {
  readonly runtime = "mock" as const;
  constructor(private name: string) {}
  async start() {}
  online() { return true; }

  async turn(input: TurnInput, on: TurnHandlers, signal: AbortSignal): Promise<TurnResult> {
    const sessionId = input.sessionId ?? `mock-${input.channelId}-${this.name}`;
    on.status?.("Thinking");
    await sleep(500, signal);

    let reply = `Got it. This is ${this.name} in **${input.channelId}** (mock mode). You said: "${input.text.slice(0, 120)}"`;
    if (/deploy|ship|push/i.test(input.text)) {
      on.status?.("Waiting for your OK");
      const d = await on.approval({ title: "Deploy to production?", command: "vercel deploy --prod" });
      reply = d === "approve" ? "Deployed. It is live." : "Okay, I did not deploy.";
    }

    let out = "";
    for (const word of reply.split(" ")) {
      out += (out ? " " : "") + word;
      on.delta(out);
      await sleep(35, signal);
    }
    return { sessionId, text: out };
  }
}
