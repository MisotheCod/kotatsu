"use client";
// iOS shrinks the visual viewport when the keyboard opens, but a `fixed inset-0` element keeps the
// layout viewport, so anything pinned to the bottom ends up under the keyboard. This reports the real
// visible box so a sheet can sit on top of the keyboard instead of behind it.
import { useEffect, useState } from "react";

export function useVisualViewport() {
  const [box, setBox] = useState<{ height: number; top: number } | null>(null);

  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const on = () => setBox({ height: v.height, top: v.offsetTop });
    on();
    v.addEventListener("resize", on);
    v.addEventListener("scroll", on);
    return () => {
      v.removeEventListener("resize", on);
      v.removeEventListener("scroll", on);
    };
  }, []);

  return box;
}
