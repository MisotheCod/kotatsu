"use client";
// Talk: a hands free call with an agent. You speak, it answers out loud, the words appear as it goes,
// and the mic comes back on by itself when it finishes. The hearing and the speaking both happen on the
// this Mac (ElevenLabs), not in the browser, so it behaves the same in a home screen app on iOS.
//
// Everything is still saved to the channel as ordinary text.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { ChannelIcon, Face } from "@/components/bits";
import { api } from "@/lib/api";
import { report } from "@/lib/report";
import { WavRecorder } from "@/lib/wav";
import { VERSION } from "@/lib/version";
import { getState, loadMessages, useChannel, useStore } from "@/lib/store";
import { cx } from "@/lib/util";

type Phase = "paused" | "listening" | "thinking" | "speaking";

export default function TalkPage() {
  return <Suspense><Talk /></Suspense>;
}

/** How long a silence ends your turn. Long enough to think, short enough to feel quick. */
const SILENCE_MS = 650;  // he stops talking, we should be sending, not waiting
const MAX_TURN_MS = 30000;

function clean(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cut a growing reply into sentences so speaking can start before the reply is finished. */
/**
 * Chunks to speak. A long first sentence is split at its first comma so the voice starts sooner: the
 * point is to be heard, not to be grammatically tidy.
 */
function sentences(text: string) {
  const out: string[] = [];
  for (const s of clean(text).split(/(?<=[.!?])\s+/)) {
    if (s.length > 70) {
      const cut = s.search(/[,;:]\s/);
      if (cut > 20) {
        out.push(s.slice(0, cut + 1).trim(), s.slice(cut + 1).trim());
        continue;
      }
    }
    if (s.length > 1) out.push(s);
  }
  return out.filter((s) => s.length > 1);
}

function Talk() {
  const params = useSearchParams();
  const router = useRouter();
  const cid = params.get("c") ?? "";
  const channel = useChannel(cid);
  const members = useStore((s) => s.agents.filter((a) => channel?.agentIds.includes(a.id)));
  const [agentId, setAgentId] = useState<string>("");
  const [phase, setPhaseState] = useState<Phase>("paused");
  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p); };
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState("");
  const [err, setErr] = useState("");
  const [level, setLevel] = useState(0);

  const alive = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const wav = useRef<WavRecorder | null>(null);
  const phaseRef = useRef<Phase>("paused");
  const chunks = useRef<Blob[]>([]);
  const ctx = useRef<AudioContext | null>(null);
  const spoke = useRef(false);
  const quietAt = useRef(0);
  const startedAt = useRef(0);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<string[]>([]);
  const spokenUpTo = useRef(0);
  const speaking = useRef(false);
  const replyDone = useRef(false);
  const silentHint = useRef(false);
  const tinyHint = useRef(false);
  const clock = useRef<{ spoke?: number; sent?: number; heard?: number; said?: number }>({});

  const agent = members.find((a) => a.id === agentId) ?? members.find((a) => a.isDefault) ?? members[0];

  useEffect(() => { if (cid) void loadMessages(cid); }, [cid]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopAll() {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
    queue.current = [];
    try { rec.current?.state === "recording" && rec.current.stop(); } catch {}
    void wav.current?.stop().catch(() => {});
    wav.current = null;
    try { audio.current?.pause(); } catch {}
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
    speaking.current = false;
  }

  // ---------- listening ----------

  async function start() {
    setErr("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setErr("This browser cannot reach the mic. Type below instead.");
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e: any) {
      report("mic.denied", `${e?.name}: ${e?.message} ua=${navigator.userAgent}`);
      setErr(e?.name === "NotAllowedError"
        ? "The mic is blocked. Allow Microphone for Kotatsu in Settings, then tap Talk again."
        : `The mic did not start (${e?.name ?? "unknown"}). Type below instead.`);
      return;
    }
    report("mic.ok", `tracks=${stream.current.getAudioTracks().length} labels=${stream.current.getAudioTracks().map((x) => x.label).join(",")}`);
    // iOS only lets audio play after a gesture. This tap is it, so unlock playback now.
    // Never wait on the audio element: play() on an empty src can hang forever in some browsers, and
    // that hang used to stop the mic from ever opening. Give it 400ms and move on.
    try {
      await Promise.race([
        audio.current?.play().then(() => audio.current?.pause()),
        new Promise((r) => setTimeout(r, 400)),
      ]);
    } catch (e: any) { report("unlock.failed", e); }
    try {
      await record();
    } catch (e: any) {
      report("record.threw", `${e?.name}: ${e?.message}`);
      setErr(`Recording stopped: ${e?.message ?? "unknown"}`);
      setPhase("paused");
    }
  }

  async function record() {
    report("record.enter", `alive=${alive.current} tracks=${stream.current?.getAudioTracks().map((x) => x.readyState).join(",")}`);
    if (!alive.current) return;
    // iOS tears the stream down when the speaker takes over; get a fresh one instead of recording silence.
    if (!stream.current || stream.current.getTracks().every((tr) => tr.readyState === "ended")) {
      await start();
      return;
    }
    chunks.current = [];
    spoke.current = false;
    quietAt.current = 0;
    startedAt.current = Date.now();
    silentHint.current = false;
    setHeard("");
    setSaid("");
    setErr("");

    // Safari's MediaRecorder is the one piece that behaves differently from every other browser, and it
    // has produced nothing on a real phone twice. On iOS we skip it and read the samples ourselves.
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios) {
      try {
        wav.current = new WavRecorder(stream.current!, (n) => tickLevel(n));
        setPhase("listening");
        report("listen.wav", `phase=${phaseRef.current}`);
        tickLoop();
        return;
      } catch (e: any) {
        report("wav.failed", `${e?.name}: ${e?.message}`);
      }
    }

    const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    const mime = preferred.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
    let r: MediaRecorder;
    try {
      r = mime ? new MediaRecorder(stream.current, { mimeType: mime }) : new MediaRecorder(stream.current);
    } catch (e: any) {
      setErr(`This browser will not record audio (${e?.name ?? "unknown"}). Type below instead.`);
      report("recorder.failed", `${e?.name}: ${e?.message}`);
      setPhase("paused");
      return;
    }
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = () => { void finished(); };
    rec.current = r;
    r.start(250);
    setPhase("listening");
    report("listen.mr", `phase=${phaseRef.current} state=${r.state}`);
    watchSilence();
  }

  /** One place that reads the mic level, whoever is doing the recording. */
  function tickLevel(level0to1: number) {
    // Speech peaks around 0.05-0.3 of full scale; silence sits under 0.01. Show it as a percentage.
    setLevel(Math.min(100, Math.round(level0to1 * 400)));
    const now = Date.now();
    if (level0to1 > 0.01) {
      if (!spoke.current) clock.current = { spoke: Date.now() };
      spoke.current = true; quietAt.current = 0;
    }
    else if (spoke.current && !quietAt.current) quietAt.current = now;
    if (!spoke.current && now - startedAt.current > 6000 && !silentHint.current) {
      silentHint.current = true;
      setErr("The mic is open but I am not hearing anything. Check Microphone permission for Kotatsu.");
    }
  }

  function shouldStop() {
    const now = Date.now();
    return (spoke.current && quietAt.current && now - quietAt.current > SILENCE_MS) || now - startedAt.current > MAX_TURN_MS;
  }

  function tickLoop() {
    if (!alive.current || phaseRef.current !== "listening") return;
    if (shouldStop()) { void stopAndSend(); return; }
    requestAnimationFrame(tickLoop);
  }

  async function stopAndSend() {
    if (wav.current) {
      const w = wav.current;
      wav.current = null;
      const blob = await w.stop();
      await finished(blob);
      return;
    }
    try { rec.current?.stop(); } catch {}
  }

  function watchSilence() {
    if (!ctx.current) ctx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const c = ctx.current!;
    // iOS suspends a context that was not created inside a gesture; without this the level is always 0.
    if (c.state === "suspended") void c.resume().catch(() => {});
    const src = c.createMediaStreamSource(stream.current!);
    const analyser = c.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    const tick = () => {
      if (!alive.current || rec.current?.state !== "recording") return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) ** 2;
      tickLevel(Math.sqrt(sum / data.length) / 128);
      if (shouldStop()) { try { rec.current?.stop(); } catch {} return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  async function finished(fromWav?: Blob) {
    const type = chunks.current[0]?.type || "audio/webm";
    const blob = fromWav ?? new Blob(chunks.current, { type });
    report("blob", `${blob.size} bytes type=${blob.type}`);
    if (blob.size < 2000) { // the recorder produced nothing usable
      setErr(tinyHint.current
        ? "The mic recorded no audio. Check Microphone permission for Kotatsu in Settings, then tap Talk again."
        : "I did not catch any sound. Tap Talk and speak, or type below.");
      tinyHint.current = true;
      setPhase("paused");
      return;
    }
    setPhase("thinking");
    clock.current.sent = Date.now();
    try {
      const { text } = await api.transcribe(blob);
      clock.current.heard = Date.now();
      if (!alive.current) return;
      if (!text.trim()) { setPhase("listening"); void record(); return; }
      setHeard(text);
      await ask(text);
    } catch (e: any) {
      if (!alive.current) return;
      report("transcribe.failed", `${e?.name}: ${e?.message}`);
      setErr(e?.message ?? "Could not hear that.");
      setPhase("paused");
    }
  }

  // ---------- talking ----------

  async function ask(text: string) {
    if (!agent) return;
    setPhase("thinking");
    setSaid("");
    queue.current = [];
    spokenUpTo.current = 0;
    replyDone.current = false;
    const sent = await api.send(cid, `[Spoken reply. Answer in one or two short sentences, no lists, no markdown.] ${text}`, agent.id);

    if (poll.current) clearInterval(poll.current);
    poll.current = setInterval(() => {
      if (!alive.current) return;
      const list = getState().messages[cid] ?? [];
      const m = list.find((x) => x.author.kind === "agent" && x.author.agentId === agent.id && x.createdAt >= sent.createdAt);
      if (!m) return;
      setSaid(clean(m.text));
      // Speak sentences as they land, not the whole reply at the end.
      const parts = sentences(m.text);
      while (spokenUpTo.current < parts.length) {
        const s = parts[spokenUpTo.current];
        if (s && (spokenUpTo.current < parts.length - 1 || m.status !== "streaming")) {
          queue.current.push(s);
          spokenUpTo.current++;
          void sayNext();
        } else break;
      }
      if (m.status !== "streaming") {
        replyDone.current = true;
        clearInterval(poll.current!);
        poll.current = null;
        if (!queue.current.length && !speaking.current) backToListening();
      }
    }, 150);
  }

  async function sayNext() {
    if (speaking.current) return;
    if (clock.current.heard && !clock.current.said) {
      clock.current.said = Date.now();
      const c = clock.current;
      const said = c.said!;
      report("timing", {
        silenceToSend: c.sent && c.spoke ? c.sent - c.spoke : null,
        sendToText: c.heard && c.sent ? c.heard - c.sent : null,
        textToFirstWord: c.heard ? said - c.heard : null,
        total: said - (c.spoke ?? c.sent ?? said),
      });
    }
    const line = queue.current.shift();
    if (!line || !alive.current) {
      if (replyDone.current) backToListening();
      return;
    }
    speaking.current = true;
    setPhase("speaking");
    try {
      const blob = await api.speak(line, agent?.id);
      const url = URL.createObjectURL(blob);
      const el = audio.current!;
      el.src = url;
      el.onended = () => { URL.revokeObjectURL(url); speaking.current = false; void sayNext(); };
      await el.play();
    } catch (e: any) {
      speaking.current = false;
      setErr(e?.message ?? "Could not speak that.");
      if (alive.current) setPhase("listening");
    }
  }

  function backToListening() {
    if (!alive.current || !stream.current) { setPhase("paused"); return; }
    setTimeout(() => { if (alive.current && stream.current) void record(); }, 350);
  }

  // ---------- controls ----------

  function interrupt() {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
    queue.current = [];
    speaking.current = false;
    try { audio.current?.pause(); } catch {}
    setSaid("");
    setHeard("");
    void record();
  }

  function end() {
    alive.current = false;
    stopAll();
    router.push(`/c?id=${cid}`);
  }

  function switchAgent() {
    const i = members.findIndex((a) => a.id === agent?.id);
    setAgentId(members[(i + 1) % members.length].id);
  }

  if (!channel || !agent)
    return <div className="flex-1 flex items-center justify-center text-mute text-[14px]">Loading Talk</div>;
  const other = members.find((a) => a.id !== agent.id);

  return (
    <div className="flex-1 flex flex-col bg-paper">
      <header className="safe-top shrink-0 flex items-center px-3.5 pt-1">
        <Link href={`/c?id=${cid}`} className="ib" aria-label="Close"><Icon name="down" size={22} /></Link>
        <span className="flex-1 flex items-center justify-center gap-1.5 text-[14px] font-semibold"><ChannelIcon channel={channel} size={18} />{channel.name}</span>
        <span className="text-[10.5px] text-mute-2/70 pr-1">{VERSION}</span>
        <Link href={`/talk/check?c=${cid}`} className="text-[12px] text-mute-2 underline pr-1">Check</Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-[18px] px-6 max-w-[520px] mx-auto w-full">
        <div className="relative w-[180px] h-[180px] flex items-center justify-center">
          <span className={cx("absolute inset-0 rounded-full bg-[#efe9e1]", phase === "speaking" && "animate-pulse")} />
          <span className="absolute -inset-3.5 rounded-full border-2 border-[#efe9e1]" />
          <span className="relative"><Face agent={agent} size={150} /></span>
        </div>
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          {phase !== "paused" && <span className="live" />}
          {phase === "listening" ? "Listening" : phase === "thinking" ? `${agent.name} is thinking` : phase === "speaking" ? `${agent.name} is talking` : "Tap the mic to talk"}
        </span>
        <div className="flex items-center gap-[5px] h-20">
          {Array.from({ length: 18 }).map((_, i) => (
            <span key={i} className="w-[5px] rounded-full bg-ink origin-center" style={{
              height: 10 + ((i * 37) % 68), opacity: phase === "paused" ? 0.2 : 0.8,
              animation: phase === "speaking" || phase === "listening" ? `bar ${0.7 + (i % 5) * 0.12}s ${i * 0.05}s infinite ease-in-out` : undefined,
            }} />
          ))}
        </div>
        {said && <p className="text-center text-[19px] leading-7 font-medium line-clamp-6">{said}</p>}
        {phase === "listening" && (
          <span className="flex items-center gap-2 text-[11.5px] text-mute-2">
            <span className="w-[90px] h-1 rounded-full bg-line-2 overflow-hidden">
              <span className="block h-full bg-good transition-[width] duration-100" style={{ width: `${level}%` }} />
            </span>
            mic {level}
          </span>
        )}
        {heard && <p className="text-center text-mute text-[14px]">You: “{heard}”</p>}
        {err && <p className="text-center text-bad text-[13px]">{err}</p>}
      </main>

      <footer className="shrink-0 flex items-center justify-center gap-[22px] px-6 pt-2.5 pb-10 safe-bottom">
        <Round
          onClick={() => {
            if (phase === "paused") return void start();
            if (phase === "listening") { void stopAndSend(); return; }  // send what you said
            interrupt();                                                                  // cut it off
          }}
          label={phase === "paused" ? "Talk" : phase === "listening" ? "Send now" : "Interrupt"}>
          <Icon name="mic" size={22} />
        </Round>
        {other && <Round onClick={switchAgent} label="Switch"><Face agent={other} size={40} /></Round>}
        <button onClick={end} className="flex flex-col items-center gap-1" aria-label="End"><span className="w-[72px] h-[72px] rounded-full bg-bad text-white flex items-center justify-center"><Icon name="end" size={30} /></span><span className="text-mute text-[11px]">End</span></button>
        <Round onClick={() => router.push(`/c?id=${cid}`)} label="Text"><Icon name="chat" size={22} /></Round>
      </footer>
      <form
        onSubmit={(e) => { e.preventDefault(); const el = (e.currentTarget.elements.namedItem("typed") as HTMLInputElement); const v = el.value.trim(); if (v) { el.value = ""; void ask(v); } }}
        className="shrink-0 px-5 pb-4 safe-bottom">
        <label className="field"><Icon name="chat" size={16} />
          <input name="typed" placeholder="Or type it" className="flex-1 bg-transparent outline-none min-w-0 text-ink placeholder:text-mute-2" />
        </label>
      </form>
      <audio ref={audio} playsInline preload="auto" className="hidden" />
    </div>
  );
}

function Round({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button aria-label={label} onClick={onClick} className="flex flex-col items-center gap-1">
      <span className="w-[58px] h-[58px] rounded-full bg-white border border-line-2 flex items-center justify-center">{children}</span>
      <span className="text-mute text-[11px]">{label}</span>
    </button>
  );
}
