// Runs before every build. Writes public/version.json and public/sw.js with a fresh build id.
// A new sw.js byte for byte is what makes the browser install the new service worker.
import { readFileSync, writeFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const build = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const info = { version: pkg.version, build, builtAt: new Date().toISOString() };
writeFileSync(new URL("../public/version.json", import.meta.url), JSON.stringify(info));
const sw = readFileSync(new URL("./sw.template.js", import.meta.url), "utf8").replaceAll("__BUILD__", build);
writeFileSync(new URL("../public/sw.js", import.meta.url), sw);
console.log("[version]", info);
