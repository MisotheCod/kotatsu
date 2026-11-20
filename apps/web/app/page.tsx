"use client";
// Home is Today: a short brief, nudges with buttons, what the agents are watching.
// Desktop adds a right column with what is running now.

import Link from "next/link";
import { Icon } from "@/components/Icon";
import { DeskBar, Empty, PageTitle, Section } from "@/components/bits";
import { BriefCard, EarlierList, NudgeCard, RunningCard, WatchList } from "@/components/Home";
import { useStore } from "@/lib/store";
import { greeting, longDate, useMounted } from "@/lib/util";

export default function HomePage() {
  const home = useStore((s) => s.home);
  const status = useStore((s) => s.status);
  const m = useMounted();
  const owner = home?.ownerName ?? "";
  const title = owner ? (m ? `${greeting()}, ${owner}` : `Hi ${owner}`) : "Hi there";
  const date = m ? longDate() : "";

  return (
    <>
      <PageTitle sub={date || " "} title={title}
        right={<Link href="/search" className="ib ib-card" aria-label="Search"><Icon name="search" size={18} /></Link>} />
      <DeskBar><span className="h text-lg font-semibold">Home</span><span className="text-mute text-[13px]">{date}</span></DeskBar>

      <main className="flex-1 overflow-y-auto">
        <div className="flex gap-[22px] px-3.5 pb-6 desk:px-[26px] desk:py-[22px]">
          <div className="flex-1 min-w-0 max-w-[680px] flex flex-col gap-2.5">
            <span className="hidden desk:block h text-[28px] font-semibold pb-1">{title}</span>
            {status === "loading" && <Skeleton />}
            {home?.brief && <BriefCard brief={home.brief} />}

            {home && home.nudges.length > 0 && (
              <>
                <Section label="For you" right={<span className="text-mute-2 text-xs">{home.nudges.length}</span>} />
                {/* One decision at a time. The rest wait behind a tap, not to be ignored, just to be ordered. */}
                <NudgeCard key={home.nudges[0].id} nudge={home.nudges[0]} lead />
                {home.nudges.length > 1 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[12.5px] text-mute px-1 py-1.5">{home.nudges.length - 1} more open</summary>
                    <div className="flex flex-col gap-2 mt-1">
                      {home.nudges.slice(1).map((n) => <NudgeCard key={n.id} nudge={n} />)}
                    </div>
                  </details>
                )}
              </>
            )}
            {home && home.nudges.length === 0 && (
              <Empty icon="check" title="All caught up" text="Nothing needs you right now. Your agents will nudge you when something comes in." />
            )}

            {/* On the phone, watching and earlier sit under the nudges. On desktop they move to the right column. */}
            <div className="desk:hidden flex flex-col gap-2.5">
              {home && <><Section label="Watching" right={<span className="text-mute-2 text-xs">{home.watches.length}</span>} /><WatchList watches={home.watches} /></>}
              {home && home.earlier.length > 0 && <><Section label="Earlier today" /><EarlierList items={home.earlier} /></>}
            </div>
          </div>

          <div className="hidden desk:flex w-[340px] shrink-0 flex-col gap-2.5 pt-[52px]">
            {home && home.running.length > 0 && <><Section label="Running now" />{home.running.map((r, i) => <RunningCard key={i} item={r} />)}</>}
            {home && <><Section label="Watching" right={<span className="text-mute-2 text-xs">{home.watches.length}</span>} /><WatchList watches={home.watches} /></>}
            {home && home.earlier.length > 0 && <><Section label="Earlier today" /><EarlierList items={home.earlier} /></>}
          </div>
        </div>
      </main>
    </>
  );
}

function Skeleton() {
  return <>{[90, 180, 180].map((h, i) => <div key={i} className="rounded-2xl bg-paper-2 animate-pulse" style={{ height: h }} />)}</>;
}
