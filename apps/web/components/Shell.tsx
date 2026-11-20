"use client";
// One layout for every screen and every width.
// Under 900px: content plus the tab bar. 900px and up: the Slack style sidebar plus content.
// Screens never set their own outer width, which is what made pages jump between widths before.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Suspense, useEffect } from "react";
import { Icon, type IconName } from "./Icon";
import { ChannelIcon, AgentFace } from "./bits";
import { UpdateBar } from "./UpdateBar";
import { PairScreen } from "./PairScreen";
import { startLive, useStore } from "@/lib/store";
import { registerServiceWorker, VERSION } from "@/lib/version";
import { watchForErrors } from "@/lib/report";
import { enablePush, pushSupported } from "@/lib/push";
import { cx } from "@/lib/util";

export function Shell({ children }: { children: React.ReactNode }) {
  const status = useStore((s) => s.status);
  const router = useRouter();
  const path = usePathname();

  // First run: before anything else, the setup steps. They open on this Mac, so no pairing.
  useEffect(() => {
    if (path === "/setup" || status === "unpaired" || status === "loading") return;
    let live = true;
    api.setupState().then((s) => { if (live && !s.done) router.replace("/setup"); }).catch(() => {});
    return () => { live = false; };
  }, [path, status, router]);
  useEffect(() => { watchForErrors(); }, []);
  // iOS quietly drops a stale push subscription. Re-registering on open keeps notifications alive.
  useEffect(() => {
    if (!pushSupported() || Notification.permission !== "granted") return;
    void enablePush().catch(() => {});
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); router.push("/search"); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  useEffect(() => {
    if ("__TAURI_INTERNALS__" in window) document.documentElement.classList.add("tauri");
    registerServiceWorker();
    // Setup runs before pairing, so there is no token to open the live socket with yet.
    if (path !== "/setup") startLive();
  }, []);

  if (path === "/setup") return <>{children}</>;
  if (status === "unpaired") return <PairScreen />;

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Suspense><Sidebar /></Suspense>
      <div className="flex-1 min-w-0 flex flex-col relative">
        {/* iOS draws its own translucent bar over whatever sits behind the status bar, which reads as
            fog on top of the screen. Keep that strip solid paper on every page. */}
        <div aria-hidden className="desk:hidden fixed inset-x-0 top-0 z-40 bg-paper" style={{ height: "calc(env(safe-area-inset-top) + 1px)" }} />
        <UpdateBar />
        <OfflineBar />
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
        <Suspense><TabBar /></Suspense>
      </div>
    </div>
  );
}

function OfflineBar() {
  const status = useStore((s) => s.status);
  const connected = useStore((s) => s.connected);
  if (status === "loading" || connected) return null;
  return (
    <div className="shrink-0 mx-3.5 mt-2 desk:mt-3 h-9 rounded-xl bg-paper-2 text-mute text-[13px] flex items-center gap-2 px-3 safe-top desk:pt-0">
      <span className="w-2 h-2 rounded-full bg-mute-2" />This Mac is not reachable. Showing what was saved.
    </div>
  );
}

// ---------- phone tab bar ----------
const TABS: { name: string; href: string; icon: IconName; match: (p: string) => boolean }[] = [
  { name: "Home", href: "/", icon: "home", match: (p) => p === "/" || p.startsWith("/search") },
  { name: "Chats", href: "/chats", icon: "chat", match: (p) => p.startsWith("/chats") || p.startsWith("/c") || p.startsWith("/talk") },
  { name: "Crons", href: "/crons", icon: "clock", match: (p) => p.startsWith("/crons") },
  { name: "Settings", href: "/settings", icon: "gear", match: (p) => p.startsWith("/settings") },
];

