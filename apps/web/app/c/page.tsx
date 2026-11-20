"use client";
// A channel. Project channels have every agent; direct channels have one.
// Phone: header, timeline, composer, panel as a sheet. Desktop: timeline plus the panel column.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { AgentFace, ChannelIcon, Faces } from "@/components/bits";
import { MessageView } from "@/components/Messages";
import { Composer } from "@/components/Composer";
import { PanelColumn, PanelSheet } from "@/components/Panel";
import { api } from "@/lib/api";
import { loadMessages, useChannel, useStore } from "@/lib/store";
import { cx, dayLabel } from "@/lib/util";

export default function ChannelPage() {
  return <Suspense><ChannelView /></Suspense>;
}

function ChannelView() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id") ?? "";
  const channel = useChannel(id);
  const agents = useStore((s) => s.agents);
  const messages = useStore((s) => s.messages[id]);
  const [sheet, setSheet] = useState(params.get("panel") === "1");
  const [deskPanel, setDeskPanel] = useState(true);
  const [modelSheet, setModelSheet] = useState(false);
  const [q, setQ] = useState("");
  const [models, setModels] = useState<Record<string, { id: string; label: string; provider?: string; context?: number }[]>>({});
  useEffect(() => { api.models().then(setModels).catch(() => setModels({})); }, []);
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  useEffect(() => { if (id) { void loadMessages(id); void api.read(id); } }, [id]);
  useEffect(() => { if (id && channel?.unread) void api.read(id); }, [id, channel?.unread]);

  // Stay pinned to the bottom while new text streams in, unless you scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (!channel) return <div className="flex-1 flex items-center justify-center text-mute">Loading</div>;
  const members = agents.filter((a) => channel.agentIds.includes(a.id));
  const isProject = channel.kind === "project";
  const modelLabel = (id: string) => {
    const chosen = channel.models?.[id] ?? agents.find((a) => a.id === id)?.model ?? "";
    return models[id]?.find((m) => m.id === chosen)?.label ?? "Default model";
  };
  const live = channel.live;

  return (
    <>
      {/* phone header */}
      <header className="desk:hidden safe-top sticky top-0 z-20 shrink-0 flex items-center gap-1.5 px-2 pt-1 pb-2.5 border-b border-line bg-paper">
        <Link href="/chats" className="ib" aria-label="Back"><Icon name="left" size={22} /></Link>
        <button onClick={() => isProject && setSheet(true)} className="flex-1 flex items-center gap-2.5 min-w-0 text-left">
          <ChannelIcon channel={channel} size={32} />
          <span className="flex flex-col gap-px min-w-0">
            <span className="flex items-center gap-1 text-base font-semibold"><span className="one">{channel.name}</span>{isProject && <span className="text-mute-2"><Icon name="right" size={13} /></span>}</span>
            <span className="flex items-center gap-1 text-mute text-xs">{members.length > 1 && <Faces ids={members.map((m) => m.id)} size={15} />}{live ? "Working" : members.map((m) => m.name).join(" and ")}</span>
          </span>
        </button>
        <button onClick={() => setModelSheet(true)} className="btn btn-ghost h-8 px-2 text-[11.5px] text-mute" aria-label="Model">{modelLabel(members[0]?.id ?? "")}</button>
        <Link href={`/talk?c=${channel.id}`} className="ib ib-card" aria-label="Talk"><Icon name="wave" size={17} /></Link>
        {isProject && <button onClick={() => setSheet(true)} className="ib ib-card" aria-label="Project panel"><Icon name="panel" size={17} /></button>}
      </header>

      {/* desktop header */}
      <header className="hidden desk:flex h-[58px] shrink-0 items-center gap-2.5 px-[22px] border-b border-line bg-paper">
        <ChannelIcon channel={channel} size={26} />
        <span className="h text-[17px] font-semibold">{channel.name}</span>
        <span className="flex items-center gap-1 text-mute text-[12.5px]">{members.length > 1 && <Faces ids={members.map((m) => m.id)} size={18} />}{members.map((m) => m.name).join(" and ")}</span>
        <span className="flex-1" />
        {live && <button onClick={() => api.stop(channel.id)} className="btn btn-sec h-8 text-bad">Stop</button>}
        <button onClick={() => setModelSheet(true)} className="btn btn-sec h-8 text-mute">{modelLabel(members[0]?.id ?? "")}</button>
        <Link href={`/talk?c=${channel.id}`} className="btn btn-sec h-8"><Icon name="wave" size={14} />Talk</Link>
        {isProject && <button onClick={() => setDeskPanel(!deskPanel)} className={cx("btn h-8", deskPanel ? "btn-pri" : "btn-sec")}><Icon name="panel" size={14} />Panel</button>}
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 flex flex-col">
          <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
            className="flex-1 overflow-y-auto px-3.5 pt-3.5 pb-2 desk:px-[26px] desk:pt-5">
            <div className="max-w-[760px] mx-auto flex flex-col gap-4 min-h-full justify-end">
              {messages?.length === 0 && (
                <div className="text-center text-mute text-[13.5px] py-10">
                  {isProject ? `Start the ${channel.name} channel. @ picks who answers.` : `Say hi to ${channel.name}.`}
                </div>
              )}
              {messages?.map((m, i) => (
                <div key={m.id} className="flex flex-col gap-4">
                  {(i === 0 || dayLabel(messages[i - 1].createdAt) !== dayLabel(m.createdAt)) && (
                    <div className="flex items-center gap-2.5 text-mute-2 text-xs"><span className="flex-1 h-px bg-line-2" />{dayLabel(m.createdAt)}<span className="flex-1 h-px bg-line-2" /></div>
                  )}
                  <MessageView m={m} />
                </div>
              ))}
            </div>
          </div>
          <Composer channel={channel} onSent={() => { stuck.current = true; }} />
        </div>
        {isProject && deskPanel && <PanelColumn channelId={channel.id} />}
      </div>

      {isProject && sheet && <PanelSheet channelId={channel.id} onClose={() => { setSheet(false); router.replace(`/c?id=${channel.id}`); }} />}
      {modelSheet && (
        <div className="absolute inset-0 z-30 flex items-end bg-black/20" onClick={() => setModelSheet(false)}>
          <div className="w-full bg-white rounded-t-2xl flex flex-col max-h-[82%]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center px-4 pt-4 pb-2"><span className="h text-[16px] font-semibold flex-1">Model</span>
              <button onClick={() => setModelSheet(false)} className="text-mute text-[13px]">Done</button></div>
            {/* Who answers here, decided once instead of typed every message. */}
            <div className="px-4 pb-3 flex flex-col gap-1.5">
              <span className="lbl">Who answers when you do not @ anyone</span>
              <div className="flex gap-1.5 flex-wrap">
                {members.map((a) => {
                  const on = (channel.defaultAgentId ?? null) === a.id;
                  return (
                    <button key={a.id} onClick={() => void api.setDefaultAgent(channel.id, on ? null : a.id)}
                      className={cx("btn h-8 px-2.5 gap-1.5", on ? "btn-pri" : "btn-sec")}>
                      <AgentFace id={a.id} size={18} />{a.name}
                    </button>
                  );
                })}
                {members.length > 1 && (
                  <button onClick={() => void api.setDefaultAgent(channel.id, "all")}
                    className={cx("btn h-8 px-2.5 gap-1.5", channel.defaultAgentId === "all" ? "btn-pri" : "btn-sec")}>
                    <Icon name="chat" size={14} />Everyone
                  </button>
                )}
              </div>
              <span className="text-mute text-[12px]">Leave it off and the house default answers.</span>
            </div>
            <p className="text-mute text-[12.5px] px-4 pb-2">Changing a model starts a fresh thread for that agent here.</p>
            <div className="px-4 pb-2">
              <label className="field"><Icon name="search" size={16} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models" className="flex-1 bg-transparent outline-none text-ink placeholder:text-mute-2 min-w-0" />
              </label>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-8">
              {members.map((a) => {
                const all = models[a.id] ?? [];
                const shot = (q ? all.filter((m) => `${m.label} ${m.provider ?? ""} ${m.id}`.toLowerCase().includes(q.toLowerCase())) : all).slice(0, q ? 60 : 12);
                return (
                  <div key={a.id} className="pb-3">
                    <div className="lbl px-2 pb-1.5">{a.name}{!q && all.length > 12 ? ` · ${all.length} models` : ""}</div>
                    {shot.map((m) => {
                      const on = (channel.models?.[a.id] ?? a.model) === m.id;
                      return (
                        <button key={m.id} onClick={() => { void api.setModel(channel.id, a.id, m.id); setModelSheet(false); }}
                          className={cx("w-full flex items-center gap-2 px-2 py-2 rounded-xl text-left", on ? "bg-paper-2" : "")}>
                          <span className="flex-1 min-w-0">
                            <span className={cx("block text-[14px] one", on && "font-semibold")}>{m.label}</span>
                            <span className="block text-[11.5px] text-mute-2 one">{m.provider ? `${m.provider} · ` : ""}{m.id}</span>
                          </span>
                          {on && <Icon name="check" size={16} />}
                        </button>
                      );
                    })}
                    {!q && all.length > 12 && <div className="px-2 pt-1 text-[12px] text-mute-2">Search to see the other {all.length - 12}.</div>}
                    {q && !all.length && <div className="px-2 py-2 text-[12.5px] text-mute-2">Nothing matches.</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
