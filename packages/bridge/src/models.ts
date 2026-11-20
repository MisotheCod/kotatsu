// The models an agent can be switched to. The OpenRouter list is OpenRouter's own
// catalogue, pulled live and cached. The Claude SDK only accepts Claude's
// own ids, so that list comes from what the installed Claude Code knows about.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

export interface ModelChoice {
  id: string;
  label: string;
  provider?: string;
  context?: number;
  created?: number;
}

let orCache: { at: number; list: ModelChoice[] } = { at: 0, list: [] };

function apiKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  try {
    const env = readFileSync(`${homedir()}/.hermes/.env`, "utf8");
    return /^OPENROUTER_API_KEY=(.*)$/m.exec(env)?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Every text model OpenRouter offers, newest first. Free ids and batch variants are left out: they are noise here. */
export async function openrouterModels(): Promise<ModelChoice[]> {
  if (Date.now() - orCache.at < 6 * 60 * 60_000 && orCache.list.length) return orCache.list;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: apiKey() ? { authorization: `Bearer ${apiKey()}` } : {},
    });
    const body = (await res.json()) as { data?: any[] };
    const list = (body.data ?? [])
      .filter((m) => !/:batch|:extended|:online|:free/.test(m.id))
      .filter((m) => (m.architecture?.input_modalities ?? ["text"]).includes("text"))
      .map((m) => {
        const name: string = m.name ?? m.id;
        const [provider, ...rest] = String(name).split(": ");
        const clean = (rest.length ? rest.join(": ") : provider).replace(/\s*\((?:free|batch)\)$/i, "");
        return { id: m.id as string, label: clean, provider: rest.length ? provider : undefined, context: m.context_length, created: m.created };
      })
      .sort((a: ModelChoice, b: ModelChoice) => (b.created ?? 0) - (a.created ?? 0));
    orCache = { at: Date.now(), list };
    return list;
  } catch {
    return orCache.list.length ? orCache.list : [];
  }
}

/**
 * Claude's current line up, as the installed Claude Code spells it. There is no model list endpoint
 * without an Anthropic key on this Mac, so this is written by hand and checked against the CLI.
 */
export const claudeModels: ModelChoice[] = [
  { id: "claude-opus-5-5", label: "Opus 5.5", provider: "Claude" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", provider: "Claude" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5", provider: "Claude" },
];
