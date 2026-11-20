"use client";
// The runs reader inside the app.

import Link from "next/link";
import type React from "react";
import { useEffect, useState } from "react";
import type { CronJob, CronRun } from "@kotatsu/shared";
import { Icon } from "./Icon";
import { AgentFace, ChannelIcon } from "./bits";
import { Markdown } from "./Messages";
import { api } from "@/lib/api";
import { getState, useChannel, useStore } from "@/lib/store";
import { ago, cx, dayLabel } from "@/lib/util";
import { api as _api } from "@/lib/api";

/** A face for each job, so the list reads at a glance instead of row after row of clocks. */
type IconName = React.ComponentProps<typeof Icon>["name"];

export function iconForJob(slug: string, name = ""): IconName {
  const s = `${slug} ${name}`.toLowerCase();
  if (/news|digest|brief/.test(s)) return "book";
  if (/github|repo|code|dev/.test(s)) return "code";
  if (/product hunt|ph |launch/.test(s)) return "spark";
  if (/backup|nas|vault|server/.test(s)) return "server";
  if (/reddit/.test(s)) return "chat";
  if (/outreach|email|creator|mail/.test(s)) return "mail";
  if (/audit|scan|review/.test(s)) return "eye";
  if (/market|buyer|pain|intel|trend/.test(s)) return "trend";
  if (/ted|pick|read|idea/.test(s)) return "bulb";
  if (/retro|weekly|review/.test(s)) return "refresh";
  if (/revenue|stripe|money/.test(s)) return "dollar";
  return "clock";
}

export function CronRow({ run, job, selected, href }: { run: CronRun; job?: CronJob; selected?: boolean; href: string }) {
  const channel = useChannel(job?.channelId);
  return (
    <Link href={href} className={cx("flex items-center gap-3 px-4 py-[11px]", selected && "bg-white shadow-[inset_3px_0_0_#141413]")}>
      {channel ? <ChannelIcon channel={channel} size={30} /> : (
        <span className="w-[30px] h-[30px] rounded-[9px] bg-paper-2 text-mute flex items-center justify-center shrink-0"><Icon name="clock" size={15} /></span>
      )}
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5"><span className="flex-1 one text-mute text-[12.5px] font-semibold">{job?.name ?? run.job}</span>
          {!run.ok && <span className="text-bad"><Icon name="alert" size={15} /></span>}<span className="text-mute-2 text-xs">{ago(run.createdAt)}</span></span>
        <span className="flex items-center gap-[7px]">
          <span className={cx("flex-1 one text-[14.5px]", !run.read && "font-semibold", !run.ok && "text-bad")}>{run.title}</span>
          {!run.read && !run.quiet && <span className="udot" />}
        </span>
      </span>
    </Link>
  );
}

type Filter = "all" | "unread" | "failed" | "favorite";

