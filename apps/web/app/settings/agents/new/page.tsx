"use client";
// Add an agent: what is on this Mac first, then how it looks, then a test message.
// The agent starts the moment it is saved, with no restart.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { DeskBar, PageTitle } from "@/components/bits";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/util";

type Found = { runtime: string; label: string; ready: boolean; hint?: string; profiles?: string[] };
const FACES = ["fox", "owl", "duck", "cat", "panda", "frog", "penguin", "bear", "puppy", "red-panda"];

export default function NewAgent() {
  const router = useRouter();
  const channels = useStore((s) => s.channels);
  const [found, setFound] = useState<Found[]>([]);
  const [kind, setKind] = useState("");
  const [name, setName] = useState("");
  const [face, setFace] = useState("fox");
  const [voice, setVoice] = useState("Calm, warm");
  const [goodAt, setGoodAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [url, setUrl] = useState("");
  const [profile, setProfile] = useState("");
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [test, setTest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { api.detectAgents().then(setFound).catch(() => {}); }, []);

  const ready = found.filter((f) => f.ready);
  const others = found.filter((f) => !f.ready);

  async function save() {
    if (!kind || !name.trim()) { setError("Pick a kind and give it a name."); return; }
    setBusy(true); setError("");
    try {
      const a = await api.addAgent({
        name: name.trim(), runtime: kind, face, voice,
        goodAt: goodAt.split(",").map((s) => s.trim()).filter(Boolean),
        config: { instructions, ...(kind === "http" ? { url } : {}), ...(kind === "hermes" ? { profile } : {}) },
        channelIds: all ? channels.filter((c) => c.kind === "project").map((c) => c.id) : picked,
      });
      if (test.trim()) {
        const dm = channels.find((c) => c.id === `dm-${a.id}`);
        if (dm) await api.send(dm.id, test.trim(), { agentId: a.id });
      }
      router.replace("/settings");
    } catch (e: any) {
      setError(e?.message ?? "That did not save. Try again.");
    } finally { setBusy(false); }
  }

  const Card = ({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) => (
    <button onClick={onClick} className={cx("card px-3.5 py-3 flex items-center gap-3 text-left", on && "border-ink")}>{children}</button>
  );

  return (
    <>
      <PageTitle title="Add an agent" sub="Kotatsu" />
      <DeskBar><span className="h text-lg font-semibold">Add an agent</span></DeskBar>
      <main className="flex-1 overflow-y-auto px-3.5 pb-28 desk:px-[26px] desk:py-5">
        <div className="max-w-[640px] flex flex-col gap-3">

          <Label>Kind</Label>
          {ready.map((f) => (
            <Card key={f.runtime} on={kind === f.runtime} onClick={() => { setKind(f.runtime); if (!name) setName(f.runtime === "claude" ? "Claude" : f.runtime === "codex" ? "Codex" : "Hermes"); if (f.profiles?.[0]) setProfile(f.profiles[0]); }}>
              <span className="w-9 h-9 rounded-[10px] bg-good-soft text-good flex items-center justify-center"><Icon name="check" size={16} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-medium one">{f.profiles?.length ? `${f.label}: ${f.profiles.join(", ")}` : f.label}</span>
                <span className="block text-[12.5px] text-mute one">Ready on this Mac</span>
              </span>
            </Card>
          ))}
          {others.map((f) => (
            <div key={f.runtime} className="card px-3.5 py-3 flex items-center gap-3 opacity-70">
              <span className="w-9 h-9 rounded-[10px] bg-paper-2 text-mute flex items-center justify-center"><Icon name="alert" size={16} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-medium">{f.label}</span>
                <span className="block text-[12.5px] text-mute">{f.hint}</span>
              </span>
            </div>
          ))}
          <Card on={kind === "http"} onClick={() => { setKind("http"); if (!name) setName("My agent"); }}>
            <span className="w-9 h-9 rounded-[10px] bg-paper-2 text-mute flex items-center justify-center"><Icon name="link" size={16} /></span>
            <span className="flex-1"><span className="block text-[14px] font-medium">Connect by address</span>
              <span className="block text-[12.5px] text-mute">Any agent that speaks the small protocol</span></span>
          </Card>
          {kind === "http" && (
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:9000/agent" className="field font-mono text-[13px]" />
          )}

          <Label>Face and name</Label>
          <div className="card px-3.5 py-3 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <img src={`/avatars/${face}.webp`} alt="" className="w-9 h-9 rounded-full object-cover" />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="field flex-1" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {FACES.map((f) => (
                <button key={f} onClick={() => setFace(f)} className={cx("w-8 h-8 rounded-full overflow-hidden", face === f && "ring-2 ring-ink")}>
                  <img src={`/avatars/${f}.webp`} alt={f} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
            <input value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="Voice, in a few words" className="field" />
            <input value={goodAt} onChange={(e) => setGoodAt(e.target.value)} placeholder="Good at: email, writing, builds" className="field" />
          </div>

          <Label>Instructions (optional)</Label>
          <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4}
            placeholder="How this agent should work, in plain words." className="field resize-none text-[13.5px]" />

          <Label>Which projects</Label>
          <Card on={all} onClick={() => setAll(true)}>
            <span className="flex-1 text-[14px]">Every project</span>
            {all && <Icon name="check" size={16} />}
          </Card>
          {!all && channels.filter((c) => c.kind === "project").map((c) => (
            <Card key={c.id} on={picked.includes(c.id)} onClick={() => setPicked((p) => p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id])}>
              <span className="flex-1 text-[14px] one">{c.name}</span>
              {picked.includes(c.id) && <Icon name="check" size={16} />}
            </Card>
          ))}
          <button onClick={() => setAll(false)} className="text-mute text-[13px] self-start">Pick projects instead</button>

          <Label>Test message (optional)</Label>
          <input value={test} onChange={(e) => setTest(e.target.value)} placeholder="Say hi to it" className="field" />

          {error && <p className="text-bad text-[13px]">{error}</p>}
          <button onClick={save} disabled={busy} className="btn btn-pri h-11 mt-1">{busy ? "Adding" : "Add agent"}</button>
          <Link href="/settings" className="text-mute text-[13px] self-center">Cancel</Link>
        </div>
      </main>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="lbl px-1 pt-2">{children}</span>;
}
