// Channels and the shared timeline. A project channel has every agent in it, like Slack.
// Sending a message routes it to the @mentioned agent, or the default agent when nobody is mentioned.
// Agents can @mention each other in a reply to hand work over, up to config.maxHandoffDepth hops.

import { join } from "node:path";
import type { Approval, Attachment, Card, Channel, Message } from "@kotatsu/shared";
import { parseMentions } from "@kotatsu/shared";
import { config } from "./config";
import { docs, id, now, sessions } from "./db";
import { live } from "./live";
import { agents } from "./agents";
import { proactive, settings } from "./proactive";
import { push } from "./push";
import { agentContext } from "./context";

const running = new Map<string, { agentId: string; channelId: string; text: string; abort: AbortController }>();
const waitingApprovals = new Map<string, (d: "approve" | "reject") => void>();

/** One notification per finished reply, only when nothing is open to read it. */
function notifyReply(m: Message, agentName: string, mirrored?: boolean) {
  if (mirrored) return;              // the build channel echoes the desktop session; that is not news
  if (live.count() > 0) return;      // an app is open, so it is already on screen
  // Decisions, not status. A direct message, something that names him, or a message that carries
  // buttons is worth a buzz. A cron dropping a headline into its own channel is not.
  const c = channels.get(m.channelId);
  const decisive = m.mentions.length > 0 || (m.cards ?? []).some((x) => x.type === "actions" || x.type === "approval" || x.type === "report");
  if (c?.kind !== "direct" && !decisive) return;
  const s = settings.get();
  const hhmm = new Date().toLocaleTimeString("en-US", { timeZone: s.timezone, hour12: false, hour: "2-digit", minute: "2-digit" });
  const inQuiet = s.quietStart > s.quietEnd
    ? hhmm >= s.quietStart || hhmm < s.quietEnd
    : hhmm >= s.quietStart && hhmm < s.quietEnd;
  if (inQuiet) return;
  const unread = channels.list().reduce((n, c) => n + (c.unread || 0), 0);
  void push.send({
    title: `${agentName || "Kotatsu"}`,
    body: m.text.replace(/\s+/g, " ").slice(0, 160),
    url: `/c?id=${m.channelId}`,
    tag: `msg-${m.channelId}`,
    badge: unread,
  });
}

