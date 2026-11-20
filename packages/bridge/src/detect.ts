// What is on this Mac right now. Every row says ready, or the one thing standing in the way.
// Setup and Settings > Add an agent both read this, so nobody is told "agent offline" without a reason.

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export type Found = {
  runtime: "hermes" | "claude" | "codex";
  label: string;
  /** Ready to use, or the sentence saying what is missing. */
  ready: boolean;
  hint?: string;
  /** For Hermes: which profiles exist. */
  profiles?: string[];
};

function which(bin: string) {
  try {
    return execFileSync("/usr/bin/which", [bin], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function run(file: string, argv: string[]) {
  try {
    return execFileSync(file, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

/** Hermes keeps one folder per profile. A profile with a config is a profile an agent can use. */
function hermesProfiles(): string[] {
  const home = join(homedir(), ".hermes");
  const out: string[] = [];
  if (existsSync(join(home, "config.yaml"))) out.push("default");
  const profiles = join(home, "profiles");
  if (existsSync(profiles)) {
    for (const name of readdirSync(profiles)) {
      if (existsSync(join(profiles, name, "config.yaml"))) out.push(name);
    }
  }
  return out;
}

export function detectAgents(): Found[] {
  const found: Found[] = [];

  const profiles = hermesProfiles();
  const hermesBin = which("hermes");
  found.push({
    runtime: "hermes",
    label: profiles.length > 1 ? `Hermes (${profiles.join(", ")})` : "Hermes",
    ready: profiles.length > 0 && Boolean(hermesBin),
    hint: !hermesBin
      ? "Install Hermes first, then run hermes once to sign in"
      : profiles.length === 0
        ? "Run hermes once so it makes a profile"
        : undefined,
    profiles,
  });

  const claudeBin = which("claude");
  const claudeAuth = claudeBin ? run("claude", ["-p", "say ok"]) : "";
  found.push({
    runtime: "claude",
    label: "Claude Code",
    ready: Boolean(claudeBin) && Boolean(claudeAuth),
    hint: !claudeBin
      ? "npm install -g @anthropic-ai/claude-code, then run claude once to sign in"
      : !claudeAuth
        ? "Run claude once in Terminal to sign in"
        : undefined,
  });

  const codexBin = which("codex");
  const codexAuth = codexBin ? run("codex", ["login", "status"]) : "";
  found.push({
    runtime: "codex",
    label: "Codex",
    ready: Boolean(codexBin) && Boolean(codexAuth),
    hint: !codexBin
      ? "npm install -g @openai/codex, then run codex once to sign in"
      : !codexAuth
        ? "Run codex once in Terminal and sign in with your ChatGPT account"
        : undefined,
  });

  return found;
}
