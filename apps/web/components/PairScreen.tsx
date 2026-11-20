"use client";
import { useState } from "react";
import { api, token } from "@/lib/api";
import { refresh } from "@/lib/store";
import { Face } from "./bits";

/** First open on a new device. The code comes from `kotatsu pair` on the Mac. */
export function PairScreen() {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true); setErr("");
    try {
      const name = /iPhone/.test(navigator.userAgent) ? "iPhone" : /iPad/.test(navigator.userAgent) ? "iPad" : "Computer";
      const r = await api.pair(code.replace(/\D/g, ""), name);
      token.set(r.token);
      await refresh();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="h-dvh flex items-center justify-center p-6">
      <div className="w-full max-w-[360px] flex flex-col gap-4">
        <div className="flex"><Face face="fox" size={64} /><span className="-ml-3"><Face face="owl" size={64} /></span></div>
        <h1 className="h text-[26px] font-semibold leading-tight">Connect to your Mac</h1>
        <p className="text-mute text-[14.5px] leading-[21px]">On your Mac, run <code className="font-mono bg-paper-2 px-1.5 py-0.5 rounded">kotatsu pair</code> and type the 6 digit code here.</p>
        <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoFocus placeholder="123 456"
          className="h-14 rounded-2xl bg-white border border-line-2 px-4 text-[24px] tracking-[.3em] font-mono outline-none focus:border-ink" />
        {err && <p className="text-bad text-[13.5px]">{err}</p>}
        <button onClick={go} disabled={busy || code.replace(/\D/g, "").length !== 6} className="btn btn-pri h-12 text-[15px] disabled:opacity-40">{busy ? "Connecting" : "Connect"}</button>
      </div>
    </div>
  );
}
