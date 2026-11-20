// Talks to the bridge. Same origin in production (the bridge serves this app).
// In dev, NEXT_PUBLIC_BRIDGE_URL points at the bridge on :8787.

import type { Agent, Channel, ChannelPanel, CronJob, CronRun, Home, Host, Message, Nudge, SearchResults, Settings, Watch, WatchDraft, Attachment } from "@kotatsu/shared";

export const BRIDGE = (process.env.NEXT_PUBLIC_BRIDGE_URL ?? "").replace(/\/$/, "");

const TOKEN_KEY = "kotatsu.token";

export const token = {
  get: () => (typeof localStorage === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  set(t: string) {
    localStorage.setItem(TOKEN_KEY, t);
    // The service worker reads it from IndexedDB to run notification buttons.
    const open = indexedDB.open("kotatsu", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onsuccess = () => open.result.transaction("kv", "readwrite").objectStore("kv").put(t, "token");
  },
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/**
 * The desktop app has no token the first time it opens. It says so in its user agent, and the bridge
 * gives it one, so nobody has to copy a six digit code between two windows.
 */
export async function claimDesktopToken(): Promise<boolean> {
  if (typeof navigator === "undefined" || !/KotatsuDesktop/.test(navigator.userAgent)) return false;
  try {
    const res = await fetch(`${BRIDGE}/api/desktop/token`, { cache: "no-store" });
    if (!res.ok) return false;
    const { token: t } = await res.json();
    if (!t) return false;
    token.set(t);
    return true;
  } catch {
    return false;
  }
}

export class NotPaired extends Error {}

async function req<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const t = token.get();
  const res = await fetch(`${BRIDGE}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...init.headers,
    },
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  if (res.status === 401) throw new NotPaired("Not paired");
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Error ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  host: () => req<Host>("/api/host"),
  pair: (code: string, name: string) => req<{ token: string }>("/api/pair", { method: "POST", json: { code, name } }),

  home: () => req<Home>("/api/home"),
  agents: () => req<Agent[]>("/api/agents"),
  detectAgents: () => req<{ runtime: string; label: string; ready: boolean; hint?: string; profiles?: string[] }[]>("/api/agents/detect"),
  addAgent: (body: Record<string, unknown>) => req<Agent>("/api/agents", { method: "POST", json: body }),
  pauseAgent: (id: string, paused: boolean) => req<Agent>(`/api/agents/${id}/pause`, { method: "POST", json: { paused } }),
  removeAgent: (id: string) => req<{ ok: boolean }>(`/api/agents/${id}`, { method: "DELETE" }),
  setOwner: (name: string) => req<{ ok: boolean; name: string }>("/api/owner", { method: "POST", json: { name } }),
  setupState: () => req<{ done: boolean; ownerName: string; agents: Agent[]; projects: number; later?: string[] }>("/api/setup/state"),
  saveSetup: (body: Record<string, unknown>) => req<{ ok: boolean }>("/api/setup", { method: "POST", json: body }),
  updateAgent: (id: string, patch: Partial<Agent>) => req<Agent>(`/api/agents/${id}`, { method: "PATCH", json: patch }),

  channels: () => req<Channel[]>("/api/channels"),
  channel: (id: string) => req<Channel>(`/api/channels/${id}`),
  newChannel: (body: { name: string; kind?: Channel["kind"]; text?: string; agentId?: string }) => req<Channel>("/api/channels", { method: "POST", json: body }),
  direct: (agentId: string) => req<Channel>(`/api/direct/${agentId}`, { method: "POST" }),
  messages: (id: string, before?: string) => req<Message[]>(`/api/channels/${id}/messages${before ? `?before=${encodeURIComponent(before)}` : ""}`),
  send: (id: string, text: string, opts: { agentId?: string; attachments?: Attachment[] } | string = {}) => {
    // Older call sites pass an agent id straight through; both shapes keep working.
    const body = typeof opts === "string" ? { text, agentId: opts } : { text, ...opts };
    return req<Message>(`/api/channels/${id}/messages`, { method: "POST", json: body });
  },
  read: (id: string) => req(`/api/channels/${id}/read`, { method: "POST" }),
  stop: (id: string) => req(`/api/channels/${id}/stop`, { method: "POST" }),
  panel: (id: string) => req<ChannelPanel>(`/api/channels/${id}/panel`),
  /** What the mic recorded, heard on the Mac. */
  transcribe: async (blob: Blob) => {
    const t = token.get();
    const res = await fetch(`${BRIDGE}/api/voice/transcribe`, {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": blob.type || "audio/webm", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: blob,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Error ${res.status}`);
    return res.json() as Promise<{ text: string }>;
  },
  /** One line of speech, in this agent's voice, made on the Mac. */
  speak: async (text: string, agentId?: string) => {
    const t = token.get();
    const res = await fetch(`${BRIDGE}/api/voice/speak`, {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: JSON.stringify({ text, agentId }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Error ${res.status}`);
    return res.blob();
  },
  jobHistory: (slug: string) =>
    req<{
      id: string; title: string; at: string; endedAt?: string; messages: number;
      /** The first thing the agent was asked, and how it ended. */
      preview?: string; last?: string; failed?: boolean; tookMin?: number;
    }[]>(`/api/crons/jobs/${encodeURIComponent(slug)}/history`),
  session: (id: string) =>
    req<{
      id: string; title: string; at: string; endedAt?: string; count: number;
      messages: { role: "user" | "agent" | "system"; text: string; at?: string }[];
    }>(`/api/sessions/${encodeURIComponent(id)}`),
  refreshBrief: () => req<{ ok: boolean }>(`/api/brief/refresh`, { method: "POST" }),
  dismissBrief: () => req<{ ok: boolean }>(`/api/brief/dismiss`, { method: "POST" }),
  models: () => req<Record<string, { id: string; label: string; provider?: string; context?: number }[]>>(`/api/models`),
  /** Who answers in this chat when nobody is mentioned. "all" means everyone. */
  setDefaultAgent: (channelId: string, defaultAgentId: string | null) =>
    req<Channel>(`/api/channels/${channelId}`, { method: "PATCH", json: { defaultAgentId } }),
  setModel: (channelId: string, agentId: string, model: string) =>
    req<{ ok: boolean }>(`/api/channels/${channelId}/model`, { method: "POST", json: { agentId, model } }),
  card: (messageId: string, i: number, state: "accepted" | "declined") => req(`/api/messages/${messageId}/cards/${i}`, { method: "POST", json: { state } }),

  decide: (approvalId: string, decision: "approve" | "reject") => req(`/api/approvals/${approvalId}`, { method: "POST", json: { decision } }),
  nudge: (id: string, state: Nudge["state"], snoozeUntil?: string) => req<Nudge>(`/api/nudges/${id}`, { method: "POST", json: { state, snoozeUntil } }),
  /** Sends one picture up to the Mac and gets back a link to put on the message. */
  upload: async (file: File) => {
    const t = token.get();
    const res = await fetch(`${BRIDGE}/api/upload`, {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": file.type || "image/jpeg", "x-filename": file.name, ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: file,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `Upload failed (${res.status})`);
    return (await res.json()) as { attachment: Attachment };
  },

  /** Puts a nudge back in a few hours instead of deleting it. */
  snooze: (id: string, hours: number) =>
    req<{ ok: boolean }>(`/api/nudges/${id}/act`, { method: "POST", body: JSON.stringify({ actionId: `snooze-${hours}` }) }),
  act: (id: string, actionId: string) => req<{ ok: boolean; href?: string }>(`/api/nudges/${id}/act`, { method: "POST", json: { actionId } }),

  watches: () => req<Watch[]>("/api/watches"),
  addWatch: (d: WatchDraft) => req<Watch>("/api/watches", { method: "POST", json: d }),
  setWatch: (id: string, patch: Partial<Watch>) => req<Watch>(`/api/watches/${id}`, { method: "PATCH", json: patch }),

  jobs: () => req<CronJob[]>("/api/crons/jobs"),
  runs: (q: { unread?: boolean; failed?: boolean; favorite?: boolean; job?: string } = {}) => {
    const p = new URLSearchParams();
    if (q.unread) p.set("unread", "1");
    if (q.failed) p.set("failed", "1");
    if (q.favorite) p.set("favorite", "1");
    if (q.job) p.set("job", q.job);
    return req<CronRun[]>(`/api/crons/runs?${p}`);
  },
  run: (id: string) => req<{ run: CronRun; job: CronJob }>(`/api/crons/runs/${id}`),
  setRun: (id: string, patch: Partial<Pick<CronRun, "read" | "favorite">>) => req<CronRun>(`/api/crons/runs/${id}`, { method: "PATCH", json: patch }),
  readAll: () => req("/api/crons/read-all", { method: "POST" }),

  settings: () => req<Settings & { devices: { name: string; lastSeenAt?: string }[] }>("/api/settings"),
  setSettings: (patch: Partial<Settings>) => req<Settings>("/api/settings", { method: "PATCH", json: patch }),
  search: (q: string) => req<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`),

  pushKey: () => req<{ key: string; enabled: boolean }>("/api/push/key"),
  subscribe: (subscription: PushSubscriptionJSON, device: string) => req("/api/push/subscribe", { method: "POST", json: { subscription, device } }),
};

export function liveUrl() {
  const base = BRIDGE || (typeof location !== "undefined" ? location.origin : "");
  return `${base.replace(/^http/, "ws")}/api/live?token=${encodeURIComponent(token.get() ?? "")}`;
}
