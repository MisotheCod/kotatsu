"use client";
// First run setup. One step per screen, a progress line at the top, and Back on every step.
// It opens on the Mac itself, so it needs no pairing and no account.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { cx } from "@/lib/util";

type Found = { runtime: string; label: string; ready: boolean; hint?: string; profiles?: string[] };
type Draft = { key: string; name: string; runtime: string; face: string; profile?: string; url?: string; ready: boolean };

const FACES = ["fox", "owl", "duck", "cat", "panda", "frog", "penguin", "bear", "puppy", "red-panda"];
const STEPS = ["You", "Agents", "Faces", "First", "Projects", "Connections", "Nudges", "Phone", "Done"];

const CONNECTIONS: { key: string; name: string; line: string }[] = [
  { key: "email", name: "Email", line: "nudge me when a reply I am waiting for comes in" },
  { key: "calendar", name: "Calendar", line: "remind me what is coming up" },
  { key: "stripe", name: "Stripe", line: "revenue in the project panel" },
  { key: "analytics", name: "Analytics", line: "visitors and spikes" },
  { key: "github", name: "GitHub", line: "PRs and failed builds" },
];

export default function Setup() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [firstId, setFirstId] = useState("");
  const [projects, setProjects] = useState<{ name: string; color: string }[]>([]);
  const [projectName, setProjectName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [settings, setSettings] = useState({ briefAt: "08:00", quietStart: "22:00", quietEnd: "07:00", maxNudgesPerDay: 6 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.setupState().then((s) => {
      setName(s.ownerName);
      if (s.agents.length) setFirstId(s.agents.find((a) => a.isDefault)?.id ?? s.agents[0].id);
    }).catch(() => {});
    api.detectAgents().then((list) => {
      setFound(list);
      // Anything already signed in is offered first, and pre picked.
      const ready = list.filter((f) => f.ready);
      setDrafts(ready.map((f, i) => ({
        key: f.runtime,
        name: f.runtime === "claude" ? "Claude" : f.runtime === "codex" ? "Codex"
          : f.profiles?.length ? `${f.profiles[0] === "default" ? "Hermes" : f.profiles[0]}` : "Hermes",
        runtime: f.runtime, face: ["fox", "owl", "duck"][i % 3], profile: f.profiles?.[0], ready: true,
      })));
    }).catch(() => {});
  }, []);

  const ready = useMemo(() => found.filter((f) => f.ready), [found]);
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  /** Writes everything the person chose, then opens Home. */
  const finish = async () => {
    setBusy(true);
    setError("");
    try {
      await api.setOwner(name.trim());
      const created: string[] = [];
      for (const d of drafts) {
        const a = await api.addAgent({
          name: d.name.trim() || d.runtime,
          runtime: d.runtime,
          face: d.face,
          config: d.runtime === "hermes" ? { profile: d.profile } : d.runtime === "http" ? { url: d.url } : {},
          isDefault: false,
        });
        created.push(a.id);
      }
      const first = firstId && created.includes(firstId) ? firstId : created[0];
      await api.saveSetup({
        name: name.trim(),
        defaultAgentId: first,
        projects: projects.filter((p) => p.name.trim()),
        settings,
        connections: picked,
      });
      router.replace("/");
    } catch (e: any) {
      setError(e?.message ?? "Something did not save. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <div className="safe-top shrink-0 px-5 pt-4 pb-3">
        <div className="flex items-center gap-2 pb-3">
          <span className="w-6 h-6 rounded-[7px] bg-ink text-white flex items-center justify-center text-[12px] font-semibold">K</span>
          <span className="h text-[15px] font-semibold flex-1">Kotatsu</span>
          <span className="text-mute text-[12.5px]">{step + 1} of {STEPS.length}</span>
        </div>
        <div className="h-[3px] rounded-full bg-line overflow-hidden">
          <div className="h-full bg-clay transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-5 pb-32">
        <div className="max-w-[520px] mx-auto flex flex-col gap-4 pt-4">

          {step === 0 && (
            <>
              <h1 className="h text-[26px] font-semibold">Welcome</h1>
              <p className="text-mute text-[14px] leading-[20px]">Kotatsu puts your agents in one place on this Mac. What should they call you?</p>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
                className="field text-[16px]" />
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="h text-[26px] font-semibold">Your agents</h1>
              <p className="text-mute text-[14px] leading-[20px]">Found on this Mac. Leave one out by tapping it.</p>
              <div className="flex flex-col gap-2">
                {found.map((f) => {
                  const on = drafts.some((d) => d.runtime === f.runtime);
                  return (
                    <button key={f.runtime} onClick={() => setDrafts((ds) => on ? ds.filter((d) => d.runtime !== f.runtime)
                        : [...ds, { key: f.runtime, name: f.label.split(" (")[0], runtime: f.runtime, face: "fox", profile: f.profiles?.[0], ready: f.ready }])}
                      className={cx("card px-3.5 py-3 flex items-center gap-3 text-left", on && "border-ink")}>
                      <span className={cx("w-9 h-9 rounded-[10px] flex items-center justify-center", f.ready ? "bg-good-soft text-good" : "bg-paper-2 text-mute")}>
                        <Icon name={f.ready ? "check" : "alert"} size={16} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-medium one">{f.label}</span>
                        <span className="block text-[12.5px] text-mute one">{f.ready ? "Ready" : f.hint ?? "Not ready"}</span>
                      </span>
                      {!f.ready && <span className="text-[12px] text-mute shrink-0">Help</span>}
                    </button>
                  );
                })}
                <button onClick={() => setDrafts((ds) => [...ds, { key: "http", name: "My agent", runtime: "http", face: "duck", url: "", ready: false }])}
                  className="btn btn-sec h-10">Connect by address</button>
              </div>
              {drafts.filter((d) => d.runtime === "http").map((d, i) => (
                <input key={i} value={d.url ?? ""} placeholder="http://127.0.0.1:9000/agent"
                  onChange={(e) => setDrafts((ds) => ds.map((x) => x === d ? { ...x, url: e.target.value } : x))}
                  className="field font-mono text-[13px]" />
              ))}
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="h text-[26px] font-semibold">Faces and names</h1>
              <p className="text-mute text-[14px] leading-[20px]">This is how each agent shows up in chats.</p>
              {drafts.map((d, i) => (
                <div key={d.key} className="card px-3.5 py-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <img src={`/avatars/${d.face}.webp`} alt="" className="w-9 h-9 rounded-full object-cover" />
                    <input value={d.name} onChange={(e) => setDrafts((ds) => ds.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      className="field flex-1 text-[15px]" placeholder="Name" />
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {FACES.map((f) => (
                      <button key={f} onClick={() => setDrafts((ds) => ds.map((x, j) => j === i ? { ...x, face: f } : x))}
                        className={cx("w-8 h-8 rounded-full overflow-hidden", d.face === f ? "ring-2 ring-ink" : "")}>
                        <img src={`/avatars/${f}.webp`} alt={f} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!drafts.length && <p className="text-mute text-[13.5px]">No agents picked yet. Go back and add one.</p>}
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="h text-[26px] font-semibold">Who answers first</h1>
              <p className="text-mute text-[14px] leading-[20px]">When you do not @ anyone, this one answers. You can change it per chat later.</p>
              <div className="flex flex-col gap-2">
                {drafts.map((d) => (
                  <button key={d.key} onClick={() => setFirstId(d.key)}
                    className={cx("card px-3.5 py-3 flex items-center gap-3", firstId === d.key && "border-ink")}>
                    <img src={`/avatars/${d.face}.webp`} alt="" className="w-8 h-8 rounded-full object-cover" />
                    <span className="text-[14px] flex-1 text-left">{d.name}</span>
                    {firstId === d.key && <Icon name="check" size={16} />}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h1 className="h text-[26px] font-semibold">Your projects</h1>
              <p className="text-mute text-[14px] leading-[20px]">A project is a chat with a folder and a panel. Add a few now, or skip.</p>
              <div className="flex gap-2">
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Project name" className="field flex-1" />
                <button onClick={() => { if (projectName.trim()) { setProjects((p) => [...p, { name: projectName.trim(), color: "#c96442" }]); setProjectName(""); } }}
                  className="btn btn-pri h-10 px-3">Add</button>
              </div>
              <div className="flex flex-col gap-2">
                {projects.map((p, i) => (
                  <div key={i} className="card px-3.5 py-2.5 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                    <span className="text-[14px] flex-1 one">{p.name}</span>
                    <button onClick={() => setProjects((ps) => ps.filter((_, j) => j !== i))} className="ib ib-xs"><Icon name="x" size={14} /></button>
                  </div>
                ))}
              </div>
              <button onClick={next} className="text-mute text-[13px] self-start">Skip for now</button>
            </>
          )}

          {step === 5 && (
            <>
              <h1 className="h text-[26px] font-semibold">Get more out of it</h1>
              <p className="text-mute text-[14px] leading-[20px]">Kotatsu never stores these keys. Your agent connects them in its own settings.</p>
              <div className="flex flex-col gap-2">
                {CONNECTIONS.map((c) => {
                  const on = picked.includes(c.key);
                  return (
                    <div key={c.key} className={cx("card px-3.5 py-3 flex flex-col gap-2", on && "border-ink")}>
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium flex-1">{c.name}</span>
                        {on && <span className="text-good text-[12px]">Picked</span>}
                      </div>
                      <span className="text-mute text-[12.5px] leading-[17px]">{c.line}</span>
                      <div className="flex gap-2">
                        <button onClick={() => setPicked((p) => on ? p.filter((x) => x !== c.key) : [...p, c.key])}
                          className={cx("btn h-8 px-2.5", on ? "btn-sec" : "btn-pri")}>{on ? "Remove" : "Ask my agent"}</button>
                        {!on && <button onClick={next} className="btn btn-ghost h-8 px-2.5">Later</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-mute text-[12px]">Anything you skip waits in Settings, under Get more out of Kotatsu.</p>
            </>
          )}

          {step === 6 && (
            <>
              <h1 className="h text-[26px] font-semibold">How proactive</h1>
              <p className="text-mute text-[14px] leading-[20px]">These are the defaults. Change them any time.</p>
              {([
                ["briefAt", "Morning brief", "time"],
                ["quietStart", "Quiet hours start", "time"],
                ["quietEnd", "Quiet hours end", "time"],
                ["maxNudgesPerDay", "Most nudges a day", "number"],
              ] as const).map(([k, label]) => (
                <label key={k} className="card px-3.5 py-3 flex items-center gap-3">
                  <span className="text-[14px] flex-1">{label}</span>
                  <input type={k === "maxNudgesPerDay" ? "number" : "time"} value={(settings as any)[k]}
                    onChange={(e) => setSettings((s) => ({ ...s, [k]: k === "maxNudgesPerDay" ? Number(e.target.value) : e.target.value }))}
                    className="field w-[110px] text-center" />
                </label>
              ))}
            </>
          )}

          {step === 7 && (
            <>
              <h1 className="h text-[26px] font-semibold">Connect your phone</h1>
              <p className="text-mute text-[14px] leading-[20px]">Tailscale keeps this private. Nothing is open to the internet.</p>
              <div className="card px-4 py-4 flex flex-col gap-3">
                <span className="text-[13.5px] font-medium">On this Mac</span>
                <code className="text-[12.5px] bg-paper-2 rounded-lg px-2.5 py-2 font-mono">tailscale serve --bg 8787</code>
                <span className="text-[13.5px] font-medium pt-1">On your phone</span>
                <ol className="text-[13px] text-mute leading-[19px] list-decimal pl-4 flex flex-col gap-1">
                  <li>Install Tailscale and sign in with the same account.</li>
                  <li>Open the address this Mac shows in Kotatsu, Settings.</li>
                  <li>In Safari tap Share, then Add to Home Screen.</li>
                  <li>Open Kotatsu, then Settings, and turn notifications on.</li>
                </ol>
                <span className="text-mute text-[12px]">No Tailscale yet? Install it from tailscale.com, then come back.</span>
              </div>
            </>
          )}

          {step === 8 && (
            <>
              <h1 className="h text-[26px] font-semibold">Ready</h1>
              <p className="text-mute text-[14px] leading-[20px]">Home opens with one thing to try. Nothing here is permanent.</p>
              <div className="card px-4 py-4 flex flex-col gap-2">
                <span className="text-[13.5px] font-medium">First thing to try</span>
                <span className="text-mute text-[13px] leading-[19px]">Ask an agent to find an email, then tap Watch for more.</span>
              </div>
              {error && <p className="text-bad text-[13px]">{error}</p>}
            </>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-paper border-t border-line px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="max-w-[520px] mx-auto flex gap-2">
          {step > 0 && <button onClick={back} className="btn btn-sec h-11 px-4">Back</button>}
          {step === 8
            ? <button onClick={finish} disabled={busy} className="btn btn-pri h-11 flex-1">{busy ? "Saving" : "Open Kotatsu"}</button>
            : <button onClick={next} className="btn btn-pri h-11 flex-1">Next</button>}
        </div>
      </div>
    </div>
  );
}
