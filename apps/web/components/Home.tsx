"use client";
// Home pieces: the brief, nudge cards, the watching list, and the earlier today list.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Brief, Nudge, NudgeKind, Watch } from "@kotatsu/shared";
import { Icon, type IconName } from "./Icon";
import { AgentFace, ChannelIcon } from "./bits";
import { api } from "@/lib/api";
import { useAgent, useChannel } from "@/lib/store";
import { ago, cx } from "@/lib/util";

const KIND_ICON: Record<NudgeKind, IconName> = {
  email: "mail", cron: "alert", trend: "trend", idea: "bulb", approval: "alert", update: "refresh", reminder: "bell",
};

export function BriefCard({ brief }: { brief: Brief }) {
  const [busy, setBusy] = useState(false);
  // A brief is a snapshot. Past six hours it stops being true and starts being a trap.
  const ageH = (Date.now() - new Date(brief.createdAt).getTime()) / 3600_000;
  const stale = ageH > 6;
  const [gone, setGone] = useState(false);
  const refresh = async () => {
    setBusy(true);
    try { await api.refreshBrief(); } finally { setBusy(false); }
  };
  const dismiss = async () => {
    setGone(true);
    await api.dismissBrief().catch(() => {});
  };
  if (gone) return null;
  // Highlight a percentage so the eye lands on the change.
  const parts = brief.text.split(/(\d+%)/);
  return (
    <div className="appear rounded-2xl bg-ink text-white px-3.5 pt-3.5 pb-3 flex flex-col gap-2.5">
      <span className="text-[15px] leading-[22px]">
        {parts.map((p, i) => (/^\d+%$/.test(p) ? <b key={i} className="text-good-light">{p}</b> : p))}
      </span>
      <div className="flex items-center gap-4 text-[12.5px] text-[#b9b7ae]">
        {brief.stats.slice(0, 2).map((s) => (
          <span key={s.label} className="flex items-center gap-1.5 one">{s.icon && <Icon name={s.icon} size={13} />}{s.value ? `${s.value} ` : ""}{s.label}</span>
        ))}
        <span className="flex-1" />
        <span className={cx("flex items-center gap-1.5", stale && "text-[#e8c99a]")}>
          <AgentFace id={brief.agentId} size={16} />
          {stale ? `from ${Math.round(ageH)}h ago` : new Date(brief.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
        <button onClick={refresh} disabled={busy} className="text-[#b9b7ae] hover:text-white" aria-label="Rewrite the brief">
          <Icon name="refresh" size={13} />
        </button>
        <button onClick={dismiss} className="text-[#b9b7ae] hover:text-white ml-1" aria-label="Clear the brief">
          <Icon name="x" size={13} />
        </button>
      </div>
    </div>
  );
}

export function NudgeCard({ nudge, lead }: { nudge: Nudge; lead?: boolean }) {
  const agent = useAgent(nudge.agentId);
  const channel = useChannel(nudge.channelId);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState(false);

  async function run(actionId: string) {
    const a = nudge.actions.find((x) => x.id === actionId)!;
    if (a.do.type === "open" && /^https?:/.test(a.do.href)) window.open(a.do.href, "_blank");
    setBusy(actionId);
    try {
      const r = await api.act(nudge.id, actionId);
      setGone(true);
      if (r.href && !/^https?:/.test(r.href)) router.push(r.href);
    } finally { setBusy(null); }
  }

  if (gone) return null;
  return (
    <div className="appear card p-3.5 flex flex-col gap-[9px]">
      <div className="flex items-center gap-2">
        <AgentFace id={nudge.agentId} size={22} />
        <span className="text-[12.5px] font-semibold">{agent?.name}</span>
        <span className="text-mute-2 text-xs">{ago(nudge.createdAt)}</span>
        <span className="flex-1" />
        {channel && <Link href={`/c?id=${channel.id}`} className="tag"><ChannelIcon channel={channel} size={13} />{channel.name}</Link>}
      </div>
      <span className={cx("font-semibold leading-[21px]", lead ? "text-[18px] leading-[24px]" : "text-[15.5px]")}>{nudge.title}</span>
      {nudge.body && <span className="text-[13.5px] leading-[19px] text-ink-2">{nudge.body}</span>}
      {nudge.why && <span className="flex items-center gap-1.5 text-mute text-xs"><Icon name={KIND_ICON[nudge.kind]} size={13} />{nudge.why}</span>}
      {lead && nudge.body && <span className="text-[13px] text-mute flex items-center gap-1.5"><Icon name="clock" size={13} />about {estimate(nudge)}</span>}
      <div className="flex gap-1.5 mt-0.5">
        {nudge.actions.map((a, i) => (
          <button key={a.id} onClick={() => run(a.id)} disabled={busy !== null}
            className={cx("btn", a.primary || (i === 0 && !nudge.actions.some((x) => x.primary)) ? "btn-pri flex-1" : "btn-sec", busy === a.id && "opacity-60")}>
            {a.label}
          </button>
        ))}
        {lead && (
          <button onClick={async () => { setBusy("later"); try { await api.snooze(nudge.id, 6); setGone(true); } finally { setBusy(null); } }}
            disabled={busy !== null} className="btn btn-ghost">Later</button>
        )}
      </div>
    </div>
  );
}

/** A rough cost in time, so the decision includes its price. */
function estimate(n: Nudge) {
  if (/upgrade|migrat|refactor/i.test(n.title)) return "an hour or two";
  if (/draft|write|list|outreach/i.test(n.title)) return "15 minutes";
  if (/check|review|read/i.test(n.title)) return "5 minutes";
  return "a few minutes";
}

export function WatchRow({ watch, last }: { watch: Watch; last?: boolean }) {
  const sub = watch.hits ? `Since ${new Date(watch.createdAt).toLocaleDateString("en-US", { weekday: "long" })}, ${watch.hits} found`
    : watch.cadence === "hourly" ? "Checks every hour" : watch.cadence === "daily" ? "Checks every morning" : "Checks as things come in";
  return (
    <Link href={`/settings/watching?id=${watch.id}`} className={cx("flex items-center gap-2.5 px-3.5 py-[11px]", !last && "border-b border-line-3")}>
      <AgentFace id={watch.agentId} size={22} />
      <span className="flex-1 flex flex-col gap-px min-w-0"><span className="one text-[14px] font-medium">{watch.title}</span><span className="one text-mute text-xs">{sub}</span></span>
      <span className="text-mute-2"><Icon name="right" size={14} /></span>
    </Link>
  );
}

export function WatchList({ watches }: { watches: Watch[] }) {
  if (!watches.length) return <div className="card px-3.5 py-3 text-mute text-[13px]">Nothing yet. When an agent finds something for you, it will offer to watch for more.</div>;
  return <div className="card overflow-hidden">{watches.map((w, i) => <WatchRow key={w.id} watch={w} last={i === watches.length - 1} />)}</div>;
}

export function EarlierList({ items }: { items: { agentId: string; text: string; at: string }[] }) {
  return (
    <div className="card overflow-hidden">
      {items.map((e, i) => (
        <div key={i} className={cx("flex items-center gap-2.5 px-3.5 py-[11px]", i < items.length - 1 && "border-b border-line-3")}>
          <AgentFace id={e.agentId} size={22} /><span className="one flex-1 text-[14px]">{e.text}</span>
          <span className="text-mute-2 text-xs">{new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/ [AP]M/, "")}</span>
        </div>
      ))}
    </div>
  );
}

export function RunningCard({ item }: { item: { agentId: string; channelId: string; text: string; progress?: number } }) {
  const agent = useAgent(item.agentId);
  const channel = useChannel(item.channelId);
  return (
    <Link href={`/c?id=${item.channelId}`} className="card px-3.5 py-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <AgentFace id={item.agentId} size={22} /><span className="flex-1 text-[13.5px] font-semibold">{agent?.name}</span>
        {channel && <span className="tag"><ChannelIcon channel={channel} size={13} />{channel.name}</span>}
      </div>
      <span className="text-[13.5px] flex items-center gap-2"><span className="live" />{item.text}</span>
    </Link>
  );
}
