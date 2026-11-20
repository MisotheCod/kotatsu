"use client";
// The message box. @ opens the agent picker. The mic dictates. The wave button starts Talk.
// With no @, the chat's default agent answers.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Agent, Attachment, Channel } from "@kotatsu/shared";
import { Icon } from "./Icon";
import { Face } from "./bits";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/util";

export function Composer({ channel, onSent }: { channel: Channel; onSent?: () => void }) {
  const agents = useStore((s) => s.agents.filter((a) => channel.agentIds.includes(a.id)));
  const [text, setText] = useState("");
  const [pick, setPick] = useState<{ q: string; start: number } | null>(null);
  const [sel, setSel] = useState(0);
  const [listening, setListening] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [pics, setPics] = useState<{ file: File; preview: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const rec = useRef<any>(null);

  useEffect(() => {
    const el = ta.current; if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 6 * 22)}px`;
  }, [text]);

  const matches = pick ? agents.filter((a) => a.name.toLowerCase().startsWith(pick.q.toLowerCase())) : [];

  function onChange(v: string) {
    setText(v);
    const caret = ta.current?.selectionStart ?? v.length;
    const m = /(^|\s)@([\p{L}\p{N}_-]*)$/u.exec(v.slice(0, caret));
    if (m) { setPick({ q: m[2], start: caret - m[2].length - 1 }); setSel(0); } else setPick(null);
  }

  function choose(a: Agent) {
    if (!pick) return;
    const caret = ta.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, pick.start)}@${a.name} ${text.slice(caret)}`;
    setText(next); setPick(null);
    requestAnimationFrame(() => ta.current?.focus());
  }

  function addFiles(list: FileList | File[]) {
    const next = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, 6 - pics.length)
      .map((file) => ({ file, preview: URL.createObjectURL(file) }));
    if (next.length) setPics((p) => [...p, ...next]);
  }

  function drop(i: number) {
    setPics((p) => { URL.revokeObjectURL(p[i].preview); return p.filter((_, j) => j !== i); });
  }

  async function send() {
    const t = text.trim();
    if (!t && !pics.length) return;
    const sending = pics;
    setText(""); setPick(null); setPics([]);
    setBusy(true);
    try {
      // Upload first, then send one message that carries both the words and the pictures.
      const attachments: Attachment[] = [];
      for (const p of sending) {
        try { attachments.push((await api.upload(p.file)).attachment); } catch (e: any) { alert(e.message); }
        URL.revokeObjectURL(p.preview);
      }
      await api.send(channel.id, t || (attachments.length ? "Look at this." : ""), { attachments });
      onSent?.();
    } finally { setBusy(false); }
  }

  function dictate() {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return alert("Dictation is not available in this browser. Use the keyboard mic instead.");
    if (listening) { rec.current?.stop(); return; }
    const r = new SR();
    r.lang = "en-US"; r.interimResults = true; r.continuous = true;
    const base = text ? `${text} ` : "";
    r.onresult = (e: any) => setText(base + Array.from(e.results).map((x: any) => x[0].transcript).join(""));
    r.onend = () => setListening(false);
    rec.current = r; r.start(); setListening(true);
  }

  const def = agents.find((a) => a.isDefault) ?? agents[0];
  const placeholder = `Message ${channel.name}`;

  return (
    <div className="shrink-0 px-3 pt-2 safe-bottom desk:px-[26px] desk:pb-5 bg-paper relative">
      {pick && matches.length > 0 && (
        <div className="absolute left-3 right-3 bottom-full mb-1 desk:left-[26px] desk:right-auto desk:w-[360px] card p-1.5 shadow-[0_12px_32px_rgba(20,20,19,.14)] appear z-10">
          <div className="lbl px-2.5 pt-1.5 pb-1">Ask in {channel.name}</div>
          {matches.map((a, i) => (
            <button key={a.id} onMouseDown={(e) => { e.preventDefault(); choose(a); }}
              className={cx("w-full flex items-center gap-2.5 px-2.5 py-[9px] rounded-[10px] text-left", i === sel && "bg-[#f3f1ec]")}>
              <Face agent={a} size={32} />
              <span className="flex-1 flex flex-col gap-px min-w-0"><span className="text-[14.5px] font-semibold">{a.name}</span><span className="one text-mute text-[12.5px]">{a.goodAt.join(", ")}</span></span>
              {i === sel && <Icon name="check" size={16} />}
            </button>
          ))}
          {def && <div className="flex items-center gap-1.5 text-mute text-xs px-2.5 pt-2 pb-1.5 mt-1 border-t border-line-3"><Icon name="spark" size={13} />No @ and {def.name} picks who answers</div>}
        </div>
      )}
      {pics.length > 0 && (
        <div className="max-w-[760px] mx-auto flex gap-1.5 pb-1.5 px-1">
          {pics.map((p, i) => (
            <span key={i} className="relative">
              <img src={p.preview} alt="" className="w-14 h-14 rounded-[10px] object-cover border border-line-2" />
              <button onClick={() => drop(i)} aria-label="Remove picture"
                className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] rounded-full bg-ink text-white flex items-center justify-center"><Icon name="x" size={10} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="max-w-[760px] mx-auto flex items-end gap-1.5 bg-white border border-line-2 rounded-[22px] p-[5px] pl-2"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
        <input ref={fileInput} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <button onClick={() => fileInput.current?.click()} className="ib !w-8 !h-8 text-mute" aria-label="Add a picture" disabled={busy}>
          <Icon name="plus" size={18} />
        </button>
        <button className="ib !w-8 !h-8 text-mute" aria-label="Mention an agent" onClick={() => { onChange(`${text}${text && !text.endsWith(" ") ? " " : ""}@`); ta.current?.focus(); }}>
          <Icon name="at" size={18} />
        </button>
        <textarea ref={ta} rows={1} value={text} placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => { const files = Array.from(e.clipboardData.files); if (files.length) { e.preventDefault(); addFiles(files); } }}
          onKeyDown={(e) => {
            if (pick && matches.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((sel + 1) % matches.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((sel - 1 + matches.length) % matches.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(matches[sel]); return; }
              if (e.key === "Escape") { setPick(null); return; }
            }
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 900px)").matches) { e.preventDefault(); void send(); }
          }}
          className="flex-1 resize-none outline-none bg-transparent text-[15px] leading-[22px] py-[6px] min-w-0 placeholder:text-mute-2" />
        <button onClick={dictate} className={cx("ib !w-8 !h-8", listening ? "text-clay" : "text-mute")} aria-label="Dictate"><Icon name={listening ? "mute" : "mic"} size={18} /></button>
        {text.trim() || pics.length ? (
          <button onClick={send} className="w-[34px] h-[34px] rounded-full bg-ink text-white flex items-center justify-center shrink-0" aria-label="Send"><Icon name="up" size={17} stroke={2.2} /></button>
        ) : (
          <Link href={`/talk?c=${channel.id}`} className="w-[34px] h-[34px] rounded-full bg-ink text-white flex items-center justify-center shrink-0" aria-label="Talk"><Icon name="wave" size={16} stroke={2} /></Link>
        )}
      </div>
    </div>
  );
}
