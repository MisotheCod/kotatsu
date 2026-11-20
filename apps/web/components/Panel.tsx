"use client";
// The project panel: numbers, crons and links for one project. A right column on desktop, a sheet on the phone.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ChannelPanel } from "@kotatsu/shared";
import { Icon } from "./Icon";
import { ChannelIcon, Sparkline } from "./bits";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ago, cx, metricSummary } from "@/lib/util";

export function usePanel(channelId: string) {
  const [p, setP] = useState<ChannelPanel | null>(null);
  // Refetch when a cron for this project or anything in it changes.
  const tick = useStore((s) => s.runs[0]?.id + (s.channels.find((c) => c.id === channelId)?.updatedAt ?? ""));
  useEffect(() => { api.panel(channelId).then(setP).catch(() => setP(null)); }, [channelId, tick]);
  return p;
}

export function PanelBody({ p }: { p: ChannelPanel }) {
  const [big, ...rest] = p.metrics;
  return (
    <div className="flex flex-col gap-2.5">
      {big && <MetricCard m={big} big />}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-2">{rest.map((m) => <MetricCard key={m.key} m={m} />)}</div>
      )}
      {!p.metrics.length && (
        <div className="card px-3.5 py-3 text-mute text-[13px] leading-[18px]">No numbers yet. Ask an agent to connect Stripe or analytics for {p.channel.name} and post them here.</div>
      )}
      {p.crons.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center px-3.5 pt-3 pb-1.5"><span className="lbl flex-1">Crons</span><Link href="/crons" className="text-mute-2 text-xs">See all</Link></div>
          {p.crons.map(({ job, last }) => (
            <Link key={job.slug} href={last ? `/crons/run?id=${last.id}` : "/crons"} className="flex items-center gap-2.5 px-3.5 py-2.5 border-t border-line-3">
              <span className={job.failing ? "text-bad" : "text-good"}><Icon name={job.failing ? "alert" : "check"} size={15} stroke={job.failing ? 1.8 : 2.2} /></span>
              <span className="flex-1 min-w-0 flex flex-col gap-px"><span className="text-[14px] font-semibold">{job.name}</span>
                <span className={cx("one text-[12.5px]", job.failing ? "text-bad" : "text-mute")}>{last?.title ?? "No runs yet"}</span></span>
              <span className="text-mute-2 text-xs">{ago(job.lastRunAt)}</span>
            </Link>
          ))}
        </div>
      )}
      {p.links.length > 0 && (
        <div className="card overflow-hidden">
          <div className="lbl px-3.5 pt-3 pb-1.5">Links</div>
          {p.links.map((l) => (
            <a key={l.url + l.title} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-3.5 py-2.5 border-t border-line-3">
              <span className="text-mute"><Icon name={l.icon === "code" ? "code" : l.icon === "dollar" ? "dollar" : "link"} size={16} /></span>
              <span className="flex-1 text-[14px]">{l.title}</span>{l.sub && <span className="text-mute-2 text-xs">{l.sub}</span>}
              <span className="text-mute-2"><Icon name="ext" size={13} /></span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCard({ m, big }: { m: ChannelPanel["metrics"][number]; big?: boolean }) {
  const s = metricSummary(m);
  return (
    <div className="card rounded-[14px] p-3 flex flex-col gap-1 min-w-0" title={m.source ? `From ${m.source}` : undefined}>
      <span className="text-mute text-xs one">{m.label}</span>
      <span className="flex items-center gap-1.5"><span className={cx("h font-semibold", big ? "text-[22px]" : "text-[18px]")}>{s.value}</span>
        <span className={cx("text-xs font-semibold", s.good ? "text-good" : "text-bad")}>{s.delta}</span></span>
      <Sparkline values={m.points.map((p) => p.v)} good={s.good} />
    </div>
  );
}

/** Phone: slides up over the channel. */
export function PanelSheet({ channelId, onClose }: { channelId: string; onClose: () => void }) {
  const p = usePanel(channelId);
  return (
    <div className="desk:hidden fixed inset-0 z-30 flex flex-col">
      <button className="absolute inset-0 bg-ink/30" onClick={onClose} aria-label="Close" />
      <div className="relative mt-auto max-h-[92dvh] bg-paper rounded-t-[22px] px-3.5 pt-2 safe-bottom overflow-y-auto shadow-[0_-8px_30px_rgba(0,0,0,.12)] appear">
        <span className="block w-[38px] h-[5px] rounded-full bg-[#d6d3cb] mx-auto mb-2" />
        {p ? (
          <>
            <div className="flex items-center gap-2.5 px-0.5 pb-2.5"><ChannelIcon channel={p.channel} size={30} /><span className="h text-xl font-semibold flex-1">{p.channel.name}</span><span className="tag">Last 30 days</span></div>
            <PanelBody p={p} />
            <div className="h-4" />
          </>
        ) : <div className="h-40" />}
      </div>
    </div>
  );
}

/** Desktop: a column on the right. */
export function PanelColumn({ channelId }: { channelId: string }) {
  const p = usePanel(channelId);
  return (
    <aside className="hidden desk:flex w-[360px] shrink-0 border-l border-line bg-[#f3f1ed] p-4 flex-col gap-2.5 overflow-y-auto">
      <div className="flex items-center"><span className="h text-[15px] font-semibold flex-1">Performance</span><span className="tag">Last 30 days</span></div>
      {p && <PanelBody p={p} />}
    </aside>
  );
}
