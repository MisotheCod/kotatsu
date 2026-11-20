// The proactive part: nudges, watches, the morning brief and the scheduled check.
//
// Rules:
// - At most settings.maxNudgesPerDay nudges a day. Urgent ones (approvals) do not count.
// - During quiet hours nudges are saved but no push is sent, except urgent ones.
// - The same dedupeKey twice in a day is ignored.
// - Every nudge also goes out as a push notification with up to two buttons.

import type { Brief, Home, Nudge, Settings, Watch, WatchDraft } from "@kotatsu/shared";
import { DEFAULT_SETTINGS } from "@kotatsu/shared";
import { docs, id, kv, now } from "./db";
import { live } from "./live";
import { push } from "./push";
import { agents } from "./agents";
import { ownerName } from "./owner";
import { briefPrompt, sweepPrompt } from "./context";

export const settings = {
  get: (): Settings => ({ ...DEFAULT_SETTINGS, ...kv.get<Partial<Settings>>("settings", {}) }),
  set(patch: Partial<Settings>) { const s = { ...settings.get(), ...patch }; kv.set("settings", s); return s; },
};

function localParts(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hm: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}

function isQuiet(s: Settings, d = new Date()) {
  const { hm } = localParts(d, s.timezone);
  return s.quietStart > s.quietEnd ? hm >= s.quietStart || hm < s.quietEnd : hm >= s.quietStart && hm < s.quietEnd;
}

function startOfToday(s: Settings) {
  // Good enough: last 24 hours that share today's local date.
  const today = localParts(new Date(), s.timezone).day;
  return docs.since<Nudge>("nudge", new Date(Date.now() - 36 * 3600_000).toISOString())
    .filter((n) => localParts(new Date(n.createdAt), s.timezone).day === today);
}

export const proactive = {
  nudge(input: Omit<Nudge, "id" | "state" | "createdAt"> & { createdAt?: string }): Nudge | null {
    const s = settings.get();
    const today = startOfToday(s);
    if (input.dedupeKey && today.some((n) => n.dedupeKey === input.dedupeKey)) return null;
    if (!input.urgent && today.filter((n) => !n.urgent).length >= s.maxNudgesPerDay) {
      console.log("[nudge] daily limit reached, skipped:", input.title);
      return null;
    }
    const n: Nudge = { ...input, id: id("ndg"), state: "open", createdAt: input.createdAt ?? now() };
    docs.put("nudge", n.id, n as any, n.channelId);
    live.send({ type: "nudge", nudge: n });

    if (n.watchId) {
      const w = docs.get<Watch>("watch", n.watchId);
      if (w) proactive.saveWatch({ ...w, hits: w.hits + 1, lastCheckedAt: now() });
    }

    if (n.urgent || !isQuiet(s)) {
      const agent = agents.get(n.agentId);
      const ch = n.channelId ? docs.get<{ name: string }>("channel", n.channelId) : undefined;
      void push.send({
        title: `${agent?.name ?? "Agent"}${ch ? `, ${ch.name}` : ""}`,
        body: `${n.title}${n.body ? `. ${n.body}` : ""}`,
        url: n.channelId ? `/c?id=${n.channelId}` : "/",
        tag: n.dedupeKey ?? n.id,
        nudgeId: n.id,
        actions: n.actions.filter((a) => a.do.type !== "open").slice(0, 2).map((a) => ({ action: a.id, title: a.label })),
        badge: proactive.openNudges().length,
        icon: `/avatars/${agent?.face ?? "fox"}.webp`,
      });
    }
    return n;
  },

  openNudges(): Nudge[] {
    const t = Date.now();
    return docs.all<Nudge>("nudge", 300).filter((n) => n.state === "open" || (n.state === "snoozed" && n.snoozeUntil && Date.parse(n.snoozeUntil) <= t));
  },

  setNudge(nid: string, state: Nudge["state"], snoozeUntil?: string) {
    const n = docs.get<Nudge>("nudge", nid);
    if (!n) return undefined;
    const next = { ...n, state, snoozeUntil };
    docs.put("nudge", nid, next as any, n.channelId);
    live.send({ type: "nudge", nudge: next });
    return next;
  },

  resolveByKey(key: string) {
    for (const n of proactive.openNudges()) if (n.dedupeKey === key) proactive.setNudge(n.id, "done");
  },

  // Watches
  watches: () => docs.all<Watch>("watch").filter((w) => w.active),
  addWatch(d: WatchDraft) {
    const w: Watch = { ...d, id: id("wch"), createdAt: now(), hits: 0, active: true };
    return proactive.saveWatch(w);
  },
  saveWatch(w: Watch) {
    docs.put("watch", w.id, w as any, w.channelId);
    live.send({ type: "watch", watch: w });
    return w;
  },

  // Brief
  brief: () => docs.all<Brief & { id: string }>("brief", 1)[0],
  dismissBrief: (id: string) => { kv.set("briefDismissed", id); },
  setBrief(b: Omit<Brief, "createdAt">) {
    const brief: Brief & { id: string } = { ...b, id: id("brf"), createdAt: now() };
    docs.put("brief", brief.id, brief as any);
    live.send({ type: "brief", brief });
    return brief;
  },

  home(running: Home["running"]): Home {
    const s = settings.get();
    const doneToday = startOfToday(s).filter((n) => n.state === "done");
    const stored = proactive.brief();
    // A brief he has cleared stays cleared. It is a message, not a permanent fixture.
    const brief = !s.briefEnabled || (stored && kv.get<string>("briefDismissed", "") === (stored as any).id) ? undefined : stored;
    return {
      ownerName: ownerName(),
      brief: brief && Date.now() - Date.parse(brief.createdAt) < 20 * 3600_000 ? brief : undefined,
      nudges: proactive.openNudges(),
      watches: proactive.watches(),
      earlier: doneToday.slice(0, 5).map((n) => ({ agentId: n.agentId, text: n.title, at: n.createdAt })),
      running,
    };
  },

  /** Runs every minute. Sends the scheduled check and the morning brief to the default agent. */
  startScheduler(runHidden: (agentId: string, prompt: string) => Promise<void>) {
    const tick = async () => {
      const s = settings.get();
      const { day, hm } = localParts(new Date(), s.timezone);
      const last = kv.get<{ sweep?: string; brief?: string }>("scheduler", {});
      const def = agents.default();
      if (!def) return;

      if (s.briefEnabled && hm >= s.briefAt && last.brief !== day && !isQuiet(s)) {
        kv.set("scheduler", { ...last, brief: day });
        await runHidden(def.id, briefPrompt()).catch((e) => console.warn("[brief]", e.message));
        return;
      }
      const due = !last.sweep || Date.now() - Date.parse(last.sweep) >= s.sweepMinutes * 60_000;
      if (due && !isQuiet(s)) {
        kv.set("scheduler", { ...last, sweep: now() });
        const ws = proactive.watches();
        await runHidden(def.id, sweepPrompt(ws)).catch((e) => console.warn("[sweep]", e.message));
        for (const w of ws) proactive.saveWatch({ ...w, lastCheckedAt: now() });
      }
    };
    setInterval(() => void tick(), 60_000).unref();
  },
};
