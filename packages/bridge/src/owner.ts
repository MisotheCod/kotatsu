// The person using this app. Their name is a setting, not a constant.
// Read from the database first so a change shows up without a restart, then from config.json.

import { existsSync, readFileSync } from "node:fs";
import { config } from "./config";
import { kv } from "./db";

export function ownerName(): string {
  const inDb = kv.get<string>("ownerName", "");
  if (inDb) return inDb;
  try {
    if (existsSync(config.configFile)) {
      const saved = JSON.parse(readFileSync(config.configFile, "utf8"));
      if (saved.ownerName) return String(saved.ownerName);
    }
  } catch { /* fine */ }
  return "";
}

export function setOwnerName(name: string) {
  kv.set("ownerName", name.trim());
}
