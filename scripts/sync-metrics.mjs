#!/usr/bin/env node
// Pulls real numbers into a project panel: one json per channel, posted to the app.
// Run it by hand, or from a cron: node scripts/sync-metrics.mjs <channelId> <points.json>
// Nothing here knows about any particular product.

import { readFileSync } from "node:fs";

const [channelId, file] = process.argv.slice(2);
if (!channelId || !file) {
  console.error("usage: node scripts/sync-metrics.mjs <channelId> <points.json>");
  process.exit(1);
}
const body = JSON.parse(readFileSync(file, "utf8"));
console.log("Post this to /agent/metrics with the agent token:", JSON.stringify({ channelId, ...body }, null, 2));
