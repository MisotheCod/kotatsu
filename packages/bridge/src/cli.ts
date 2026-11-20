// kotatsu <command>
//   serve      start the bridge (what launchd runs)
//   status     bridge, agents, devices
//   pair       print a one use 6 digit code for a new phone or computer (5 minutes)
//   update     pull, build, restart
//   doctor     check this Mac and print the exact fix for anything wrong
//   logs       show the last lines of the live log
//   uninstall  stop and remove the app, keeping your data unless --purge
//   import     bring data over from an older folder
//   token      print the agent token (loopback only)
//   vapid      make Web Push keys once, saved to config.json

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const cmd = process.argv[2] ?? "help";
const args = process.argv.slice(3);
const APP = process.env.KOTATSU_HOME ?? join(homedir(), ".kotatsu", "app");
const LABEL = "app.kotatsu.bridge";
const PLIST = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const LOG = "/tmp/kotatsu.log";

/** Runs a command and returns its output, or "" when it fails. Never throws. */
function tryRun(file: string, argv: string[]) {
  try { return execFileSync(file, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
}

const say = (s = "") => console.log(s);
const uid = process.getuid?.() ?? 501;

async function ask(prompt: string): Promise<string> {
  process.stdout.write(prompt);
  return new Promise((resolve) => { process.stdin.once("data", (d) => resolve(String(d))); });
}

switch (cmd) {
  case "serve":
    await import("./index");
    break;

  case "pair": {
    const { auth } = await import("./auth");
    const { config } = await import("./config");
    const code = auth.newPairCode();
    say(`\n  Pairing code: ${code.slice(0, 3)} ${code.slice(3)}\n  Valid for 5 minutes, one use.\n  Open the app on the device and enter it. Port ${config.port}.\n`);
    break;
  }

  case "status": {
    const { config } = await import("./config");
    const out = tryRun("curl", ["-s", `http://127.0.0.1:${config.port}/api/host`]);
    say(`bridge: ${out ? "running" : "not running"}`);
    if (out) {
      try {
        const h = JSON.parse(out);
        say(`address: http://127.0.0.1:${config.port}`);
        say(`agents: ${(h.agents ?? []).join(", ") || "none yet"}`);
      } catch { /* older response */ }
    }
    const tail = tryRun("tailscale", ["serve", "status"]);
    if (tail) say(`tailnet:\n${tail}`);
    break;
  }

  case "logs": {
    if (!existsSync(LOG)) { say(`no log yet at ${LOG}`); break; }
    const n = Number(args[0] ?? 40);
    say(readFileSync(LOG, "utf8").split("\n").slice(-n).join("\n"));
    break;
  }

  case "update": {
    say("Pulling the latest, building, then restarting.");
    tryRun("git", ["-C", APP, "pull", "--ff-only"]);
    tryRun("npm", ["--prefix", APP, "ci"]);
    tryRun("npm", ["--prefix", APP, "run", "build"]);
    tryRun("launchctl", ["kickstart", "-k", `gui/${uid}/${LABEL}`]);
    say("Done. The app may show Update ready for a moment.");
    break;
  }

  case "doctor": {
    const { config } = await import("./config");
    const rows: [boolean, string, string][] = [];

    const major = Number(process.versions.node.split(".")[0]);
    rows.push([major >= 22, `Node ${process.versions.node}`, "brew install node@22"]);

    const host = tryRun("curl", ["-s", `http://127.0.0.1:${config.port}/api/host`]);
    rows.push([Boolean(host), "Bridge is answering", `launchctl kickstart -k gui/${uid}/${LABEL}`]);

    rows.push([Boolean(tryRun("tailscale", ["status"])), "Tailscale is running", "Open Tailscale and sign in"]);

    rows.push([Boolean(config.vapid.privateKey), "Push keys exist", "kotatsu vapid, then restart the bridge"]);

    const sleepLine = tryRun("pmset", ["-g"]).split("\n").find((l) => l.trim().startsWith("sleep")) ?? "";
    const canSleep = /sleep\s+([1-9])/.test(sleepLine);
    rows.push([!canSleep, "This Mac does not sleep", "sudo pmset -a sleep 0 displaysleep 10 womp 1 autorestart 1"]);

    const agentsJson = tryRun("curl", ["-s", `http://127.0.0.1:${config.port}/api/agents`]);
    let online = 0;
    try { online = (JSON.parse(agentsJson) as any[]).filter((a) => a.online).length; } catch { /* no agents */ }
    rows.push([online > 0, `${online} agent online`, "Settings, Add an agent"]);

    say("");
    for (const [ok, what, fix] of rows) say(`${ok ? "ok   " : "fix  "} ${what}${ok ? "" : `\n       ${fix}`}`);
    say("");
    break;
  }

  case "uninstall": {
    const purge = args.includes("--purge");
    say(purge ? "This removes Kotatsu and deletes your data." : "This removes Kotatsu and keeps your data.");
    const answer = await ask("Type yes to continue: ");
    if (answer.trim().toLowerCase() !== "yes") { say("Nothing changed."); break; }
    tryRun("launchctl", ["bootout", `gui/${uid}`, PLIST]);
    if (existsSync(PLIST)) rmSync(PLIST);
    if (existsSync(APP)) rmSync(APP, { recursive: true, force: true });
    if (purge) {
      const data = join(homedir(), "Library", "Application Support", "Kotatsu");
      if (existsSync(data)) rmSync(data, { recursive: true, force: true });
    }
    say("Removed.");
    break;
  }

  case "import": {
    const from = args[args.indexOf("--from") + 1] ?? args[0];
    if (!from || from.startsWith("--")) { say("kotatsu import --from <old data folder>"); break; }
    const { config } = await import("./config");
    const src = join(from, "agent-app.db");
    if (!existsSync(src)) { say(`No agent-app.db in ${from}`); break; }
    say("Stop the old app first so its database is not being written.");
    const answer = await ask("Type yes to copy it now: ");
    if (answer.trim().toLowerCase() !== "yes") { say("Nothing changed."); break; }
    copyFileSync(src, config.dbPath);
    const uploads = join(from, "uploads");
    if (existsSync(uploads)) tryRun("cp", ["-R", uploads, config.uploadsDir]);
    say("Imported. Restart with: kotatsu update");
    break;
  }

  case "token": {
    const { auth } = await import("./auth");
    say(auth.agentToken());
    break;
  }

  case "vapid": {
    const webpush = (await import("web-push")).default;
    const { saveConfig } = await import("./config");
    const k = webpush.generateVAPIDKeys();
    saveConfig({ vapidPublicKey: k.publicKey, vapidPrivateKey: k.privateKey });
    say("Push keys made and saved to config.json. Restart the bridge to use them.");
    break;
  }

  default:
    say("kotatsu serve | status | pair | update | doctor | logs | uninstall | import | token | vapid");
}
