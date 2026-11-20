"use client";
// The channel timeline: your messages on the right, agent messages with their face, cards under the text.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Card, Message } from "@kotatsu/shared";
import { Icon } from "./Icon";
import { AgentFace } from "./bits";
import { api } from "@/lib/api";
import { useAgent, useStore } from "@/lib/store";
import { clock, cx } from "@/lib/util";

export function Markdown({ text, large }: { text: string; large?: boolean }) {
  return (
    <div className={cx("md", large && "md-lg")}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>{text}</ReactMarkdown>
    </div>
  );
}

/** Turns @Name into a highlighted chip, for your own messages. */
function withMentions(text: string, names: string[]) {
  return text.split(/(@[\p{L}\p{N}_-]+)/u).map((p, i) =>
    p.startsWith("@") && names.some((n) => n.toLowerCase() === p.slice(1).toLowerCase()) ? <span key={i} className="mention">{p}</span> : p);
}

export function MessageView({ m }: { m: Message }) {
  const agents = useStore((s) => s.agents);
  const names = agents.map((a) => a.name);
  if (m.author.kind === "user") {
    return (
      <div className="flex flex-col items-end gap-1.5 appear">
        {!!m.attachments?.length && (
          <div className="flex flex-wrap gap-1.5 justify-end">
            {m.attachments.map((a) => (
              <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block">
                <img src={a.url} alt={a.name ?? "picture"} loading="lazy"
                  className="max-h-[260px] max-w-[260px] rounded-[14px] border border-line object-cover" />
              </a>
            ))}
          </div>
        )}
        {m.text && <span className="max-w-[min(520px,80%)] bg-ink text-white px-[13px] py-[9px] rounded-[18px_18px_4px_18px] text-[14.5px] leading-5 whitespace-pre-wrap break-words">{withMentions(m.text, names)}</span>}
      </div>
    );
  }
  if (m.author.kind === "system") return <div className="text-center text-mute text-[12.5px]">{m.text}</div>;
  return <AgentMessage m={m} agentId={m.author.agentId} names={names} />;
}

function AgentMessage({ m, agentId, names }: { m: Message; agentId: string; names: string[] }) {
  const agent = useAgent(agentId);
  const from = useAgent(m.replyToAgent);
  const text = m.text.replace(new RegExp(`@(${names.join("|")})\\b`, "g"), "**@$1**");
  return (
    <div className="flex gap-2.5 appear">
      <AgentFace id={agentId} size={30} />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <span className="flex items-center gap-1.5">
          <span className="text-[13.5px] font-semibold">{agent?.name}</span>
          {from && <span className="text-mute-2 text-[11.5px]">for {from.name}</span>}
          <span className="text-mute-2 text-[11.5px]">{clock(m.createdAt)}</span>
        </span>
        {m.text ? <Markdown text={text} /> : m.status === "streaming"
          ? <span className="flex items-center gap-2 text-mute text-[14px]"><Typing />{m.pending ? "On it, hold on" : "Working"}</span>
          : null}
        {m.status === "error" && <span className="text-bad text-[13px]">Did not finish.</span>}
        {!!m.attachments?.length && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {m.attachments.map((a) => (
              <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block">
                <img src={a.url} alt={a.name ?? "picture"} loading="lazy"
                  className="max-h-[240px] max-w-[260px] rounded-[12px] border border-line object-cover" />
              </a>
            ))}
          </div>
        )}
        {m.cards?.map((c, i) => <CardView key={i} card={c} messageId={m.id} index={i} channelId={m.channelId} />)}
      </div>
    </div>
  );
}

