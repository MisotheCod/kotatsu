"use client";
import { useEffect, useState } from "react";

/**
 * True when there is room for a list and a reader side by side. The phone gets one column;
 * an iPad in portrait (744) is already wide enough for two.
 */
export function useWide(min = 700) {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${min}px)`);
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [min]);
  return wide;
}