export function CronList({ selectedId, desk }: { selectedId?: string; desk?: boolean }) {
  const runs = useStore((s) => s.runs);
  const jobs = useStore((s) => s.jobs);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [openQuiet, setOpenQuiet] = useState<string | null>(null);

  const job = (slug: string) => jobs.find((j) => j.slug === slug);
  const scheduled = jobs.filter((j) => j.scheduled);
  const list = runs.filter((r) =>
    (filter === "all" || (filter === "unread" && !r.read && !r.quiet) || (filter === "failed" && !r.ok) || (filter === "favorite" && r.favorite)) &&
    (!q || `${r.title} ${job(r.job)?.name ?? ""} ${r.body}`.toLowerCase().includes(q.toLowerCase())));

  const groups = new Map<string, CronRun[]>();
  for (const r of list) { const k = dayLabel(r.createdAt); groups.set(k, [...(groups.get(k) ?? []), r]); }
  const hrefFor = (r: CronRun) => (desk ? `/crons?run=${r.id}` : `/crons/run?id=${r.id}`);

  const chip = (f: Filter, label: React.ReactNode) => (
    <button onClick={() => setFilter(filter === f ? "all" : f)}
      className={cx("h-8 px-3 rounded-full text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap", filter === f ? "bg-ink text-white" : "bg-white border border-line-2 text-ink-2")}>
      {label}
    </button>
  );

  return (
    <>
      <div className="flex items-center gap-2 px-4 pb-2 desk:pt-3 shrink-0">
        <label className="field flex-1"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search past runs" className="flex-1 bg-transparent outline-none text-ink placeholder:text-mute-2 min-w-0" /></label>
        {chip("unread", <><Icon name="filter" size={14} />Unread</>)}
        {desk && chip("failed", "Failed")}
        {chip("favorite", <Icon name="star" size={14} />)}
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        {[...groups].map(([day, rs]) => {
          const loud = rs.filter((r) => !r.quiet), quiet = rs.filter((r) => r.quiet);
          return (
            <section key={day}>
              <div className="lbl px-4 pt-3.5 pb-1">{day}</div>
              {loud.map((r) => <CronRow key={r.id} run={r} job={job(r.job)} selected={r.id === selectedId} href={hrefFor(r)} />)}
              {quiet.length > 0 && (openQuiet === day
                ? quiet.map((r) => <CronRow key={r.id} run={r} job={job(r.job)} selected={r.id === selectedId} href={hrefFor(r)} />)
                : <button onClick={() => setOpenQuiet(day)} className="flex items-center gap-1.5 text-mute text-[12.5px] pl-[58px] py-1.5"><Icon name="down" size={13} />{quiet.length} quiet run{quiet.length > 1 ? "s" : ""}</button>)}
            </section>
          );
        })}
        {!list.length && <div className="text-center text-mute text-[13.5px] py-10">{filter === "unread" ? "You are all caught up." : "No runs yet."}</div>}
        {filter === "all" && !q && scheduled.length > 0 && (
          <section>
            <div className="lbl px-4 pt-5 pb-1">Scheduled</div>
            {scheduled.map((j) => (
              <div key={j.slug} className="flex items-center gap-2.5 px-4 py-2.5">
                <span className="w-2 h-2 rounded-full bg-mute-2 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] one">{j.name}</span>
                  <span className="block text-[12px] text-mute one">{j.schedule || "Scheduled in Hermes"}</span>
                </span>
                <span className="text-[12px] text-mute-2 shrink-0">No runs yet</span>
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}

export function RunReader({ id, phone }: { id: string; phone?: boolean }) {
  const [data, setData] = useState<{ run: CronRun; job: CronJob } | null>(null);
  const defaultAgent = useStore((s) => s.agents.find((a) => a.isDefault));

  useEffect(() => {
    api.run(id).then((d) => { setData(d); if (!d.run.read) void api.setRun(id, { read: true }); }).catch(() => setData(null));
  }, [id]);

  if (!data) return <div className="flex-1" />;
  const { run, job } = data;

  async function ask() {
    const ch = job.channelId ?? (await api.direct(defaultAgent?.id ?? "agent")).id;
    await api.send(ch, `About the ${job.name} run from ${new Date(run.createdAt).toLocaleDateString()}: "${run.title}".\n\n${run.body.slice(0, 1500)}`);
    location.href = `/c?id=${ch}`;
  }
  async function fav() {
    const r = await api.setRun(run.id, { favorite: !run.favorite });
    setData({ run: r, job });
  }

  return (
    <div className={cx("flex-1 overflow-y-auto", phone ? "px-5 pb-28" : "px-12 py-8")}>
      <div className={cx("flex flex-col gap-3.5", !phone && "max-w-[780px]")}>
        <div className="flex items-center gap-2 text-mute text-[13px]"><Icon name="clock" size={14} /><span className="flex-1">{job.name}, {new Date(run.createdAt).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span>
          <button onClick={fav} className={cx("ib !w-8 !h-8", run.favorite && "text-clay")} aria-label="Favorite"><Icon name="star" size={18} /></button></div>
        <h1 className={cx("h font-semibold", phone ? "text-2xl leading-[30px]" : "text-[30px] leading-[38px]", !run.ok && "text-bad")}>{run.title}</h1>
        {run.imageUrl && <img src={run.imageUrl} alt="" className="w-full rounded-2xl object-cover max-h-[300px]" />}
        <Markdown text={run.body} large={!phone} />
        {!phone && <button onClick={ask} className="btn btn-sec self-start h-10 gap-2 mt-2">{defaultAgent && <AgentFace id={defaultAgent.id} size={20} />}Ask {defaultAgent?.name ?? "Agent"} about this</button>}
      </div>
      {phone && (
        <div className="fixed left-0 right-0 bottom-0 px-3.5 pt-2 safe-bottom bg-paper">
          <button onClick={ask} className="btn btn-sec w-full h-[46px] rounded-[14px] gap-2">{defaultAgent && <AgentFace id={defaultAgent.id} size={22} />}Ask {defaultAgent?.name ?? "Agent"} about this</button>
        </div>
      )}
    </div>
  );
}

/** Reads one cron session: what the agent was asked, what it did, in order. Read only. */
export function SessionReader({ id, phone }: { id: string; phone?: boolean }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.session>> | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api.session(id).then(setData).catch(() => setMissing(true));
  }, [id]);

  if (missing) return <div className="flex-1 flex items-center justify-center text-mute text-[13.5px]">That session is gone.</div>;
  if (!data) return <div className="flex-1" />;

  return (
    <div className={cx("flex-1 overflow-y-auto", phone ? "px-4 pb-24" : "px-12 py-8")}>
      <div className={cx("flex flex-col gap-3", !phone && "max-w-[780px]")}>
        <div className="flex items-center gap-2 text-mute text-[13px]">
          <Icon name="spark" size={14} />
          <span className="flex-1 one">{data.title}</span>
          <span className="shrink-0">{new Date(data.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
        </div>
        <div className="text-[12.5px] text-mute-2">{data.count} messages in this session</div>
        <div className="flex flex-col gap-2.5">
          {data.messages.map((m, i) => (
            <div key={i} className={cx("rounded-[14px] px-3.5 py-2.5",
              m.role === "user" ? "bg-paper-2 self-end max-w-[85%]" : m.role === "agent" ? "bg-white border border-line" : "bg-transparent text-mute text-[12.5px]")}>
              {m.role === "agent"
                ? <Markdown text={m.text.slice(0, 4000)} />
                : <span className="text-[13.5px] leading-[19px] whitespace-pre-wrap break-words">{m.text.slice(0, 2000)}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { getState };

/**
 * One job's runs. Used by the phone page on its own, and inside the right hand pane when there is room
 * to show the list and the reader at the same time.
 */
export function JobRuns({ slug, runHref }: { slug: string; runHref: (id: string) => string }) {
  const jobs = useStore((s) => s.jobs);
  const job = jobs.find((j) => j.slug === slug);
  const [runs, setRuns] = useState<CronRun[]>([]);
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

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-line">
        <div className="h text-[17px] font-semibold one">{job?.name ?? slug}</div>
        <div className="text-[12.5px] text-mute one">
          {job?.schedule || "Scheduled in Hermes"} · {runs.length} {runs.length === 1 ? "run" : "runs"}
          {unread ? ` · ${unread} unread` : ""}{failed ? ` · ${failed} failed` : ""}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-4">
        {loading && <div className="text-center text-mute text-[13.5px] py-10">Loading</div>}
        {!loading && !runs.length && <div className="text-center text-mute text-[13.5px] py-8">No runs posted here yet.</div>}
        {runs.map((r) => <CronRow key={r.id} run={r} job={job} href={runHref(r.id)} />)}
        {!!history.length && (
          <>
            <div className="px-4 pt-5 pb-1 flex items-baseline gap-2">
              <span className="lbl">Agent sessions</span>
              <span className="text-[11.5px] text-mute-2">{history.length} of these</span>
            </div>
            {history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-4 py-[9px]">
                <span className="w-[30px] h-[30px] rounded-[9px] bg-paper-2 text-mute flex items-center justify-center shrink-0"><Icon name="clock" size={15} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13.5px] one">{h.title}</span>
                  <span className="block text-[12px] text-mute one">{new Date(h.at).toLocaleString()} · {h.messages} messages</span>
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
