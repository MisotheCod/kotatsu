# Kotatsu, spec

The screens and rules the code follows. If a doc disagrees with this, this wins.

## What it is

A private Slack for one person and their agents, on their own Mac. Four places:

| Place | What it does |
|---|---|
| **Home** | Today. A short brief, nudges with buttons, what the agents are watching. Desktop adds what is running now. |
| **Chats** | Projects are channels with every agent in them. Direct is one agent. One off chats sit at the bottom. |
| **Crons** | Scheduled runs posted by anything on the Mac. Hidden until something posts a run. |
| **Settings** | Your name, agents (face, name, voice, good at, instructions, projects), nudge limits, quiet hours, devices, connections, this Mac, version. |

Phone: a tab bar with those, three until a cron has run. Desktop (900px and wider): a Slack style sidebar with Home, Crons, Projects, Direct, One off, Settings.
One layout component (`components/Shell.tsx`) does both. Screens never set their own outer width.

## Cut. Do not build these

Face ID lock. The Needs you tray and page. The faces row on Home. A Projects tab. Separate job and run pages for agents.
Widget dashboard, widget editing and widget suggestions. Everyone, Repeat this, Teach a skill. Memory, rules and skills
pages (one row in Settings that says they live in Hermes). Telegram or iMessage access.

## Channels and agents

- A project channel has every agent. You talk to all of them in one thread.
- `@Name` picks who answers. `@all` asks everyone. With no @, the chat's own default answers, then the agent set to answer first.
- Who answers first is a setting, chosen at setup and changeable per chat.
- An agent can `@mention` another agent in its reply to hand work over. The bridge sends it on. At most 3 hops, then it stops.
- Each agent keeps its own session per channel in its own runtime (`sessions` table). The bridge keeps the shared timeline.
- New agents later: write one adapter (`packages/bridge/src/adapters/types.ts`), add a profile. Nothing else changes.

## The proactive part

- **Nudge**: a card on Home and a push notification. Says what happened, why you are seeing it, and gives 1 to 3 buttons.
  Buttons can send a message to a channel, open a page, approve or reject, or start a watch. Notification buttons work
  without opening the app.
- **Watch**: after an agent finds something useful, it offers "Watch for more of this?" (a `watchOffer` card).
  Yes creates a watch. New matches become nudges with `watchId`.
- **Scheduled check**: every `sweepMinutes` (60) outside quiet hours, the default agent gets the list of watches in a
  hidden session and posts nudges for anything new. It may post one idea.
- **Morning brief** at `briefAt` (8:00): one or two sentences and up to 2 stats, top of Home.
- **Limits**: at most `maxNudgesPerDay` (6). Approvals do not count. Quiet hours save nudges but send no push, except approvals.
  The same `dedupeKey` twice in a day is ignored.
- **Approvals**: a write action from any agent becomes an approval card in the channel and an urgent nudge. 30 minutes,
  then it times out as rejected. Deciding on one device updates every device.

## Project panel

Opens from the project name (phone sheet) or the Panel button (desktop column, open by default).
Metrics first (the first one posted is shown big), then the project's crons, then links. Agents or crons post the numbers
(`POST /agent/metrics`). Money and counts show the total for the range; percentages show the latest value.
Green when moving the good way, red when not.

## Crons

Anything on a schedule posts runs to the bridge with the fields below.
A run whose body matches the last run is quiet. A failed run (`ok: false`) also makes a nudge with Fix it and See run.
Runs with `channelId` show in that project's panel. Read state and favorites live in the app only.

## Talk

The wave button in any channel. You speak, the agent answers out loud, then it listens again. Switch agents without
hanging up. Everything is saved to the channel as text.
Today: browser speech (SpeechRecognition, speechSynthesis). Next: stream audio to the bridge (`/api/talk`) and use
ElevenLabs there so each agent has its own voice from Settings. The screen does not change.

## Updates and staleness

- The bridge serves the app. HTML, `sw.js` and `version.json` are `no-store`. `/_next/static` is cached forever.
- Every build writes a new build id into `version.json` and `sw.js`. Open apps check every minute and on focus,
  then show **Update ready**. Tapping it activates the new worker and reloads.
- Settings shows version and build id. If the phone ever looks old, compare that id with `apps/web/public/version.json`.

## Look

Warm paper `#f7f6f3`, white cards, near black `#141413`, clay `#c96442` for unread and attention, green `#2f7d4f` for good
and live, red `#b42318` for failed. No blue, no purple. Inter for text, Lexend for titles. Agent faces never have a
background. Single line labels; cut with an ellipsis instead of wrapping. Tokens live in `apps/web/app/globals.css`.
