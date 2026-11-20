import type { Channel, Metric } from "@kotatsu/shared";
import { api } from "./api";

export function ago(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `${Math.floor(s / 3600)}h`;
  if (s < 6 * 86400) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" AM", "").replace(" PM", "");
}

export function dayLabel(iso: string) {
  const d = new Date(iso), t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function longDate() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export function formatMetric(m: Metric, v: number) {
  if (m.unit === "usd") return `$${Math.round(v).toLocaleString("en-US")}`;
  if (m.unit === "pct") return `${Math.round(v)}%`;
  return Math.round(v).toLocaleString("en-US");
}

/** Total for money and counts, last value for percentages. Change compares the newer half with the older half. */
export function metricSummary(m: Metric) {
  const vals = m.points.map((p) => p.v);
  if (!vals.length) return { value: "", delta: "", good: true };
  if (m.unit === "pct") {
    const last = vals[vals.length - 1], first = vals[0];
    const d = last - first;
    return { value: formatMetric(m, last), delta: `${d >= 0 ? "+" : ""}${Math.round(d)} pts`, good: (d >= 0) === (m.goodWhen === "up") };
  }
  const total = vals.reduce((a, b) => a + b, 0);
  const half = Math.floor(vals.length / 2);
  const a = vals.slice(0, half).reduce((x, y) => x + y, 0), b = vals.slice(half).reduce((x, y) => x + y, 0);
  const pct = a ? Math.round(((b - a) / a) * 100) : 0;
  return { value: formatMetric(m, total), delta: `${pct >= 0 ? "+" : ""}${pct}%`, good: (pct >= 0) === (m.goodWhen === "up") };
}

export async function openDirect(agentId: string): Promise<Channel> {
  return api.direct(agentId);
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

import { useEffect, useState } from "react";
/** False during the static build and the first paint, true after. Use it for anything based on the clock. */
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
