// Generic demo data for screenshots and development. SEED=1 only, and only into an empty database.
// Delete these to start clean: ~/Library/Application Support/Kotatsu/kotatsu.db

import type { Message } from "@kotatsu/shared";
import { docs, id, kv } from "./db";
import { channels } from "./channels";
import { crons, metrics } from "./crons";
import { proactive } from "./proactive";

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

export function seed() {
  if (kv.get("seeded", false)) return;
  kv.set("seeded", true);

  // Two demo agents that need no sign in, so a screenshot never depends on an account.
  docs.put("agent", "scout", {
    id: "scout", name: "Scout", face: "fox", voice: "Calm, warm",
    goodAt: ["Email", "Research", "Writing"], runtime: "mock", runtimeLabel: "Demo agent",
    isDefault: true, online: true, createdAt: "2026-01-01T00:00:00.000Z",
  } as any);
  docs.put("agent", "maker", {
    id: "maker", name: "Maker", face: "owl", voice: "Clear, friendly",
    goodAt: ["Code", "Builds", "Design"], runtime: "mock", runtimeLabel: "Demo agent",
    isDefault: false, online: true, createdAt: "2026-01-01T00:00:00.000Z",
  } as any);

  const projects = [
    { id: "website", name: "Website", color: "#c96442", description: "The public site and the blog" },
    { id: "podcast", name: "Podcast", color: "#2f7d4f", description: "Weekly episodes and guests" },
    { id: "studio", name: "Studio", color: "#8a6a3c", description: "Client work" },
  ];
  for (const p of projects) channels.create({ ...p, kind: "project" });
  channels.direct("scout");
  channels.direct("maker");
  const oneoff = channels.create({ name: "Which laptop should I buy", kind: "oneoff", agentIds: ["maker"] });

  const msg = (cid: string, who: "user" | "scout" | "maker", text: string, min: number, extra: Partial<Message> = {}) =>
    channels.putMessage({ id: id("msg"), channelId: cid, author: who === "user" ? { kind: "user" } : { kind: "agent", agentId: who },
      text, mentions: [], status: "done", createdAt: ago(min), ...extra });

  msg("website", "scout", "Morning: 2 new signups, revenue $214 yesterday, and signup completion dropped after Tuesday.", 95);
  msg("website", "user", "@Maker why did signup completion drop this week?", 22, { mentions: ["maker"] });
  msg("website", "maker", "It fell after Tuesday's release. Step 3 now asks for a card before showing any value.\n\n@Scout can you move that step after the first project is created?", 21,
    { mentions: ["scout"], cards: [{ type: "stats", items: [{ label: "Before", value: "62%" }, { label: "Now", value: "41%", delta: "21 pts", good: false }] }] });
  msg("website", "scout", "Done. Here it is.", 10, { replyToAgent: "maker", cards: [
    { type: "link", title: "PR #218, move the card step after the first project", url: "https://github.com", sub: "3 files changed, tests passed", icon: "code" },
    { type: "actions", actions: [
      { id: "ship", label: "Ship it", primary: true, do: { type: "send", channelId: "website", agentId: "scout", text: "Ship PR #218" } },
      { id: "preview", label: "Preview", do: { type: "open", href: "https://example.com" } },
    ] },
  ] });

  msg("podcast", "user", "Find the email from the booking agent about the November guest", 60 * 44);
  msg("podcast", "scout", "Found it. Booking agent confirms a 45 minute recording on Nov 30, and asks for the topic list.", 60 * 44 - 1, { cards: [
    { type: "watchOffer", state: "accepted", draft: { agentId: "scout", channelId: "podcast", title: "Emails about the November guest", query: "New emails from the booking agent", cadence: "event" } },
  ] });
  msg("podcast", "scout", "A new one just came in. They moved the recording to Nov 25 and want two topics. Want me to draft a reply?", 4);
  msg("studio", "maker", "Two invoices went out this morning. One client has not paid in 30 days.", 60);
  msg("dm-scout", "scout", "Want me to tidy up the older chats?", 90);
  msg("dm-maker", "maker", "Here are three router options for a fiber line.", 60 * 24);
  msg(oneoff.id, "maker", "A 16 inch with 32 GB will last longer for your work.", 60 * 48);

  for (const c of channels.list()) if (!["website", "podcast"].includes(c.id)) channels.markRead(c.id);
  channels.save({ ...channels.get("website")!, unread: 2 });
  channels.save({ ...channels.get("podcast")!, unread: 1 });

  const w1 = proactive.addWatch({ agentId: "scout", channelId: "podcast", title: "Emails about the November guest", query: "New emails from the booking agent", cadence: "event" });
  proactive.saveWatch({ ...w1, hits: 2 });
  proactive.addWatch({ agentId: "maker", channelId: "website", title: "Visits well above normal", query: "Visits more than 50% above the 7 day average", cadence: "hourly" });
  proactive.addWatch({ agentId: "scout", title: "Payments over $500", query: "Any payment over $500", cadence: "event" });

  proactive.setBrief({ agentId: "scout", text: "2 things need you. Revenue is up 12% this week. 3 checks ran overnight and 1 failed.",
    stats: [{ label: "$4,310 this week", icon: "dollar" }, { label: "6,820 visits", icon: "eye" }] });

  const runs: [string, string, string, string, number][] = [
    ["backup", "Nightly backup", "1.2 TB backed up, 0 errors", "", 60 * 30],
    ["pain", "Customer pain digest", "7 posts about late payments", "studio", 60 * 29],
    ["repos", "Repo digest", "Top repo: an open source app for agents", "", 60 * 28],
    ["reading", "Weekly reading pick", "The surprising habits of original thinkers", "", 60 * 27],
    ["vault", "Log check", "Nothing unusual in 312 entries", "", 160],
  ];
  for (const [job, name, title, ch, min] of runs)
    crons.ingest({ job, name, title, channelId: ch || undefined, createdAt: ago(min), quiet: false,
      body: job === "reading"
        ? "## Why this one\nA talk on why good ideas often arrive late, and how to plan for that.\n\n## Worth noting\n- Quantity of ideas leads to quality\n- Being first matters less than being better"
        : `${title}.` });
  crons.ingest({ job: "content", name: "Content posting", title: "Did not post: provider out of credits", body: "The 6 AM post did not go out. The provider returned 402.", ok: false, channelId: "website", createdAt: ago(200) });
  for (const r of crons.runs({ limit: 50 })) if (["backup", "repos", "pain"].includes(r.job)) crons.update(r.id, { read: true });

  const days = (vals: number[]) => vals.map((v, i) => ({ t: ago((vals.length - 1 - i) * 60 * 24 * 2.5), v }));
  metrics.put({ channelId: "website", key: "revenue", label: "Revenue", unit: "usd", goodWhen: "up", source: "Stripe", points: days([120, 140, 130, 170, 150, 190, 180, 220, 210, 240, 230, 270]) });
  metrics.put({ channelId: "website", key: "visitors", label: "Visitors", unit: "count", goodWhen: "up", source: "Analytics", points: days([400, 440, 390, 520, 480, 500, 610, 580, 660, 700, 640, 720]) });
  metrics.put({ channelId: "website", key: "signup", label: "Signup finished", unit: "pct", goodWhen: "up", source: "Analytics", points: days([62, 61, 63, 60, 62, 58, 47, 43, 41, 42, 41, 41]) });

  const lid = id("lnk");
  docs.put("link", lid, { id: lid, channelId: "website", title: "example.com", url: "https://example.com", sub: "Live", icon: "link", order: 1, createdAt: ago(0) } as any, "website");

  proactive.nudge({ agentId: "scout", channelId: "website", kind: "trend", title: "Visits doubled yesterday", body: "1,240 visits. Most came from one forum post.", why: "You watch for traffic spikes", createdAt: ago(57),
    actions: [{ id: "show", label: "Show me", primary: true, do: { type: "open", href: "/c?id=website" } }, { id: "later", label: "Not now", do: { type: "dismiss" } }] });
  proactive.nudge({ agentId: "scout", channelId: "podcast", kind: "email", title: "New email about the November guest", body: "They moved the recording to Nov 25 and want two topics instead of one.", why: "You asked me to watch for this", watchId: w1.id, createdAt: ago(4),
    actions: [{ id: "draft", label: "Draft reply", primary: true, do: { type: "send", channelId: "podcast", agentId: "scout", text: "Draft a reply confirming Nov 25 and two topics." } }, { id: "open", label: "Open", do: { type: "open", href: "/c?id=podcast" } }, { id: "later", label: "Not now", do: { type: "dismiss" } }] });

  console.log("[seed] demo data added");
}
