# Setup prompt for anyone

Paste this into Claude Code or Codex in Terminal on the Mac that will run Kotatsu. It will not work in the ChatGPT or Claude chat apps, because the agent needs to run commands on this Mac.

Don't have either yet?

Claude Code: run "npm install -g @anthropic-ai/claude-code" then "claude"
Codex: run "npm install -g @openai/codex" then "codex"

Sign in with your Claude or ChatGPT account.

Paste everything below this line:

---

You are setting up Kotatsu for me. It is an open source app (github.com/MisotheCod/kotatsu) that puts my AI agents in one place, like a private Slack, with a Home screen that nudges me when something needs me. It runs on this Mac and I use it from my phone and my computer.

Do the steps in order. Explain each step in one plain sentence before you do it. Ask me before anything that needs my password, and before installing anything. If a step fails, fix it and keep going. Stop and hand it to me only when I have to do something myself, and tell me exactly what to click.

1. Check this Mac. Say which macOS it is and whether it is a Mac that can stay on, like a Mac Mini or iMac, or a laptop. If it is a laptop, warn me that Kotatsu only works while it is awake.

2. Check what I have: Homebrew, Node 22 or newer, Git, Tailscale, and which agents are signed in (Claude Code, Codex, Hermes). Tell me what is missing. Ask before installing it.

3. Install Kotatsu:
   curl -fsSL https://raw.githubusercontent.com/MisotheCod/kotatsu/main/install.sh | bash
   Then run kotatsu doctor and fix anything it reports.

4. Keep this Mac awake and running. Ask first, then turn off sleep, turn on wake for network, and turn on restart after a power failure. Check it with kotatsu doctor.

5. Tailscale lets my phone reach this Mac from anywhere. It is private, nothing is open to the internet, and it is free for personal use.
   If it is not installed, install it. Then open it and tell me to sign in. Wait for me.
   Also tell me to install Tailscale on my phone and sign in with the same account. Wait for me to say done.
   Then run: tailscale serve --bg 8787
   Show me the address it gives me.

6. Open http://localhost:8787/setup and tell me to go through it. It asks my name, finds my agents, lets me pick faces, my projects, and how often I want to hear from them. Then it shows a QR code for my phone.
   On my phone: scan the QR code, then in Safari tap Share, then Add to Home Screen. Open Kotatsu from the Home Screen, enter the code it shows, then go to Settings and turn on Notifications.

7. Connections. Ask me which of these I use: Gmail or other email, Google Calendar, Stripe, website analytics, GitHub. For each one I say yes to, explain in one line what it lets Kotatsu do for me, then set it up in your own config (MCP or connectors) so you can use it. Kotatsu never stores these keys.

8. Run kotatsu doctor one last time and send me a short summary:
   - What was installed
   - My Kotatsu address
   - How to update (kotatsu update)
   - How to check on it (kotatsu status)
   - Three things to try first:
     1. In a project, type @ and pick an agent
     2. Ask an agent to find an email, then tap Watch for more
     3. Tap the wave button to talk to an agent
