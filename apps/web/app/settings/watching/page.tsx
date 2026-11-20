"use client";
// Everything the agents are watching for you. Stop any of them here.

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/Icon";
import { AgentFace, DeskBar } from "@/components/bits";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ago, cx } from "@/lib/util";

export default function WatchingPage() {
  return <Suspense><Watching /></Suspense>;
}

function Watching() {
  const focus = useSearchParams().get("id");
  const watches = useStore((s) => s.home?.watches ?? []);
  const channels = useStore((s) => s.channels);
  return (
    <>
      <header className="desk:hidden safe-top shrink-0 flex items-center px-2 pt-1 pb-1.5">
        <Link href="/" className="ib" aria-label="Back"><Icon name="left" size={22} /></Link>
        <span className="flex-1 text-center text-base font-semibold">Watching</span><span className="w-9" />
      </header>
      <DeskBar><span className="h text-lg font-semibold">Watching</span></DeskBar>
      <main className="flex-1 overflow-y-auto px-3.5 pb-6 desk:px-[26px] desk:py-5">
        <div className="max-w-[640px] flex flex-col gap-2">
          <p className="text-mute text-[13.5px] px-1 pb-1">When an agent finds something for you, it offers to watch for more. New matches show up on Home and as a notification.</p>
          {watches.map((w) => (
            <div key={w.id} className={cx("card p-3.5 flex flex-col gap-2", focus === w.id && "border-ink")}>
              <div className="flex items-center gap-2.5"><AgentFace id={w.agentId} size={26} /><span className="flex-1 text-[15px] font-semibold">{w.title}</span></div>
              <span className="text-mute text-[13px] leading-[18px]">{w.query}</span>
              <div className="flex items-center gap-2 text-xs text-mute">
                <span>{w.cadence === "event" ? "As things come in" : w.cadence === "hourly" ? "Every hour" : "Every morning"}</span><span>·</span>
                <span>{w.hits} found</span>{w.lastCheckedAt && <><span>·</span><span>checked {ago(w.lastCheckedAt)}</span></>}
                {w.channelId && <><span>·</span><Link href={`/c?id=${w.channelId}`} className="underline">{channels.find((c) => c.id === w.channelId)?.name}</Link></>}
                <span className="flex-1" />
                <button onClick={() => api.setWatch(w.id, { active: false })} className="btn btn-sec h-8">Stop watching</button>
              </div>
            </div>
          ))}
          {!watches.length && <div className="card p-4 text-mute text-[13.5px]">Nothing is being watched yet.</div>}
        </div>
      </main>
    </>
  );
}
