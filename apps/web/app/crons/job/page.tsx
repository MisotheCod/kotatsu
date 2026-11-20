"use client";
// One job: what it does, then everything it did, newest first, in one list. A day heading, then rows
// that are either a posted run or the agent session behind it. Clicking a row reads it on the right.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { DeskBar } from "@/components/bits";
import { CronRow, RunReader, SessionReader, iconForJob } from "@/components/Crons";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { useWide } from "@/lib/useWide";
import { cx, dayLabel } from "@/lib/util";

export default function JobPage() {
  return <Suspense><Job /></Suspense>;
}

type Row =
  | { kind: "run"; at: string; id: string; run: Awaited<ReturnType<typeof api.runs>>[number] }
  | { kind: "session"; at: string; id: string; s: Awaited<ReturnType<typeof api.jobHistory>>[number] };

function Job() {
  const params = useSearchParams();
  const slug = params.get("slug") ?? "";
  const openRun = params.get("run");
  const openSession = params.get("session");
  const wide = useWide();
  const jobs = useStore((s) => s.jobs);
  const job = jobs.find((j) => j.slug === slug);
  const [runs, setRuns] = useState<Awaited<ReturnType<typeof api.runs>>>([]);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof api.jobHistory>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    api.runs({ job: slug }).then(setRuns).catch(() => setRuns([])).finally(() => setLoading(false));
    api.jobHistory(slug).then(setHistory).catch(() => setHistory([]));
  }, [slug]);

  const unread = runs.filter((r) => !r.read && !r.quiet).length;
  const failed = runs.filter((r) => !r.ok).length;

  // One timeline. A run and the session that produced it sit together instead of in two lists.
  const rows: Row[] = [
    ...runs.map((run) => ({ kind: "run" as const, at: run.createdAt, id: run.id, run })),
    ...history.map((s) => ({ kind: "session" as const, at: s.at, id: s.id, s })),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  const groups: { day: string; rows: Row[] }[] = [];
  for (const r of rows) {
    const day = dayLabel(r.at);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.rows.push(r);
    else groups.push({ day, rows: [r] });
  }

  const head = (
    <>
      <span className="flex-1 min-w-0">
        <span className="block h text-[19px] font-semibold one">{job?.short ?? job?.name ?? slug}</span>
        <span className="block text-[12.5px] text-mute one">
          {job?.schedule || "Scheduled in Hermes"} · {runs.length} {runs.length === 1 ? "run" : "runs"}
          {history.length ? ` · ${history.length} sessions` : ""}
          {unread ? ` · ${unread} unread` : ""}{failed ? ` · ${failed} failed` : ""}
        </span>
      </span>
      <button onClick={() => api.readAll()} className="btn btn-ghost h-8 px-2">Mark all read</button>
    </>
  );

  const list = (
    <div className="flex-1 overflow-y-auto pb-6">
      {job?.what && <p className="px-4 pt-3 pb-1 text-[13px] leading-[18px] text-ink-2">{job.what}</p>}
      {loading && <div className="text-center text-mute text-[13.5px] py-10">Loading</div>}
      {!loading && !rows.length && <div className="text-center text-mute text-[13.5px] py-8">Nothing has run yet.</div>}

      {groups.map((g) => (
        <div key={g.day}>
          <div className="px-4 pt-4 pb-1"><span className="lbl">{g.day}</span></div>
          {g.rows.map((r) =>
            r.kind === "run" ? (
              <CronRow key={r.id} run={r.run} job={job} selected={openRun === r.id}
                href={wide ? `/crons/job?slug=${slug}&run=${r.id}` : `/crons/run?id=${r.id}`} />
            ) : (
              <SessionRow key={r.id} s={r.s} slug={slug} selected={openSession === r.id}
                href={wide ? `/crons/job?slug=${slug}&session=${r.id}` : `/crons/session?id=${r.id}`} />
            ),
          )}
        </div>
      ))}
    </div>
  );

  if (wide) {
    return (
      <div className="flex-1 min-h-0 flex">
        <div className="w-[350px] shrink-0 flex flex-col border-r border-line">
          <div className="shrink-0 flex items-center gap-2 px-2 pt-3 pb-2 border-b border-line">
            <Link href="/crons" className="ib" aria-label="Back"><Icon name="left" size={20} /></Link>
            <span className="w-[30px] h-[30px] rounded-[9px] bg-paper-2 text-mute flex items-center justify-center shrink-0">
              <Icon name={iconForJob(slug, job?.name)} size={15} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block h text-[15px] font-semibold one">{job?.short ?? job?.name ?? slug}</span>
              <span className="block text-[12px] text-mute one">{runs.length} runs · {history.length} sessions</span>
            </span>
          </div>
          {list}
        </div>
        <div className="flex-1 min-w-0 flex flex-col bg-white">
          {openRun ? <RunReader key={openRun} id={openRun} />
            : openSession ? <SessionReader key={openSession} id={openSession} />
            : <div className="flex-1 flex items-center justify-center text-mute text-[13.5px] px-6 text-center">Pick a run or a session to read it.</div>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="desk:hidden flex-1 min-h-0 flex flex-col">
        <header className="safe-top shrink-0 flex items-center gap-1 px-2 pt-1 pb-2 border-b border-line bg-paper">
          <Link href="/crons" className="ib" aria-label="Back"><Icon name="left" size={22} /></Link>
          <div className="flex-1 flex items-center gap-2 min-w-0 pr-2">{head}</div>
        </header>
        {list}
      </div>
      <div className="hidden desk:flex flex-1 min-h-0 flex-col">
        <DeskBar>{head}</DeskBar>
        {list}
      </div>
    </>
  );
}

/** A session row says what the agent was asked and how it ended, not just when it ran. */
function SessionRow({ s, slug, selected, href }: { s: Awaited<ReturnType<typeof api.jobHistory>>[number]; slug: string; selected: boolean; href: string }) {
  return (
    <Link href={href} className={cx("flex gap-3 px-4 py-[9px] items-start", selected && "bg-[#f3f1ec]")}>
      <span className={cx("w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0 mt-0.5",
        s.failed ? "bg-[#fdeceb] text-bad" : "bg-paper-2 text-mute")}>
        <Icon name="spark" size={15} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-[13.5px] font-medium one flex-1">{s.last || s.preview || s.title}</span>
          <span className="text-[11px] text-mute-2 shrink-0">{new Date(s.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
        </span>
        {s.preview && s.preview !== s.last && <span className="block text-[12px] text-mute one mt-[1px]">{s.preview}</span>}
        <span className="block text-[11px] text-mute-2 mt-[1px]">
          session · {s.messages} messages{s.tookMin ? ` · ${s.tookMin} min` : ""}
        </span>
      </span>
    </Link>
  );
}
