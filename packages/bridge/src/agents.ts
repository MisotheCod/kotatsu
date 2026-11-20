// Agent profiles (name, face, voice, good at) and the adapter that runs each one.
// Agents live in the database, so one can be added, paused or removed while the bridge runs.

import type { Agent, AgentRuntimeConfig } from "@kotatsu/shared";
import { config } from "./config";
import { docs } from "./db";
import { live } from "./live";
import type { AgentAdapter } from "./adapters/types";
import { MockAdapter } from "./adapters/mock";
import { HermesAdapter } from "./adapters/hermes";
import { ClaudeAdapter } from "./adapters/claude";
import { CodexAdapter } from "./adapters/codex";
import { HttpAdapter } from "./adapters/http";

const adapters = new Map<string, AgentAdapter>();

/** Builds the adapter for an agent and keeps it in the map. One adapter per agent, started on demand. */
function build(a: Agent): AgentAdapter {
  const cfg: AgentRuntimeConfig = a.config ?? {};
  if (config.seed && process.env.AGENTS === "mock") return new MockAdapter(a.name);
  switch (a.runtime) {
    case "hermes": return new HermesAdapter({ profile: cfg.profile, url: cfg.url, token: cfg.token });
    case "claude": return new ClaudeAdapter({ cwd: cfg.cwd ?? a.workspace, model: a.model ?? cfg.model, instructions: cfg.instructions });
    case "codex": return new CodexAdapter({ cwd: cfg.cwd ?? a.workspace, model: a.model ?? cfg.model, instructions: cfg.instructions });
    case "http": return new HttpAdapter({ url: cfg.url, token: cfg.token, cwd: cfg.cwd, model: a.model ?? cfg.model });
    default: return new MockAdapter(a.name);
  }
}

async function boot(a: Agent) {
  const ad = build(a);
  adapters.set(a.id, ad);
  if (!a.paused) await ad.start().catch((e) => console.warn(`[agents] ${a.id} did not start: ${e.message}`));
  live.send({ type: "agent", agent: agents.update(a.id, { online: ad.online() })! });
}

export const agents = {
  async start() {
    // A fresh install has no agents on purpose: setup adds the first one.
    for (const a of agents.list()) await boot(a);

    // Watch online state and tell the apps when it changes.
    setInterval(() => {
      for (const a of agents.list()) {
        const on = a.paused ? false : adapters.get(a.id)?.online() ?? false;
        if (on !== a.online) live.send({ type: "agent", agent: agents.update(a.id, { online: on })! });
      }
    }, 2000).unref();
  },

  list(): Agent[] {
    return docs.all<Agent>("agent").sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
  },
  get: (id: string) => docs.get<Agent>("agent", id),
  default(): Agent | undefined {
    const all = agents.list();
    return all.find((a) => a.isDefault && !a.paused) ?? all.find((a) => !a.paused) ?? all[0];
  },
  adapter: (id: string) => adapters.get(id),
  /** The id to post to when no agent was named. Empty when there are no agents yet. */
  defaultId: () => agents.default()?.id ?? "",

  update(id: string, patch: Partial<Agent>) {
    const a = agents.get(id);
    if (!a) return undefined;
    if (patch.isDefault) for (const o of agents.list()) if (o.id !== id && o.isDefault) docs.put("agent", o.id, { ...o, isDefault: false });
    const next = { ...a, ...patch };
    docs.put("agent", id, next as any);
    return next;
  },

  /** Adding an agent never needs a restart: it is written, then its adapter starts. */
  async add(a: Agent) {
    docs.put("agent", a.id, a as any);
    await boot(a);
    live.send({ type: "agents" });
    return agents.get(a.id)!;
  },

  async restart(id: string) {
    const a = agents.get(id);
    if (!a) return undefined;
    adapters.delete(id);
    await boot(a);
    return agents.get(id);
  },

  async pause(id: string, paused: boolean) {
    const a = agents.get(id);
    if (!a) return undefined;
    const next = agents.update(id, { paused, online: paused ? false : a.online });
    if (paused) adapters.delete(id);
    else await boot(next!);
    live.send({ type: "agents" });
    return agents.get(id);
  },

  async remove(id: string) {
    adapters.delete(id);
    docs.del("agent", id);
    if (agents.get(id)?.isDefault) {
      const first = agents.list()[0];
      if (first) agents.update(first.id, { isDefault: true });
    }
    live.send({ type: "agents" });
  },
};
