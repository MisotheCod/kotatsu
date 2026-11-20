"use client";
// Every run from every job, in one list. One feed you can
// search, newest first, each row still tagged with the job it came from.
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { DeskBar, PageTitle } from "@/components/bits";
import { CronRow } from "@/components/Crons";
import { Icon } from "@/components/Icon";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";

export default function AllRunsPage() {
  return <Suspense><AllRuns /></Suspense>;
}

function AllRuns() {
  const runs = useStore((s) => s.runs);
  const jobs = useStore((s) => s.jobs);
  const [q, setQ] = useState("");
  const [unread, setUnread] = useState(false);

  const rows = useMemo(() => runs
    .filter((r) => (unread ? !r.read && !r.quiet : true))
    .filter((r) => {
      if (!q) return true;
      const job = jobs.find((j) => j.slug === r.job);
      return `${job?.name ?? r.job} ${r.title} ${r.body}`.toLowerCase().includes(q.toLowerCase());
    }), [runs, jobs, q, unread]);

  const head = (
    <>
      <span className="flex-1 min-w-0">
        <span className="block h text-[19px] font-semibold one">All jobs</span>
        <span className="block text-[12.5px] text-mute one">{runs.length} runs from {jobs.length} jobs</span>
      </span>
      <button onClick={() => api.readAll()} className="btn btn-ghost h-8 px-2">Mark all read</button>
    </>
  );

  const search = (
    <div className="flex items-center gap-2 px-4 pb-2 shrink-0">
      <label className="field flex-1"><Icon name="search" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything" className="flex-1 bg-transparent outline-none text-ink placeholder:text-mute-2 min-w-0" />
      </label>
      <button onClick={() => setUnread(!unread)} className={`h-8 px-3 rounded-full text-[13px] font-semibold ${unread ? "bg-ink text-white" : "bg-white border border-line-2 text-ink-2"}`}>Unread</button>
    </div>
  );

  const list = (
    <div className="flex-1 overflow-y-auto pb-4">
      {rows.map((r) => (
        <CronRow key={r.id} run={r} job={jobs.find((j) => j.slug === r.job)} href={`/crons/run?id=${r.id}`} />
      ))}
      {!rows.length && <div className="text-center text-mute text-[13.5px] py-10">Nothing matches.</div>}
    </div>
  );

  return (
    <>
      <div className="desk:hidden flex-1 min-h-0 flex flex-col">
        <header className="safe-top shrink-0 flex items-center gap-1 px-2 pt-1 pb-2 border-b border-line bg-paper">
          <Link href="/crons" className="ib" aria-label="Back"><Icon name="left" size={22} /></Link>
          <div className="flex-1 flex items-center gap-2 min-w-0 pr-2">{head}</div>
        </header>
        {search}
        {list}
      </div>
      <div className="hidden desk:flex flex-1 min-h-0 flex-col">
        <DeskBar>{head}</DeskBar>
        {search}
        {list}
      </div>
    </>
  );
}
