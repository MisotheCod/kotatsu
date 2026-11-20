// Shared types between the web app and the bridge. One source of truth for the data shape.

export type AgentId = string; // a slug picked when the agent is added

export type Face =
  | "fox" | "owl" | "bear" | "cat" | "panda" | "penguin" | "puppy" | "frog" | "red-panda" | "duck";

export const FACES: Face[] = ["fox", "owl", "bear", "cat", "panda", "penguin", "puppy", "frog", "red-panda", "duck"];

/** How an agent runs. Each one is an adapter in the bridge. */
export type Runtime = "hermes" | "claude" | "codex" | "http" | "mock";

/** Everything needed to start one adapter. Stored with the agent, editable in the app. */
export type AgentRuntimeConfig = {
  /** hermes: which Hermes profile and where its gateway lives. */
  profile?: string;
  url?: string;
  token?: string;
  /** claude and codex: the folder it works in, its model, and its own instructions. */
  cwd?: string;
  model?: string;
  instructions?: string;
};

export interface Agent {
  id: AgentId;
  name: string;
  face: Face;
  voice: string;          // a plain description of how it should sound
  voiceId?: string;       // the ElevenLabs voice it actually speaks with
  voiceLocal?: string;    // the local Kokoro voice, used when the local service is up
  goodAt: string[];       // shown in the @ picker and used for routing hints
  runtime: Runtime;
  runtimeLabel: string;   // "Hermes on this Mac"
  isDefault: boolean;     // answers when nobody is @mentioned. Exactly one agent.
  online: boolean;
  model?: string;         // the model this agent runs on by default
  workspace?: string;     // the folder it works in, its own desk
  config?: AgentRuntimeConfig; // how to start it: profile, address, folder, instructions
  paused?: boolean;       // kept in the app but not asked anything
}

export type ChannelKind = "project" | "direct" | "oneoff";

export interface Channel {
  id: string;
  /** Per agent model override, set from the chat header. */
  models?: Record<string, string>;
  /** Set on a channel that only reads a session living somewhere else (the Hermes desktop app). */
  mirror?: boolean;
  /** Who answers when nobody is mentioned. "all" means every member answers. */
  defaultAgentId?: AgentId | "all";
  kind: ChannelKind;
  name: string;
  description?: string;
  logo?: string;          // url to an svg or png, falls back to a letter tile
  color?: string;         // letter tile color when there is no logo
  agentIds: AgentId[];    // members. A direct channel has exactly one.
  unread: number;
  live: boolean;          // an agent is working in this channel right now
  lastMessage?: { authorName: string; text: string; at: string };
  updatedAt: string;
  archived?: boolean;
}

export type Author = { kind: "user" } | { kind: "agent"; agentId: AgentId } | { kind: "system" };

export interface Action {
  id: string;
  label: string;
  primary?: boolean;
  do: ActionDo;
}

export type ActionDo =
  | { type: "send"; channelId: string; agentId?: AgentId; text: string }   // sends a message as the user
  | { type: "open"; href: string }                                          // opens a page in the app or a link
  | { type: "approve"; approvalId: string; decision: "approve" | "reject" }
  | { type: "watch"; watch: WatchDraft }                                    // starts a watch
  | { type: "snooze"; hours: number }                                        // later today, come back
  | { type: "dismiss" };

export type Card =
  | { type: "actions"; title?: string; body?: string; actions: Action[] }
  | { type: "approval"; approvalId: string; title: string; command?: string; state: "waiting" | "approved" | "rejected" | "expired" }
  | { type: "stats"; items: { label: string; value: string; delta?: string; good?: boolean }[] }
  | { type: "link"; title: string; url: string; sub?: string; icon?: "code" | "link" | "mail" | "file" }
  | { type: "watchOffer"; draft: WatchDraft; state: "offered" | "accepted" | "declined" }
  | { type: "report"; title: string; changed: string[]; verified: string[]; unproven: string[] };

/** A picture sent with a message. Stored on the Mac, linked from the message. */
export interface Attachment {
  id: string;
  url: string;          // /uploads/<file>, served by the bridge
  mime: string;
  name?: string;
  size?: number;
  width?: number;
  height?: number;
}

export interface Message {
  id: string;
  channelId: string;
  author: Author;
  text: string;           // markdown
  mentions: AgentId[];
  cards?: Card[];
  attachments?: Attachment[];
  status: "streaming" | "done" | "error";
  pending?: boolean;      // the turn has started but nothing has arrived yet
  createdAt: string;
  replyToAgent?: AgentId; // set on agent to agent handoffs
}

export type NudgeKind = "email" | "cron" | "trend" | "idea" | "approval" | "update" | "reminder";

export interface Nudge {
  id: string;
  agentId: AgentId;
  channelId?: string;
  kind: NudgeKind;
  title: string;
  body?: string;
  why: string;            // "You asked me to watch for this on Monday"
  actions: Action[];
  state: "open" | "done" | "dismissed" | "snoozed";
  snoozeUntil?: string;
  watchId?: string;
  dedupeKey?: string;     // the same key twice in a day is ignored
  createdAt: string;
  urgent?: boolean;       // approvals. Skips the daily cap, still respects quiet hours unless set
}

