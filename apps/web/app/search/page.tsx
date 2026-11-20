"use client";
// One search across chats, crons and watches.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SearchResults } from "@kotatsu/shared";
import { Icon } from "@/components/Icon";
import { ChannelIcon, DeskBar, Section } from "@/components/bits";
import { WatchRow } from "@/components/Home";
import { api } from "@/lib/api";
import { ago } from "@/lib/util";

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [r, setR] = useState<SearchResults | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) { setR(null); return; }
    const t = setTimeout(() => api.search(q.trim()).then(setR).catch(() => {}), 180);
    return () => clearTimeout(t);
  }, [q]);

  const mark = (s: string) => {
    const i = s.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? s : <>{s.slice(0, i)}<b className="text-ink">{s.slice(i, i + q.length)}</b>{s.slice(i + q.length)}</>;
  };

  return (
    <>
      <header className="safe-top shrink-0 flex items-center gap-2 px-3.5 pt-2 pb-2.5 desk:pt-4 desk:px-[26px]">
        <label className="field flex-1 !bg-white border border-line-2 !text-ink desk:max-w-[640px]"><Icon name="search" size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything" className="flex-1 bg-transparent outline-none" /></label>
        <Link href="/" className="btn btn-ghost !text-ink px-1 desk:hidden">Cancel</Link>
      </header>
      <DeskBar><span className="sr-only">Search</span></DeskBar>
      <main className="flex-1 overflow-y-auto px-3.5 pb-6 desk:px-[26px]">
        <div className="max-w-[640px] flex flex-col gap-2">
          {r && r.channels.length > 0 && <><Section label="Chats" /><div className="card overflow-hidden">
            {r.channels.map(({ channel, snippet, at }) => (
              <Link key={channel.id} href={`/c?id=${channel.id}`} className="flex items-center gap-2.5 px-3.5 py-[11px] border-b border-line-3 last:border-0">
                <ChannelIcon channel={channel} size={28} /><span className="flex-1 min-w-0 flex flex-col gap-px"><span className="text-[14px] font-semibold">{channel.name}</span><span className="one text-mute text-[12.5px]">{mark(snippet)}</span></span><span className="text-mute-2 text-xs">{ago(at)}</span>
              </Link>))}
          </div></>}
          {r && r.runs.length > 0 && <><Section label="Crons" /><div className="card overflow-hidden">
            {r.runs.map(({ run, job }) => (
              <Link key={run.id} href={`/crons/run?id=${run.id}`} className="flex items-center gap-2.5 px-3.5 py-[11px] border-b border-line-3 last:border-0">
                <span className="text-mute"><Icon name="clock" size={18} /></span><span className="flex-1 min-w-0 flex flex-col gap-px"><span className="text-[14px] font-semibold">{job.name}</span><span className="one text-mute text-[12.5px]">{mark(run.title)}</span></span><span className="text-mute-2 text-xs">{ago(run.createdAt)}</span>
              </Link>))}
          </div></>}
          {r && r.watches.length > 0 && <><Section label="Watching" /><div className="card overflow-hidden">{r.watches.map((w, i) => <WatchRow key={w.id} watch={w} last={i === r.watches.length - 1} />)}</div></>}
          {r && !r.channels.length && !r.runs.length && !r.watches.length && <p className="text-center text-mute py-10">Nothing found for "{q}".</p>}
        </div>
      </main>
    </>
  );
}
