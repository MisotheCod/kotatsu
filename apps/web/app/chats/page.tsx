"use client";
// Chats, like Slack: Projects (channels with every agent), Direct (one agent), One off.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { Channel } from "@kotatsu/shared";
import { Icon } from "@/components/Icon";
import { AgentFace, ChannelIcon, DeskBar, Face, PageTitle } from "@/components/bits";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ago, cx } from "@/lib/util";
import { useVisualViewport } from "@/lib/viewport";

export default function ChatsPage() {
  return <Suspense><Chats /></Suspense>;
}

function Chats() {
  const channels = useStore((s) => s.channels);
  const agents = useStore((s) => s.agents);
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(params.get("new"));
  const filter = (c: Channel) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.lastMessage?.text.toLowerCase().includes(q.toLowerCase());

  const projects = channels.filter((c) => c.kind === "project" && filter(c));
  // Every agent has a direct chat, even before the first message.
  const direct = agents.map((a) => channels.find((c) => c.id === `dm-${a.id}`) ?? ({ id: `dm-${a.id}`, kind: "direct", name: a.name, agentIds: [a.id], unread: 0, live: false, updatedAt: "" } as Channel)).filter(filter);
  const oneoff = channels.filter((c) => c.kind === "oneoff" && filter(c));

  return (
    <>
      <PageTitle title="Chats" right={<button onClick={() => setCreating("1")} className="ib bg-ink text-white" aria-label="New chat"><Icon name="pen" size={17} /></button>} />
      <DeskBar><span className="h text-lg font-semibold flex-1">Chats</span><button onClick={() => setCreating("1")} className="btn btn-pri h-8"><Icon name="pen" size={14} />New</button></DeskBar>
      <div className="px-4 pb-2.5 desk:pt-3.5 shrink-0">
        <label className="field"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats and projects" className="flex-1 bg-transparent outline-none text-ink placeholder:text-mute-2" /></label>
      </div>
      <main className="flex-1 overflow-y-auto pb-4 desk:max-w-[720px]">
        <Group label="Projects" action={<button onClick={() => setCreating("project")} className="text-mute-2" aria-label="New project"><Icon name="plus" size={16} /></button>}>
          {projects.map((c) => <Row key={c.id} c={c} />)}
        </Group>
        <Group label="Direct">{direct.map((c) => <Row key={c.id} c={c} direct />)}</Group>
        {oneoff.length > 0 && <Group label="One off">{oneoff.map((c) => <OneOffRow key={c.id} c={c} />)}</Group>}
      </main>
      {creating && <NewChat kind={creating === "project" ? "project" : "oneoff"} onClose={() => setCreating(null)} />}
    </>
  );
}

function Group({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section><div className="flex items-center px-4 pt-3.5 pb-1"><span className="lbl flex-1">{label}</span>{action}</div>{children}</section>;
}

function Row({ c, direct }: { c: Channel; direct?: boolean }) {
  const router = useRouter();
  const author = c.lastMessage?.authorName;
  const authorId = useStore((s) => s.agents.find((a) => a.name === author)?.id);
  async function open(e: React.MouseEvent) {
    if (direct && !c.updatedAt) { e.preventDefault(); const ch = await api.direct(c.agentIds[0]); router.push(`/c?id=${ch.id}`); }
  }
  return (
    <Link href={`/c?id=${c.id}`} onClick={open} className="flex items-center gap-3 px-4 py-2.5 hover:bg-paper-2/60">
      <ChannelIcon channel={c} size={36} />
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5"><span className={cx("flex-1 one text-[15px]", c.unread ? "font-bold" : "font-semibold")}>{c.name}</span>
          {c.live && <span className="live" />}<span className="text-mute-2 text-xs">{ago(c.lastMessage?.at)}</span></span>
        <span className="flex items-center gap-1.5">
          <span className="flex-1 flex items-center gap-[5px] min-w-0 text-mute text-[13px]">
            {!direct && authorId && <AgentFace id={authorId} size={15} />}
            <span className="one">{c.lastMessage ? (author === "You" ? `You: ${c.lastMessage.text}` : c.lastMessage.text) : direct ? "Say hi" : "No messages yet"}</span>
          </span>
          {c.unread > 0 && <span className="cnt">{c.unread}</span>}
        </span>
      </span>
    </Link>
  );
}

function OneOffRow({ c }: { c: Channel }) {
  return (
    <Link href={`/c?id=${c.id}`} className="flex items-center gap-3 px-4 py-[9px] hover:bg-paper-2/60">
      <span className="w-9 flex justify-center"><AgentFace id={c.agentIds[0]} size={24} /></span>
      <span className="one flex-1 text-[14.5px]">{c.name}</span><span className="text-mute-2 text-xs">{ago(c.updatedAt)}</span>
    </Link>
  );
}

/** New one off chat (pick an agent, say what you need) or new project channel. */
function NewChat({ kind, onClose }: { kind: "project" | "oneoff"; onClose: () => void }) {
  const agents = useStore((s) => s.agents);
  const router = useRouter();
  const [agentId, setAgentId] = useState(agents.find((a) => a.isDefault)?.id ?? agents[0]?.id);
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  const vv = useVisualViewport();

  async function go() {
    const ch = kind === "project"
      ? await api.newChannel({ name: name.trim(), kind: "project" })
      : await api.newChannel({ name: text.trim().slice(0, 60), kind: "oneoff", text: text.trim(), agentId });
    onClose();
    router.push(`/c?id=${ch.id}`);
  }

  return (
    // The sheet rides on the visible box, not the window: with the keyboard up, the window still
    // reaches the bottom of the screen and the buttons end up underneath it.
    <div className="fixed inset-x-0 top-0 z-30 flex items-end desk:items-center justify-center"
      style={{ height: vv ? vv.height : "100dvh", transform: vv ? `translateY(${vv.top}px)` : undefined }}>
      <button className="absolute inset-0 bg-ink/30" onClick={onClose} aria-label="Close" />
      <div className="relative w-full desk:w-[460px] bg-paper rounded-t-[22px] desk:rounded-2xl p-4 safe-bottom flex flex-col gap-3 appear">
        <span className="h text-xl font-semibold">{kind === "project" ? "New project" : "New chat"}</span>
        {kind === "project" ? (
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" className="h-12 rounded-xl bg-white border border-line-2 px-3.5 text-[15px] outline-none focus:border-ink" />
        ) : (
          <>
            <div className="flex gap-2">
              {agents.map((a) => (
                <button key={a.id} onClick={() => setAgentId(a.id)} className={cx("flex-1 flex items-center gap-2 p-2.5 rounded-xl border", agentId === a.id ? "bg-white border-ink" : "border-line-2")}>
                  <Face agent={a} size={28} /><span className="font-semibold">{a.name}</span>
                </button>
              ))}
            </div>
            <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="What do you need?" className="rounded-xl bg-white border border-line-2 p-3.5 text-[15px] outline-none focus:border-ink resize-none" />
          </>
        )}
        <div className="flex gap-2"><button onClick={go} disabled={kind === "project" ? !name.trim() : !text.trim()} className="btn btn-pri flex-1 h-11 disabled:opacity-40">{kind === "project" ? "Create" : "Send"}</button><button onClick={onClose} className="btn btn-sec h-11">Cancel</button></div>
      </div>
    </div>
  );
}