function Typing() {
  return <span className="flex gap-1 py-2">{[0, 1, 2].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-mute-2" style={{ animation: `bar 1s ${i * 0.15}s infinite` }} />)}</span>;
}

function CardView({ card, messageId, index, channelId }: { card: Card; messageId: string; index: number; channelId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  switch (card.type) {
    case "stats":
      return (
        <div className="flex gap-1.5 max-w-[520px]">
          {card.items.map((s) => (
            <div key={s.label} className="flex-1 px-2.5 py-[9px] rounded-xl bg-white border border-line flex flex-col gap-0.5">
              <span className="text-mute text-[11.5px]">{s.label}</span>
              <span className="flex items-center gap-1.5"><span className="text-[17px] font-semibold">{s.value}</span>
                {s.delta && <span className={cx("text-xs font-semibold", s.good === false ? "text-bad" : "text-good")}>{s.delta}</span>}</span>
            </div>
          ))}
        </div>
      );
    case "report":
      return (
        <div className="card rounded-[14px] p-3.5 flex flex-col gap-2.5 max-w-[520px]">
          <span className="flex items-center gap-2">
            <span className="w-[26px] h-[26px] rounded-[8px] bg-paper-2 text-mute flex items-center justify-center"><Icon name="check" size={14} /></span>
            <span className="text-[14.5px] font-semibold leading-[19px] flex-1">{card.title}</span>
          </span>
          {([["Changed", card.changed, "pen"], ["Checked", card.verified, "check"], ["Still unproven", card.unproven, "alert"]] as const).map(([label, items, icon]) =>
            items.length ? (
              <div key={label} className="flex flex-col gap-1">
                <span className="lbl flex items-center gap-1.5"><Icon name={icon as any} size={12} />{label}</span>
                {items.map((it, i) => <span key={i} className="text-[13px] leading-[18px] text-ink-2">{it}</span>)}
              </div>
            ) : null,
          )}
        </div>
      );
    case "link":
      return (
        <a href={card.url} target="_blank" rel="noreferrer" className="card rounded-[14px] p-3 flex flex-col gap-1.5 max-w-[520px]">
          <span className="flex items-center gap-2.5"><span className="text-mute"><Icon name={card.icon === "mail" ? "mail" : card.icon === "code" ? "code" : "link"} size={16} /></span>
            <span className="flex-1 text-[14px] font-semibold">{card.title}</span><span className="text-mute-2"><Icon name="ext" size={13} /></span></span>
          {card.sub && <span className="text-mute text-[12.5px]">{card.sub}</span>}
        </a>
      );
    case "actions":
      return (
        <div className="flex gap-1.5 max-w-[520px]">
          {card.actions.map((a, i) => (
            <button key={a.id} disabled={busy} className={cx("btn", a.primary || i === 0 ? "btn-pri flex-1" : "btn-sec")}
              onClick={async () => {
                if (a.do.type === "send") { setBusy(true); await api.send(a.do.channelId, a.do.text, a.do.agentId); setBusy(false); }
                else if (a.do.type === "open") /^https?:/.test(a.do.href) ? window.open(a.do.href, "_blank") : router.push(a.do.href);
                else if (a.do.type === "approve") await api.decide(a.do.approvalId, a.do.decision);
              }}>{a.label}</button>
          ))}
        </div>
      );
    case "approval":
      return (
        <div className="rounded-2xl bg-ink text-white p-3.5 flex flex-col gap-2.5 max-w-[520px]">
          <span className="text-[15px] font-semibold leading-[21px]">{card.title}</span>
          {card.command && <span className="font-mono text-xs bg-[#1f1f22] rounded-lg px-2.5 py-2 text-[#e4e4e7] break-all">{card.command}</span>}
          {card.state === "waiting" ? (
            <div className="flex gap-1.5">
              <button className="btn flex-1 bg-white text-ink" onClick={() => api.decide(card.approvalId, "approve")}>Approve</button>
              <button className="btn bg-[#2b2a27] text-[#e9e6df]" onClick={() => api.decide(card.approvalId, "reject")}>Reject</button>
            </div>
          ) : (
            <span className="text-[13px] text-[#b9b7ae] flex items-center gap-1.5">
              {card.state === "approved" ? <><Icon name="check" size={14} />Approved</> : card.state === "rejected" ? "Rejected" : "Timed out. Ask again if you still want it."}
            </span>
          )}
        </div>
      );
    case "watchOffer":
      if (card.state === "accepted") return <span className="flex items-center gap-1.5 text-[12.5px] text-good font-semibold"><Icon name="eye" size={14} />Watching: {card.draft.title}</span>;
      if (card.state === "declined") return null;
      return (
        <div className="rounded-[14px] border border-dashed border-[#d6d3cb] bg-[#fbfaf8] p-3 flex flex-col gap-2.5 max-w-[520px]">
          <span className="flex items-center gap-2 text-[14px] font-semibold"><Icon name="eye" size={16} />Watch for more of this?</span>
          <span className="text-mute text-[13px] leading-[18px]">{card.draft.title}. You will get a nudge when something new comes in.</span>
          <div className="flex gap-1.5">
            <button disabled={busy} className="btn btn-pri flex-1" onClick={async () => { setBusy(true); await api.card(messageId, index, "accepted"); }}>Watch for more</button>
            <button disabled={busy} className="btn btn-sec" onClick={() => api.card(messageId, index, "declined")}>No thanks</button>
          </div>
        </div>
      );
  }
}
