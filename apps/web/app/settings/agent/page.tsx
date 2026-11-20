"use client";
// An agent's face, name, voice and what it is good at.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { FACES, type Agent } from "@kotatsu/shared";
import { Icon } from "@/components/Icon";
import { DeskBar, Face } from "@/components/bits";
import { api } from "@/lib/api";
import { useAgent } from "@/lib/store";
import { cx } from "@/lib/util";

export default function AgentPage() {
  return <Suspense><AgentEdit /></Suspense>;
}

function AgentEdit() {
  const id = useSearchParams().get("id") ?? "";
  const agent = useAgent(id);
  const router = useRouter();
  const [draft, setDraft] = useState<Agent | null>(null);
  const [newSkill, setNewSkill] = useState("");
  useEffect(() => { if (agent && !draft) setDraft(agent); }, [agent, draft]);
  if (!draft) return null;

  const set = (p: Partial<Agent>) => setDraft({ ...draft, ...p });
  async function save() {
    await api.updateAgent(draft!.id, { name: draft!.name, face: draft!.face, voice: draft!.voice, goodAt: draft!.goodAt, isDefault: draft!.isDefault });
    router.push("/settings");
  }
  function speak() {
    const u = new SpeechSynthesisUtterance(`Hi, this is ${draft!.name}.`);
    speechSynthesis.speak(u);
  }

  return (
    <>
      <header className="desk:hidden safe-top shrink-0 flex items-center px-2 pt-1 pb-1.5">
        <Link href="/settings" className="ib" aria-label="Back"><Icon name="left" size={22} /></Link>
        <span className="flex-1 text-center text-base font-semibold">{draft.name}</span>
        <button onClick={save} className="btn btn-ghost !text-ink">Save</button>
      </header>
      <DeskBar><Link href="/settings" className="text-mute">Settings</Link><span className="text-mute-2">/</span><span className="h text-lg font-semibold">{draft.name}</span></DeskBar>
      <main className="flex-1 overflow-y-auto px-[18px] pb-8 desk:px-9 desk:py-7">
        <div className="max-w-[640px] flex flex-col gap-4">
          <div className="flex flex-col desk:flex-row items-center desk:items-center gap-1.5 desk:gap-[18px]">
            <Face face={draft.face} size={104} />
            <div className="hidden desk:flex flex-col gap-1"><span className="h text-2xl font-semibold">{draft.name}</span><span className="text-mute text-[14px]">{draft.isDefault ? "Answers when you do not @ anyone." : `Answers when you @${draft.name}.`}</span></div>
            <span className="desk:hidden text-mute text-[13px]">Pick a face</span>
          </div>

          <div className="grid grid-cols-5 desk:grid-cols-10 gap-2.5 desk:gap-2">
            {FACES.map((f) => (
              <button key={f} onClick={() => set({ face: f })} aria-label={f}
                className={cx("aspect-square rounded-2xl flex items-center justify-center transition", draft.face === f ? "bg-white shadow-[0_0_0_2px_#141413]" : "bg-paper-2 hover:bg-paper-3")}>
                <Face face={f} size={48} />
              </button>
            ))}
          </div>

          <div className="flex flex-col desk:flex-row gap-3">
            <Field label="Name"><input value={draft.name} onChange={(e) => set({ name: e.target.value })} className="flex-1 bg-transparent outline-none" /></Field>
            <Field label="Voice"><input value={draft.voice} onChange={(e) => set({ voice: e.target.value })} className="flex-1 bg-transparent outline-none" />
              <button onClick={speak} className="flex items-center gap-1.5 text-mute text-[13px]"><Icon name="wave" size={14} />Play</button></Field>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="lbl">Good at</span>
            <div className="flex flex-wrap gap-1.5">
              {draft.goodAt.map((g) => (
                <button key={g} onClick={() => set({ goodAt: draft.goodAt.filter((x) => x !== g) })} className="tag !text-[13px] !px-2.5 !py-[5px] bg-white border border-line-2">{g}<Icon name="x" size={11} /></button>
              ))}
              <form onSubmit={(e) => { e.preventDefault(); if (newSkill.trim()) { set({ goodAt: [...draft.goodAt, newSkill.trim()] }); setNewSkill(""); } }}>
                <input value={newSkill} onChange={(e) => setNewSkill(e.target.value)} placeholder="+ Add" className="tag !text-[13px] !px-2.5 !py-[5px] w-24 outline-none" />
              </form>
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-[14.5px]">
            <input type="checkbox" checked={draft.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} className="w-4 h-4 accent-[#141413]" />
            Answers first when nobody is @mentioned
          </label>

          <Field label="Runs on"><span className="flex-1">{draft.runtimeLabel}</span><span className={cx("flex items-center gap-1.5 text-[13px]", draft.online ? "text-good" : "text-mute")}><span className={draft.online ? "live" : "w-2 h-2 rounded-full bg-mute-2"} />{draft.online ? "Online" : "Offline"}</span></Field>

          <div className="hidden desk:flex gap-2 pt-1"><button onClick={save} className="btn btn-pri">Save</button><Link href="/settings" className="btn btn-sec">Cancel</Link></div>
        </div>
      </main>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col gap-1.5">
      <span className="lbl">{label}</span>
      <div className="h-11 rounded-xl bg-white border border-line-2 px-3 flex items-center gap-2 text-[15px]">{children}</div>
    </div>
  );
}
