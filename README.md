# Kotatsu

Your AI agents in one place, on your own Mac. Like a private Slack for you and your agents, with a Home screen that tells you what needs you.

Kotatsu runs on a Mac that stays on. You reach it from your phone and your computer. It is free, it has no hosted parts, and it has no accounts. Nothing leaves the Mac except through your own agents, using their own logins.

## What you need

- A Mac that stays on: a Mac mini, an iMac, a Mac Studio. A laptop works while it is awake.
- One of: Claude Code, Codex, or Hermes. Signed in with your own account.
- Optional: Tailscale, free for personal use, so your phone can reach the Mac from anywhere.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/misocod/kotatsu/main/install.sh | bash
```

That checks the Mac, installs Node 22 if it is missing, puts Kotatsu in `~/.kotatsu/app`, starts it at login, and opens setup. Setup asks your name, finds your agents, and shows you a QR code for your phone.

Then, from any project folder:

```sh
kotatsu status    # is it running, and which agents are online
kotatsu doctor    # check everything on this Mac and print the exact fix
kotatsu update    # pull, build, restart
kotatsu pair      # a one use code for a new phone or computer
kotatsu logs
```

## Hand it to an agent

If you would rather have an agent do the setup, paste [docs/SETUP_PROMPT.md](docs/SETUP_PROMPT.md) into Claude Code or Codex in Terminal. It walks the whole thing end to end and asks before it installs anything.

## Any agent, not just ours

Kotatsu talks to agents through adapters:

| Adapter | What it uses |
| --- | --- |
| `claude` | Claude Agent SDK, your Claude account |
| `codex` | OpenAI Codex SDK, your ChatGPT account |
| `hermes` | A Hermes profile on this Mac |
| `http` | Anything that speaks the small protocol in [docs/AGENT_PROTOCOL.md](docs/AGENT_PROTOCOL.md) |

Add one in Settings, then Add an agent. It starts immediately, no restart. Writing files, running commands and sending messages asks you first.

## How it works

```
your phone ──┐
             ├─ Tailscale (private) ─→ bridge on 127.0.0.1:8787 ─→ your agent
your Mac  ───┘                          │
                                        └─ SQLite in ~/Library/Application Support/Kotatsu
```

The bridge is a small Node server. The app is a static site it serves. Your data is one SQLite file on your Mac. Back that folder up and you have everything.

## Settings live here

`~/Library/Application Support/Kotatsu/config.json`, readable only by you. Environment variables override it for development.

## FAQ

**Does anything leave my Mac?** Only what your agent itself sends, through its own account. Kotatsu stores no keys for Gmail, Stripe, GitHub or analytics. When you accept one of those connections, your agent sets it up in its own config.

**Can two people use it?** No. It is one person, on one Mac, by design.

**What if my Mac restarts?** Kotatsu starts again at login. `kotatsu doctor` tells you if sleep or power settings would get in the way.

**Is there an app to install?** No. In Safari, Share, then Add to Dock. It behaves like an app and updates itself. A Tauri wrapper is in `apps/desktop` for people who want a real window.

**Windows or Linux?** Not today. The bridge is portable but the install, the login item and the sleep checks are macOS.

## License

MIT.
