// What every agent is told at the start of a session in a channel. Keep it short: agents read it every time.

import type { Agent, Channel } from "@kotatsu/shared";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config";
import { agents } from "./agents";
import { auth } from "./auth";
import { ownerName } from "./owner";

// If the user drops a KNOWLEDGE.md into their data folder, every agent is grounded with it.
// Nothing personal ships in the repo: this is their file, on their machine.
const here = fileURLToPath(new URL(".", import.meta.url));
const KNOWLEDGE_FILE = process.env.KNOWLEDGE_FILE ?? resolve(config.dataDir, "KNOWLEDGE.md");
const knowledgeBase = (() => {
  try {
    const raw = readFileSync(KNOWLEDGE_FILE, "utf8");
    return `[Project knowledge base]\n${raw.trim()}`;
  } catch {
    return "";
  }
})();

const REPLY_SHAPE = [
  "How to answer, every time:",
  "- Answer first. The first line is the answer or the next action, never a preamble.",
  "- If it is a task, number the steps. If it is a choice, say which one you would take and why.",
  "- Short sentences. No em dashes. No emojis. No closing summary of what you just said.",
  "- Give a concrete time estimate when you are asking them to do something.",
  "- If something failed or is unverified, say so in one plain sentence.",
].join("\n");

export function agentContext(agent: Agent, channel: Channel): string {
  const shape = REPLY_SHAPE;
  const others = agents.list().filter((a) => a.id !== agent.id && channel.agentIds.includes(a.id));
  const base = `http://127.0.0.1:${config.port}/agent`;
  const token = auth.agentToken();
  const them = ownerName() || "the person using this app";
  const where = channel.kind === "project" ? `the ${channel.name} project channel` : channel.kind === "direct" ? `a direct chat with ${them}` : `a one off chat with ${them}`;

  const front = [
    shape,
    ``,
    `[Agent app] You are ${agent.name}. This is ${where}.`,
    others.length ? `Also here: ${others.map((o) => `${o.name} (good at ${o.goodAt.join(", ")})`).join("; ")}. To hand work to one of them, @mention them by name in your reply.` : "",
    `Write in plain, simple words. Short replies. Markdown is fine.`,
    ``,
    `Tools on this computer (send header "Authorization: Bearer ${token}"):`,
    `POST ${base}/nudges   {"title","body","why","kind":"email|cron|trend|idea|reminder","channelId","actions":[{"label","primary","do":{"type":"send","channelId","text"}}],"dedupeKey"}`,
    `   Use when ${them} should know or do something. Say why in "why". Never more than one nudge for the same thing.`,
    `POST ${base}/watches  {"title","query","cadence":"event|hourly|daily","channelId"}`,
    `   Only after ${them} says yes to watching something.`,
    `POST ${base}/metrics  {"channelId","key","label","unit":"usd|count|pct","goodWhen":"up|down","points":[{"t","v"}],"source"}`,
    `POST ${base}/brief    {"text","stats":[{"label","value","icon":"dollar|eye|clock"}]}`,
    ``,
    `After you find something for ${them} (an email, a page, a number), offer to keep watching by ending your reply with:`,
    "```cards",
    `[{"type":"watchOffer","state":"offered","draft":{"agentId":"${agent.id}","channelId":"${channel.id}","title":"<short title>","query":"<what to check for>","cadence":"event"}}]`,
    "```",
  ].filter((l) => l !== "").join("\n");

  return knowledgeBase ? `${front}\n\n${knowledgeBase}\n` : front;
}

/** The hourly check. Sent to the default agent in a hidden session. */
export function sweepPrompt(watches: { id: string; title: string; query: string; lastCheckedAt?: string }[]): string {
  return [
    `[Agent app, scheduled check] Look for anything new since the last check and post a nudge for each real find.`,
    `Watching:`,
    ...watches.map((w) => `- (${w.id}) ${w.title}: ${w.query}. Last checked ${w.lastCheckedAt ?? "never"}.`),
    `Also look at: new email that needs an answer, failed crons, big changes in project numbers.`,
    `If you have a useful idea for one of the projects here, you may post one "idea" nudge. Post nothing if nothing is new.`,
    `They asked for judgement, not links: when a find matters, name the project it affects and the one thing to do about it.`,
    `Skip anything that is only interesting. He wants the ones that change a decision, save money, or open a door.`,
    `When you post a nudge for a watch, include "watchId" in the nudge.`,
  ].join("\n");
}

export function briefPrompt(): string {
  return [
    `[Kotatsu, morning brief] Write today's brief and post it to /agent/brief.`,
    `One or two sentences: how many things need him, the biggest change in revenue or traffic, and overnight crons.`,
    `Only count a cron as a problem if it is still failing right now. A job that is paused, or whose next run is not scheduled, is not a problem: do not mention it.`,
    `End with the local time you checked, so they can see how old the brief is.`,
    `After every claim put its evidence in square brackets: the file, the command, or the record you looked at, for example [packages/web/package.json]. A claim you cannot cite does not go in the brief.`,
    `If you carry over a nudge from an earlier day, check it first (read the package.json, run the command, look at the cron). If it no longer holds, drop it and say what changed. Never repeat an old worry without doing that check.`,
    `Add up to 2 stats, for example {"label":"$4,310 this week","icon":"dollar"}.`,
  ].join("\n");
}
