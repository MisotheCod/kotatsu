"use client";
// Settings: your name, agents, nudge limits, connections, this Mac, and the build version.

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Settings } from "@kotatsu/shared";
import { Icon, type IconName } from "@/components/Icon";
import { DeskBar, Face, PageTitle } from "@/components/bits";
import { api } from "@/lib/api";
import { enablePush, pushState } from "@/lib/push";
import { useStore } from "@/lib/store";
import { BUILD, VERSION, applyUpdate, useUpdate } from "@/lib/version";
import { cx } from "@/lib/util";

export default function SettingsPage() {
  const agents = useStore((s) => s.agents);
  const watches = useStore((s) => s.home?.watches.length ?? 0);
  const connected = useStore((s) => s.connected);
  const [st, setSt] = useState<Settings | null>(null);
  const [push, setPush] = useState<string>("default");
  const [owner, setOwner] = useState<string>("");
  const [later, setLater] = useState<string[]>([]);
  const { ready } = useUpdate();

  useEffect(() => {
    api.settings().then(setSt).catch(() => {});
    api.setupState().then((s) => { setOwner(s.ownerName); setLater(s.later ?? []); }).catch(() => {});
    setPush(pushState());
  }, []);

  async function save(patch: Partial<Settings>) { setSt(await api.setSettings(patch)); }

  return (
    <>
      <PageTitle title="Settings" />
      <DeskBar><span className="h text-lg font-semibold">Settings</span></DeskBar>
      <main className="flex-1 overflow-y-auto px-3.5 pb-6 desk:px-[26px] desk:py-5">
        <div className="max-w-[640px] flex flex-col gap-2">
          <Label>You</Label>
          <div className="card overflow-hidden">
            <Row icon="home" label="Your name" control={
              <input defaultValue={owner} onBlur={(e) => { if (e.target.value.trim() !== owner) void api.setOwner(e.target.value.trim()).then((r) => setOwner(r.name)); }}
                placeholder="Your name" className="field w-[150px] text-right text-[13.5px]" />
            } last />
          </div>

          <Label>Agents</Label>
          <div className="card overflow-hidden">
            {agents.map((a) => (
              <Link key={a.id} href={`/settings/agent?id=${a.id}`} className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-line-3">
                <Face agent={a} size={36} />
                <span className="flex-1 flex flex-col gap-px"><span className="text-[15px] font-semibold">{a.name}{a.isDefault && <span className="text-mute-2 font-normal text-[12.5px]"> · answers first</span>}</span><span className="text-mute text-[12.5px]">{a.runtimeLabel}</span></span>
                <span className={a.online ? "live" : "w-2 h-2 rounded-full bg-mute-2"} /><span className="text-mute-2"><Icon name="right" size={14} /></span>
              </Link>
            ))}
            <Link href="/settings/agents/new" className="flex items-center gap-2.5 px-3.5 py-3 text-ink">
              <span className="w-[22px] flex justify-center"><Icon name="plus" size={18} /></span>
              <span className="text-[15px] flex-1">Add an agent</span>
              <span className="text-mute-2"><Icon name="right" size={14} /></span>
            </Link>
          </div>

          <Label>Nudges</Label>
          <div className="card overflow-hidden">
            <Row icon="bell" label="Notifications" value={push === "granted" ? "On" : push === "unsupported" ? "Add to Home Screen first" : "Off"}
              onClick={push !== "granted" ? async () => { try { await enablePush(); } catch (e: any) { alert(e.message); } setPush(pushState()); } : undefined} />
            <Row icon="bell" label="Most per day" value={st ? String(st.maxNudgesPerDay) : ""}
              control={st && <Stepper value={st.maxNudgesPerDay} onChange={(v) => save({ maxNudgesPerDay: v })} />} />
            <Row icon="moon" label="Quiet hours" value={st ? `${fmt(st.quietStart)} to ${fmt(st.quietEnd)}` : ""}
              control={st && <span className="flex items-center gap-1"><TimeInput v={st.quietStart} on={(v) => save({ quietStart: v })} /><span className="text-mute">to</span><TimeInput v={st.quietEnd} on={(v) => save({ quietEnd: v })} /></span>} />
            <Row icon="clock" label="Morning brief" control={st && (
              <span className="flex items-center gap-2">
                <TimeInput v={st.briefAt} on={(v) => save({ briefAt: v })} />
                <button onClick={() => save({ briefEnabled: st.briefEnabled === false })} className="tag">{st.briefEnabled === false ? "Off" : "On"}</button>
              </span>
            )} />
            <Row icon="eye" label="Watching" value={String(watches)} href="/settings/watching" last />
          </div>

          <Label>Connected</Label>
          <div className="card overflow-hidden">
            <Row icon="plug" label="Connections" value={later.length ? later.join(", ") : "None yet"} />
            <Row icon="book" label="Memory, rules and skills" value="In Hermes" last />
          </div>

          <div className="card overflow-hidden mt-2">
            <Row icon="server" label="This Mac" last control={<span className="flex items-center gap-1.5 text-[13.5px] text-mute"><span className={connected ? "live" : "w-2 h-2 rounded-full bg-mute-2"} />{connected ? "Online" : "Offline"}</span>} />
          </div>

          <p className="text-center text-mute-2 text-xs py-2">
            Version {VERSION}, build {BUILD}. {ready ? <button onClick={applyUpdate} className="underline text-ink">Update ready, reload</button> : "Up to date."}
          </p>
        </div>
      </main>
    </>
  );
}

const fmt = (hm: string) => { const [h, m] = hm.split(":").map(Number); return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`; };

function Label({ children }: { children: React.ReactNode }) { return <span className="lbl px-1 pt-2">{children}</span>; }

function Row({ icon, label, value, href, last, control, onClick }: { icon: IconName; label: string; value?: string; href?: string; last?: boolean; control?: React.ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <span className="w-[22px] flex justify-center text-mute"><Icon name={icon} size={18} /></span>
      <span className="flex-1 text-[15px]">{label}</span>
      {control ?? <span className="text-mute text-[13.5px]">{value}</span>}
      {(href || onClick) && <span className="text-mute-2"><Icon name="right" size={14} /></span>}
    </>
  );
  const cls = cx("flex items-center gap-2.5 px-3.5 py-3 w-full text-left", !last && "border-b border-line-3");
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="flex items-center gap-1">
      <button className="ib !w-7 !h-7 ib-card" onClick={() => onChange(Math.max(1, value - 1))}>−</button>
      <span className="w-6 text-center text-[14px] font-semibold">{value}</span>
      <button className="ib !w-7 !h-7 ib-card" onClick={() => onChange(Math.min(20, value + 1))}>+</button>
    </span>
  );
}

function TimeInput({ v, on }: { v: string; on: (v: string) => void }) {
  return <input type="time" value={v} onChange={(e) => on(e.target.value)} className="bg-paper-2 rounded-lg px-2 h-8 text-[13.5px] outline-none" />;
}
