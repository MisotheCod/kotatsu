"use client";
// The Crons tab is a list of jobs: every job, its schedule, how many
// runs are unread, and the last thing it did. Tap a job to see its runs.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { DeskBar, PageTitle } from "@/components/bits";
import { Icon } from "@/components/Icon";
import { iconForJob } from "@/components/Crons";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cx, dayLabel } from "@/lib/util";

export default function CronsPage() {
  return <Suspense><Jobs /></Suspense>;
}

function ago(iso?: string) {
  if (!iso) return "never run";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return dayLabel(iso);
}

function Jobs() {

  const jobs = useStore((s) => s.jobs);
  const runs = useStore((s) => s.runs);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "unread" | "failed">("all");

  const rows = useMemo(() => jobs
    .map((job) => {
      const mine = runs.filter((r) => r.job === job.slug);
      return {
        job, mine,
        unread: mine.filter((r) => !r.read && !r.quiet).length,
        failed: mine.filter((r) => !r.ok).length,
        last: mine[0],
      };
    })
    .filter((row) => (only === "unread" ? row.unread > 0 : only === "failed" ? row.failed > 0 : true))
    .filter((row) => !q || `${row.job.short ?? ""} ${row.job.name} ${row.job.what ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const at = a.last ? Date.parse(a.last.createdAt) : 0;
      const bt = b.last ? Date.parse(b.last.createdAt) : 0;
      if (bt !== at) return bt - at;
      if (a.unread !== b.unread) return b.unread - a.unread;
      return (a.job.short ?? a.job.name).localeCompare(b.job.short ?? b.job.name);
    }), [jobs, runs, q, only]);

  const chip = (id: typeof only, label: string) => (
    <button onClick={() => setOnly(only === id ? "all" : id)}
      className={cx("h-8 px-3 rounded-full text-[13px] font-semibold whitespace-nowrap", only === id ? "bg-ink text-white" : "bg-white border border-line-2 text-ink-2")}>
      {label}
    </button>
  );

  const search = (
    <div className="flex items-center gap-2 px-4 pb-2 shrink-0">
      <label className="field flex-1"><Icon name="search" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs" className="flex-1 bg-transparent outline-none text-ink placeholder:text-mute-2 min-w-0" />
      </label>
      {chip("unread", "Unread")}
      {chip("failed", "Failed")}
    </div>
  );

  const totalRuns = runs.length;
  const totalUnread = runs.filter((r) => !r.read && !r.quiet).length;

  const list = (
    <div className="flex-1 overflow-y-auto pb-4">
      <Link href="/crons/all" className="flex items-center gap-3 px-4 py-[11px] border-b border-line">
        <span className="w-[30px] h-[30px] rounded-[9px] bg-ink text-white flex items-center justify-center shrink-0"><Icon name="clock" size={15} /></span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-[14.5px] font-semibold one">All jobs</span>
            {totalUnread > 0 && <span className="cnt">{totalUnread}</span>}
          </span>
          <span className="block text-[12.5px] text-mute one">{totalRuns} runs from {jobs.length} jobs</span>
        </span>
        <Icon name="right" size={15} />
      </Link>
      {rows.map(({ job, unread, failed, last }) => (
        <Link key={job.slug} href={`/crons/job?slug=${job.slug}`} title={job.what}
          className="flex items-center gap-3 px-4 py-[11px]">
          <span className={cx("w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0",
            failed ? "bg-[#fdeceb] text-bad" : "bg-paper-2 text-mute")}>
            <Icon name={iconForJob(job.slug, job.name)} size={15} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="text-[14.5px] font-medium one">{job.short ?? job.name}</span>
              {unread > 0 && <span className="cnt">{unread}</span>}
              {!last && <span className="text-[11.5px] text-mute-2">no runs yet</span>}
            </span>
            {/* What it does beats when it runs: the schedule is one tap away. */}
            <span className="block text-[12.5px] text-mute one">{job.what ?? job.schedule ?? "scheduled in Hermes"}</span>
          </span>
          <span className="text-[12.5px] text-mute-2 shrink-0">{runs.filter((r) => r.job === job.slug).length}</span>
          <Icon name="right" size={15} />
        </Link>
      ))}
      {!rows.length && <div className="text-center text-mute text-[13.5px] py-10">Nothing matches.</div>}
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="desk:hidden">
        <PageTitle title="Crons" right={<button onClick={() => api.readAll()} className="btn btn-ghost h-8 px-2">Mark all read</button>} />
      </div>
      <div className="hidden desk:block"><DeskBar><span className="h text-lg font-semibold flex-1">Crons</span><button onClick={() => api.readAll()} className="btn btn-ghost h-8">Mark all read</button></DeskBar></div>
      {search}
      {list}
    </div>
  );
}