export interface WatchDraft {
  agentId: AgentId;
  channelId?: string;
  title: string;          // "Influential emails about the Lumora deal"
  query: string;          // what the agent checks for, in plain words
  cadence: "event" | "hourly" | "daily";
}

export interface Watch extends WatchDraft {
  id: string;
  createdAt: string;
  lastCheckedAt?: string;
  hits: number;
  active: boolean;
}

export interface CronJob {
  /** A name that fits on one line: "Creator Outreach", not the slug. */
  short?: string;
  /** One sentence saying what the job does, shown in the list and at the top of the job page. */
  what?: string;
  slug: string;
  name: string;
  channelId?: string;     // runs that belong to a project show in its panel
  lastRunAt?: string;
  failing: boolean;
  schedule?: string;      // set for a job Hermes schedules that has not posted a run yet
  scheduled?: boolean;
}

export interface CronRun {
  id: string;
  job: string;            // CronJob.slug
  title: string;
  body: string;           // markdown
  imageUrl?: string;
  quiet: boolean;
  ok: boolean;
  read: boolean;
  favorite: boolean;
  createdAt: string;
}

export interface MetricPoint { t: string; v: number }

export interface Metric {
  channelId: string;
  key: string;            // "revenue", "visitors", "tour_completion"
  label: string;          // "Revenue"
  unit: "usd" | "count" | "pct";
  goodWhen: "up" | "down";
  points: MetricPoint[];  // oldest first
  source?: string;        // "Stripe", "Plausible"
  updatedAt: string;
}

export interface Brief {
  agentId: AgentId;
  text: string;           // one or two sentences
  stats: { label: string; value?: string; icon?: "dollar" | "eye" | "clock" }[];
  createdAt: string;
}

export interface Approval {
  id: string;
  agentId: AgentId;
  channelId: string;
  title: string;
  command?: string;
  state: "waiting" | "approved" | "rejected" | "expired";
  createdAt: string;
  expiresAt: string;
}

export interface Settings {
  maxNudgesPerDay: number;     // default 6
  quietStart: string;          // "22:00"
  quietEnd: string;            // "07:00"
  sweepMinutes: number;        // how often the default agent checks watches, default 60
  briefAt: string;             // "08:00"
  briefEnabled?: boolean;      // false = no morning brief at all
  timezone: string;            // "America/New_York"
}

export interface Host {
  name: string;
  online: boolean;
  bridgeVersion: string;
  startedAt: string;
}

export interface Home {
  ownerName?: string;
  brief?: Brief;
  nudges: Nudge[];            // open only, newest first
  watches: Watch[];
  earlier: { agentId: AgentId; text: string; at: string }[]; // done today
  running: { agentId: AgentId; channelId: string; text: string; progress?: number }[];
}

export interface ChannelPanel {
  channel: Channel;
  metrics: Metric[];
  crons: { job: CronJob; last?: CronRun; next?: string }[];
  links: { title: string; url: string; sub?: string; icon: "link" | "code" | "dollar" }[];
}

export interface SearchResults {
  channels: { channel: Channel; snippet: string; at: string }[];
  runs: { run: CronRun; job: CronJob }[];
  watches: Watch[];
}

// Live events pushed over the WebSocket at /api/live
export type LiveEvent =
  | { type: "hello"; host: Host }
  | { type: "message"; message: Message }
  | { type: "message.delta"; id: string; channelId: string; text: string }   // full text so far, not a diff
  | { type: "channel"; channel: Channel }
  | { type: "nudge"; nudge: Nudge }
  | { type: "brief"; brief: Brief }
  | { type: "watch"; watch: Watch }
  | { type: "cron"; run: CronRun; job: CronJob }
  | { type: "metric"; metric: Metric }
  | { type: "agent"; agent: Agent }
  | { type: "agents" }
  | { type: "channels" }
  | { type: "approval"; approval: Approval }
  | { type: "running"; running: Home["running"] };

export const DEFAULT_SETTINGS: Settings = {
  maxNudgesPerDay: 6,
  quietStart: "22:00",
  quietEnd: "07:00",
  sweepMinutes: 60,
  briefAt: "08:00",
  timezone: "America/New_York",
};

/** Pull @mentions out of text, matched against agent names, case insensitive. */
export function parseMentions(text: string, agents: Pick<Agent, "id" | "name">[]): AgentId[] {
  // @all (or @everyone) asks the whole room.
  if (/@(all|everyone)\b/i.test(text)) return agents.map((a) => a.id as AgentId);
  const found: AgentId[] = [];
  for (const m of text.matchAll(/@([\p{L}\p{N}_-]+)/gu)) {
    const a = agents.find((x) => x.name.toLowerCase() === m[1].toLowerCase() || x.id === m[1].toLowerCase());
    if (a && !found.includes(a.id)) found.push(a.id);
  }
  return found;
}
