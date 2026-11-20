// A one line report to the Mac when something breaks on the phone. Voice only fails on a real
// device, so this is the only way to see what the phone actually hit.
import { BRIDGE } from "./api";

export function report(kind: string, detail: unknown) {
  try {
    const body = { kind, detail: detail instanceof Error ? `${detail.name}: ${detail.message}` : typeof detail === "object" ? JSON.stringify(detail).slice(0, 800) : String(detail).slice(0, 800) };
    void fetch(`${BRIDGE}/api/clientlog`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* reporting must never throw */
  }
}

let installed = false;
/** Catch anything that escapes a component, once per session. */
export function watchForErrors() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => report("window.error", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e: any) => report("unhandledrejection", e.reason ?? "unknown"));
}
