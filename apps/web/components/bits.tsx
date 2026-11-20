"use client";
// Small shared pieces: agent faces, project logos, headers.

import Link from "next/link";
import type { Agent, Channel } from "@kotatsu/shared";
import { Icon } from "./Icon";
import { useAgent } from "@/lib/store";

/** An agent's face. No background, ever. */
export function Face({ agent, face, size = 28 }: { agent?: Pick<Agent, "face" | "name">; face?: string; size?: number }) {
  const f = face ?? agent?.face ?? "fox";
  return <img src={`/avatars/${f}.webp`} alt={agent?.name ?? ""} width={size} height={size} draggable={false}
    style={{ width: size, height: size, objectFit: "contain", flexShrink: 0, display: "block" }} />;
}

export function AgentFace({ id, size = 28 }: { id?: string; size?: number }) {
  const a = useAgent(id);
  return <Face agent={a} size={size} />;
}

/** Two or more faces overlapped, for channel headers. */
export function Faces({ ids, size = 16 }: { ids: string[]; size?: number }) {
  return (
    <span className="flex">
      {ids.map((id, i) => <span key={id} style={{ marginLeft: i ? -size * 0.3 : 0 }}><AgentFace id={id} size={size} /></span>)}
    </span>
  );
}

/** A project's logo, or its first letter on a colored tile. Direct chats show the agent's face. */
export function ChannelIcon({ channel, size = 32 }: { channel: Channel; size?: number }) {
  if (channel.kind === "direct") return <AgentFace id={channel.agentIds[0]} size={size} />;
  if (channel.kind === "oneoff") {
    return <span className="flex items-center justify-center text-mute-2" style={{ width: size, height: size }}><Icon name="chat" size={size * 0.55} /></span>;
  }
  if (channel.logo) return <img src={channel.logo} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: "contain", flexShrink: 0 }} />;
  return (
    <span className="flex items-center justify-center text-white shrink-0 h"
      style={{ width: size, height: size, borderRadius: size * 0.28, background: channel.color ?? "#6b6a66", fontSize: size * 0.46, fontWeight: 600 }}>
      {channel.name[0]?.toUpperCase()}
    </span>
  );
}

export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <header className="safe-top shrink-0 px-[18px] pt-3 pb-3 flex items-end gap-2.5 desk:hidden">
      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        {sub && <span className="text-mute text-[13px]">{sub}</span>}
        <span className="h text-[27px] font-semibold one">{title}</span>
      </div>
      {right}
    </header>
  );
}

/** Desktop header bar above the main column. */
export function DeskBar({ children }: { children: React.ReactNode }) {
  return <header className="hidden desk:flex h-[58px] shrink-0 items-center gap-2.5 px-[22px] border-b border-line bg-paper">{children}</header>;
}

export function Section({ label, right, className }: { label: string; right?: React.ReactNode; className?: string }) {
  return <div className={`flex items-center px-0.5 pt-2 ${className ?? ""}`}><span className="lbl flex-1">{label}</span>{right}</div>;
}

export function BackButton({ href }: { href: string }) {
  return <Link href={href} className="ib desk:hidden" aria-label="Back"><Icon name="left" size={22} /></Link>;
}

export function Empty({ icon, title, text }: { icon: Parameters<typeof Icon>[0]["name"]; title: string; text: string }) {
  return (
    <div className="card px-4 py-6 flex flex-col items-center gap-2 text-center">
      <span className="w-11 h-11 rounded-full bg-good-soft text-good flex items-center justify-center"><Icon name={icon} size={22} stroke={2.2} /></span>
      <span className="h text-lg font-semibold">{title}</span>
      <span className="text-mute text-[13.5px] leading-[19px] max-w-[320px]">{text}</span>
    </div>
  );
}

export function Sparkline({ values, good, width = 140, height = 30 }: { values: number[]; good: boolean; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const mx = Math.max(...values), mn = Math.min(...values), r = mx - mn || 1;
  const pts = values.map((v, i) => `${((i * width) / (values.length - 1)).toFixed(1)},${(height - 2 - ((v - mn) / r) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full block" style={{ height }}>
      <polyline points={pts} fill="none" stroke={good ? "#2f7d4f" : "#b42318"} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