function TabBar() {
  const path = usePathname();
  const nudges = useStore((s) => s.home?.nudges.length ?? 0);
  const unreadRuns = useStore((s) => s.runs.some((r) => !r.read && !r.quiet));
  const runs = useStore((s) => s.runs.length);
  // A new person starts with Home, Chats and Settings. Crons appears once a job posts a run.
  const tabs = runs ? TABS : TABS.filter((t) => t.name !== "Crons");
  // Full screen pages hide the tab bar.
  // A channel is /c (with ?id=...). Crons, chats and settings keep the bar; only a channel,
  // a run, Talk or a sub page take the whole screen.
  if (path === "/c" || path.startsWith("/crons/run") || path.startsWith("/talk") || path.startsWith("/settings/") || path.startsWith("/search")) return null;
  return (
    <nav className={cx("desk:hidden shrink-0 grid px-2 pt-1.5 bg-white border-t border-line safe-bottom", runs ? "grid-cols-4" : "grid-cols-3")}>
      {tabs.map((t) => {
        const on = t.match(path);
        return (
          <Link key={t.name} href={t.href} className={cx("relative h-12 flex flex-col items-center justify-center gap-[3px] text-[11px] font-medium", on ? "text-ink" : "text-mute-2")}>
            <Icon name={t.icon} size={23} stroke={1.7} />
            {t.name === "Home" && nudges > 0 && <span className="cnt absolute top-0.5 left-[calc(50%+6px)]">{nudges}</span>}
            {t.name === "Crons" && unreadRuns && <span className="udot absolute top-1.5 left-[calc(50%+8px)]" />}
            <span>{t.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// ---------- desktop sidebar ----------
function Sidebar() {
  const path = usePathname();
  const params = useSearchParams();
  const channels = useStore((s) => s.channels);
  const nudges = useStore((s) => s.home?.nudges.length ?? 0);
  const unreadRuns = useStore((s) => s.runs.some((r) => !r.read && !r.quiet));
  const connected = useStore((s) => s.connected);
  const current = path === "/c" ? params.get("id") : null;

  const item = (href: string, on: boolean, icon: React.ReactNode, label: string, right?: React.ReactNode) => (
    <Link key={href} href={href} className={cx("flex items-center gap-[9px] h-8 px-2.5 rounded-lg text-[14px] whitespace-nowrap", on ? "bg-[#eae8e2] text-ink font-semibold" : "text-ink-2 hover:bg-paper-3/60")}>
      {icon}<span className="flex-1 one">{label}</span>{right}
    </Link>
  );
  const group = (label: string, list: typeof channels, plus?: boolean) => (
    <>
      <div className="flex items-center justify-between text-xs font-semibold text-[#8a8880] px-2.5 pt-3.5 pb-1">
        {label}{plus && <Link href="/chats?new=project" aria-label="New project"><Icon name="plus" size={14} /></Link>}
      </div>
      {list.map((c) => item(`/c?id=${c.id}`, current === c.id, <ChannelIcon channel={c} size={18} />, c.name,
        c.unread ? <span className="cnt">{c.unread}</span> : c.live ? <span className="live" /> : undefined))}
    </>
  );

  return (
    <aside className="hidden desk:flex w-64 shrink-0 bg-paper-2 border-r border-line-2 flex-col px-2.5 pt-3 pb-3">
      <div className="flex items-center gap-1.5 px-1.5 pb-3" style={{ WebkitAppRegion: "drag" } as React.CSSProperties}>
        <span className="flex-1 h text-[15px] font-semibold pl-1 [.tauri_&]:pl-[62px]">Kotatsu</span>
        <Link href="/chats?new=1" className="text-mute" aria-label="New chat" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}><Icon name="pen" size={16} /></Link>
      </div>
      <Link href="/search" className="field !h-8 !bg-paper-3 !text-[13px] mx-0.5 mb-2"><Icon name="search" size={14} />Search<span className="flex-1" /><span className="text-[11.5px]">⌘K</span></Link>
      {item("/", path === "/", <span className="text-mute flex"><Icon name="home" size={17} /></span>, "Home", nudges ? <span className="cnt">{nudges}</span> : undefined)}
      {item("/crons", path.startsWith("/crons"), <span className="text-mute flex"><Icon name="clock" size={17} /></span>, "Crons", unreadRuns ? <span className="udot" /> : undefined)}
      <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
        {group("Projects", channels.filter((c) => c.kind === "project"), true)}
        {group("Direct", channels.filter((c) => c.kind === "direct"))}
        {channels.some((c) => c.kind === "oneoff") && group("One off", channels.filter((c) => c.kind === "oneoff").slice(0, 8))}
      </div>
      {item("/settings", path.startsWith("/settings"), <span className="text-mute flex"><Icon name="gear" size={17} /></span>, "Settings")}
      <div className="flex items-center gap-[7px] px-2.5 pt-2 text-xs text-mute">
        <span className={connected ? "live" : "w-2 h-2 rounded-full bg-mute-2"} />{connected ? "This Mac online" : "This Mac offline"}<span className="flex-1" />{VERSION}
      </div>
    </aside>
  );
}

export { AgentFace };