export const channels = {
  list(): Channel[] {
    return docs.all<Channel>("channel").filter((c) => !c.archived)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  get: (cid: string) => docs.get<Channel>("channel", cid),

  save(c: Channel) {
    docs.put("channel", c.id, c as any);
    live.send({ type: "channel", channel: c });
    return c;
  },

  create(input: { name: string; kind: Channel["kind"]; logo?: string; color?: string; description?: string; agentIds?: string[]; id?: string }) {
    const slug = input.id ?? (input.kind === "project" ? input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : id(input.kind));
    const c: Channel = {
      id: slug, kind: input.kind, name: input.name, logo: input.logo, color: input.color, description: input.description,
      agentIds: input.agentIds ?? agents.list().map((a) => a.id), unread: 0, live: false, updatedAt: now(),
    };
    return channels.save(c);
  },

  /** Direct channel for one agent, made on first use. */
  direct(agentId: string) {
    const cid = `dm-${agentId}`;
    return channels.get(cid) ?? channels.create({ id: cid, kind: "direct", name: agents.get(agentId)?.name ?? agentId, agentIds: [agentId] });
  },

  messages(cid: string, before?: string, limit = 60): Message[] {
    return docs.scoped<Message>("message", cid, limit, before).reverse();
  },

  markRead(cid: string) {
    const c = channels.get(cid);
    if (c && c.unread) channels.save({ ...c, unread: 0 });
  },

  putMessage(m: Message, bump = true) {
    docs.put("message", m.id, m as any, m.channelId);
    live.send({ type: "message", message: m });
    if (bump && m.status !== "streaming") {
      const c = channels.get(m.channelId);
      if (c) {
        const name = m.author.kind === "user" ? "You" : m.author.kind === "agent" ? (agents.get(m.author.agentId)?.name ?? "") : "";
        const next = channels.save({ ...c, updatedAt: m.createdAt, unread: m.author.kind === "agent" ? c.unread + 1 : c.unread,
          lastMessage: { authorName: name, text: m.text.replace(/\s+/g, " ").slice(0, 140), at: m.createdAt } });
        // A finished reply while no app is open is the whole reason for a notification.
        if (m.author.kind === "agent" && m.text.trim()) notifyReply(m, name, next.mirror);
      }
    }
    return m;
  },

  /** The user sends a message. Returns right away; replies arrive over /api/live. */
  send(cid: string, text: string, opts: { agentId?: string; attachments?: Attachment[] } = {}) {
    const c = channels.get(cid);
    if (!c) throw new Error("No such channel");
    const members = agents.list().filter((a) => c.agentIds.includes(a.id));
    const mentions = parseMentions(text, members);
    const msg: Message = { id: id("msg"), channelId: cid, author: { kind: "user" }, text, mentions, status: "done", createdAt: now(),
      ...(opts.attachments?.length ? { attachments: opts.attachments } : {}) };
    channels.putMessage(msg);

    // Who answers: the agent you named, then the one this chat is set to, then the house default.
    const fallback = c.defaultAgentId === "all" ? c.agentIds
      : c.defaultAgentId ? [c.defaultAgentId]
      : c.kind === "direct" ? c.agentIds : [agents.defaultId()];
    const targets = opts.agentId ? [opts.agentId] : mentions.length ? mentions : fallback;
    // One chain per user message. Any agent that has spoken in this chain is not asked again,
    // which is what stopped two agents handing the same question back and forth until the depth cap.
    const chain = new Set<string>(targets);
    // The agent gets the path, not a picture: it can open the file itself and look at it.
    const withFiles = opts.attachments?.length
      ? `${text}\n\n${opts.attachments.map((a) => `[image attached: ${join(config.dataDir, "uploads", a.url.split("/").pop()!)}]`).join("\n")}`
      : text;
    for (const agentId of targets) void channels.runTurn(cid, agentId, withFiles, 0, undefined, chain);
    return msg;
  },

  async runTurn(cid: string, agentId: string, text: string, depth: number, fromAgent?: string, chain?: Set<string>): Promise<void> {
    const c = channels.get(cid);
    const agent = agents.get(agentId);
    const adapter = agents.adapter(agentId);
    if (!c || !agent || !adapter) return;

    const reply: Message = { id: id("msg"), channelId: cid, author: { kind: "agent", agentId }, text: "", mentions: [],
      status: "streaming", createdAt: now(), replyToAgent: fromAgent, pending: true };
    channels.putMessage(reply, false);
    const abort = new AbortController();
    running.set(reply.id, { agentId, channelId: cid, text: "Thinking", abort });
    channels.save({ ...c, live: true });
    broadcastRunning();

    let lastPush = 0;
    try {
      const res = await adapter.turn({
        sessionId: sessions.get(cid, agentId),
        channelId: cid,
        text: fromAgent ? `${agents.get(fromAgent)?.name} asks: ${text}` : text,
        context: agentContext(agent, c),
        model: c.models?.[agentId] ?? agent.model,
        cwd: agent.workspace,
      }, {
        delta: (t) => {
          reply.text = t;
          if (Date.now() - lastPush > 80) { lastPush = Date.now(); live.send({ type: "message.delta", id: reply.id, channelId: cid, text: t }); }
        },
        status: (s) => { const r = running.get(reply.id); if (r) { r.text = s; broadcastRunning(); } },
        approval: (req) => channels.askApproval(cid, agentId, req.title, req.command),
      }, abort.signal);

      sessions.set(cid, agentId, res.sessionId);
      const { text: clean, cards } = extractCards(res.text);
      reply.text = clean.trim() || `${agent.name} finished with no reply.`;
      reply.cards = cards.length ? cards : undefined;
      reply.status = "done";
      reply.createdAt = now(); // lands after any approval cards that came up while it worked
      reply.mentions = parseMentions(clean, agents.list().filter((a) => a.id !== agentId));
      channels.putMessage(reply);

      // Handoff: the agent @mentioned another agent in its reply.
      if (depth < config.maxHandoffDepth) {
        for (const other of reply.mentions) {
          if (!c.agentIds.includes(other) || chain?.has(other)) continue;
          chain?.add(other);
          void channels.runTurn(cid, other, clean, depth + 1, agentId, chain);
        }
      }
    } catch (e: any) {
      reply.status = "error";
      reply.text = reply.text || (e?.message === "stopped" ? "Stopped." : `Something went wrong: ${e?.message ?? e}`);
      channels.putMessage(reply);
    } finally {
      running.delete(reply.id);
      const still = [...running.values()].some((r) => r.channelId === cid);
      const cur = channels.get(cid);
      if (cur) channels.save({ ...cur, live: still });
      broadcastRunning();
    }
  },

  stop(cid: string) {
    for (const r of running.values()) if (r.channelId === cid) r.abort.abort();
  },

  running: () => [...running.values()].map(({ agentId, channelId, text }) => ({ agentId, channelId, text })),

  /** Puts an approval card in the channel and a nudge on Home, then waits for the answer. */
  askApproval(cid: string, agentId: string, title: string, command?: string): Promise<"approve" | "reject"> {
    const a: Approval = { id: id("apr"), agentId, channelId: cid, title, command, state: "waiting", createdAt: now(),
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
    docs.put("approval", a.id, a as any, cid);
    live.send({ type: "approval", approval: a });
    channels.putMessage({ id: id("msg"), channelId: cid, author: { kind: "agent", agentId }, text: "", mentions: [], status: "done",
      createdAt: now(), cards: [{ type: "approval", approvalId: a.id, title, command, state: "waiting" }] });
    proactive.nudge({ agentId, channelId: cid, kind: "approval", title, why: "Waiting for your OK", urgent: true,
      body: command, dedupeKey: a.id,
      actions: [
        { id: "approve", label: "Approve", primary: true, do: { type: "approve", approvalId: a.id, decision: "approve" } },
        { id: "reject", label: "Reject", do: { type: "approve", approvalId: a.id, decision: "reject" } },
        { id: "open", label: "Open", do: { type: "open", href: `/c?id=${cid}` } },
      ] });
    return new Promise((resolve) => {
      waitingApprovals.set(a.id, resolve);
      setTimeout(() => { if (waitingApprovals.has(a.id)) channels.decide(a.id, "reject", "expired"); }, 30 * 60_000).unref();
    });
  },

  decide(approvalId: string, decision: "approve" | "reject", as?: "expired") {
    const a = docs.get<Approval>("approval", approvalId);
    if (!a) throw new Error("No such approval");
    if (a.state !== "waiting") return a; // already decided somewhere else
    const next: Approval = { ...a, state: as ?? (decision === "approve" ? "approved" : "rejected") };
    docs.put("approval", a.id, next as any, a.channelId);
    live.send({ type: "approval", approval: next });
    // Update the card in the timeline.
    for (const m of channels.messages(a.channelId, undefined, 200)) {
      if (m.cards?.some((k) => k.type === "approval" && k.approvalId === a.id)) {
        m.cards = m.cards.map((k) => (k.type === "approval" && k.approvalId === a.id ? { ...k, state: next.state } : k));
        channels.putMessage(m, false);
      }
    }
    proactive.resolveByKey(a.id);
    waitingApprovals.get(a.id)?.(decision);
    waitingApprovals.delete(a.id);
    return next;
  },

  /** Updates a card on a message, e.g. a watch offer that was accepted. */
  updateCard(messageId: string, index: number, card: Card) {
    const m = docs.get<Message>("message", messageId);
    if (!m?.cards?.[index]) return;
    m.cards[index] = card;
    channels.putMessage(m, false);
  },
};

function broadcastRunning() {
  live.send({ type: "running", running: channels.running() });
}

/**
 * Agents can attach cards by ending a reply with a fenced block:
 * ```cards
 * [{"type":"watchOffer","draft":{...},"state":"offered"}]
 * ```
 * The block is removed from the text and shown as cards.
 */
function extractCards(text: string): { text: string; cards: Card[] } {
  const cards: Card[] = [];
  const clean = text.replace(/```cards\s*([\s\S]*?)```/g, (_, json) => {
    try { const v = JSON.parse(json); cards.push(...(Array.isArray(v) ? v : [v])); } catch { /* leave it out */ }
    return "";
  }).trim();
  return { text: clean, cards };
}
