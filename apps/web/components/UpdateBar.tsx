"use client";
// Sits at the top when a newer build is on the Mac. The grey label read as disabled, so it now says
// what is actually happening and clears itself as soon as it is safe.
import { useEffect } from "react";
import { Icon } from "./Icon";
import { useUpdate } from "@/lib/version";

export function UpdateBar() {
  const { ready, reload } = useUpdate();

  useEffect(() => {
    if (!ready) return;
    // Reload the moment he leaves the app, and on its own once nothing is focused and he has stopped
    // touching the screen. Never while typing.
    const busy = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const onHide = () => { if (document.visibilityState === "hidden" && !busy()) void reload(); };
    document.addEventListener("visibilitychange", onHide);
    const t = setTimeout(() => { if (!busy()) void reload(); }, 8000);
    return () => { document.removeEventListener("visibilitychange", onHide); clearTimeout(t); };
  }, [ready, reload]);

  if (!ready) return null;
  return (
    <button onClick={reload} className="appear shrink-0 mx-3.5 mt-2 desk:mt-3 h-10 rounded-xl bg-ink text-white flex items-center gap-2 px-3.5 text-[13.5px] font-semibold safe-top desk:pt-0">
      <Icon name="refresh" size={15} />Update ready
      <span className="flex-1" />
      <span className="text-white/70 font-medium">Reloading shortly</span>
    </button>
  );
}
