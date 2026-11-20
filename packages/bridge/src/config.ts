import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const rootPkg = JSON.parse(readFileSync(resolve(here, "../package.json"), "utf8"));

/** Everything the app needs to know lives in one json file, written by setup. */
export type Saved = {
  ownerName?: string;
  port?: number;
  bind?: string;
  hostName?: string;
  agentToken?: string;
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
  setupDone?: boolean;
  defaultAgentId?: string;
};

const DATA_DIR = process.env.DATA_DIR ?? join(homedir(), "Library", "Application Support", "Kotatsu");
mkdirSync(DATA_DIR, { recursive: true });
const CONFIG_FILE = join(DATA_DIR, "config.json");

function readSaved(): Saved {
  try {
    return existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, "utf8")) : {};
  } catch {
    return {};
  }
}

const saved = readSaved();

/** Writes config.json with only the user's own machine details. Never committed, never logged. */
export function saveConfig(patch: Saved) {
  const next = { ...readSaved(), ...patch };
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  try { chmodSync(CONFIG_FILE, 0o600); } catch { /* best effort */ }
  return next;
}

/** Read fresh from disk: setup writes it while the bridge is running. */
export function isSetupDone() {
  return Boolean(readSaved().setupDone);
}

export const config = {
  version: rootPkg.version as string,
  hostName: process.env.HOST_NAME ?? saved.hostName ?? "This Mac",
  port: Number(process.env.PORT ?? saved.port ?? 8787),
  bind: process.env.BIND ?? saved.bind ?? "127.0.0.1", // Tailscale Serve forwards to this
  dataDir: DATA_DIR,
  configFile: CONFIG_FILE,
  dbPath: join(DATA_DIR, "kotatsu.db"),
  uploadsDir: join(DATA_DIR, "uploads"),
  webDir: process.env.WEB_DIR ?? resolve(here, "../../../apps/web/out"), // static export of the web app
  auth: process.env.AUTH !== "off",                    // AUTH=off only for local dev
  seed: process.env.SEED === "1",                      // generic demo data, for screenshots and dev
  setupDone: Boolean(saved.setupDone),

  /** The agent token. Only the Mac itself may use it. */
  agentToken: process.env.AGENT_TOKEN ?? saved.agentToken ?? "",

  corsOrigin: process.env.CORS_ORIGIN ?? "",           // off in production

  hermes: {
    url: process.env.HERMES_URL ?? "http://127.0.0.1:9120",
    token: process.env.HERMES_TOKEN ?? "",             // read from Keychain by the launchd wrapper
  },

  // Web Push. Made once by install.sh with `kotatsu vapid`.
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? saved.vapidPublicKey ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? saved.vapidPrivateKey ?? "",
    subject: process.env.VAPID_SUBJECT ?? saved.vapidSubject ?? "mailto:kotatsu@localhost",
  },

  // Handoffs between agents stop after this many hops, then it comes back to you.
  maxHandoffDepth: 3,
};

export { DATA_DIR, CONFIG_FILE };
