"use client";
// Voice check. Runs the whole chain once, step by step, and prints what happened in plain words.
// This exists because the phone is the only place the microphone can be tested, and "it did not work"
// is not enough to fix anything.
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

type Step = { name: string; ok: boolean | null; note: string };

export default function CheckPage() {
  return <Suspense><Check /></Suspense>;
}

function Check() {
  const cid = useSearchParams().get("c") ?? "";
  const agents = useStore((s) => s.agents);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  const add = (s: Step) => setSteps((prev) => [...prev, s]);

  // Run on open, so this is one tap from the Talk screen and nothing to explain.
  useEffect(() => { void run(); /* eslint-disable-next-line */ }, []);

  async function run() {
    setRunning(true);
    setSteps([]);

    add({ name: "Secure connection", ok: window.isSecureContext, note: window.isSecureContext ? location.origin : "not https, the mic is blocked" });
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as any).standalone === true;
    add({ name: "Running as", ok: true, note: standalone ? "home screen app" : "a browser tab" });

    if (!navigator.mediaDevices?.getUserMedia) {
      add({ name: "Microphone permission", ok: false, note: "this browser has no getUserMedia" });
      setRunning(false);
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const t = stream.getAudioTracks()[0];
      add({ name: "Microphone permission", ok: true, note: t ? `${t.label || "default input"} · ${t.readyState}` : "no audio track" });
    } catch (e: any) {
      add({ name: "Microphone permission", ok: false, note: `${e?.name ?? "error"}: ${e?.message ?? ""}` });
      setRunning(false);
      return;
    }

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const mime = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) ?? "";
    add({ name: "Recorder", ok: !!mime, note: mime || "MediaRecorder cannot record here" });

    // Two seconds of recording, with a peak level, so a muted or dead mic shows up immediately.
    let peak = 0;
    let blob: Blob | null = null;
    if (stream && mime) {
      const ctx = new AudioContext();
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      const stop = setInterval(() => {
        an.getByteTimeDomainData(buf);
        let s = 0;
        for (const v of buf) s += (v - 128) ** 2;
        peak = Math.max(peak, Math.sqrt(s / buf.length) / 128);
      }, 60);

      blob = await new Promise<Blob | null>((resolve) => {
        const r = new MediaRecorder(stream!, { mimeType: mime });
        const parts: Blob[] = [];
        r.ondataavailable = (e) => e.data.size && parts.push(e.data);
        r.onstop = () => resolve(parts.length ? new Blob(parts, { type: parts[0].type }) : null);
        r.start(200);
        setTimeout(() => { try { r.stop(); } catch {} }, 2000);
      });
      clearInterval(stop);
      void ctx.close().catch(() => {});
      add({ name: "Recording", ok: !!blob && blob.size > 2000, note: blob ? `${blob.size} bytes, peak level ${Math.round(peak * 260)}` : "nothing recorded" });
    }

    if (blob && blob.size > 2000) {
      try {
        const { text } = await api.transcribe(blob);
        add({ name: "Hearing (on the Mac)", ok: !!text, note: text ? `“${text}”` : "heard nothing in the audio" });
      } catch (e: any) {
        add({ name: "Hearing (on the Mac)", ok: false, note: e?.message ?? "failed" });
      }
    }

    try {
      const sound = await api.speak("This is the voice check.", agents[0]?.id ?? "");
      add({ name: "Speaking (on the Mac)", ok: sound.size > 2000, note: `${sound.size} bytes of audio` });
      const url = URL.createObjectURL(sound);
      const el = audio.current!;
      el.src = url;
      try {
        await el.play();
        add({ name: "Playback", ok: true, note: "played" });
      } catch (e: any) {
        add({ name: "Playback", ok: false, note: `${e?.name ?? "blocked"}: tap the play button below` });
      }
    } catch (e: any) {
      add({ name: "Speaking (on the Mac)", ok: false, note: e?.message ?? "failed" });
    }

    stream?.getTracks().forEach((t) => t.stop());
    add({ name: "iPhone recording format", ok: true, note: ios ? "expects audio/mp4" : "expects audio/webm" });
    setRunning(false);
  }

  return (
    <div className="flex-1 flex flex-col bg-paper">
      <header className="safe-top shrink-0 flex items-center gap-1 px-2 pt-1 pb-2">
        <Link href={`/talk?c=${cid}`} className="ib" aria-label="Back"><Icon name="left" size={22} /></Link>
        <span className="h text-[17px] font-semibold flex-1">Voice check</span>
      </header>
      <main className="flex-1 overflow-y-auto px-4 pb-8">
        <p className="text-mute text-[13.5px] pb-3">Runs the whole voice chain once and prints what happened. Say something while it records.</p>
        <button onClick={() => void run()} disabled={running} className="btn btn-pri w-full h-10">
          {running ? "Checking" : "Run check"}
        </button>
        <div className="pt-4 flex flex-col gap-2">
          {steps.map((s) => (
            <div key={s.name} className="card p-3 flex gap-2.5">
              <span className={s.ok === null ? "text-mute-2" : s.ok ? "text-good" : "text-bad"}>{s.ok ? "✓" : s.ok === null ? "·" : "×"}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-semibold">{s.name}</span>
                <span className="block text-[12.5px] text-mute break-words">{s.note}</span>
              </span>
            </div>
          ))}
        </div>
        <audio ref={audio} controls playsInline className="w-full mt-4" />
      </main>
    </div>
  );
}
