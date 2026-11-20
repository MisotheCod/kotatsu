# Security

## What runs where

Kotatsu is one Node process on your Mac, listening on `127.0.0.1`. Your data is one SQLite file in `~/Library/Application Support/Kotatsu`. The web app is a static build served by that same process.

There is no server of ours. There is no account. There is nothing to breach on our side, because there is no our side.

## How your phone gets in

Tailscale. It makes a private network between your devices. `tailscale serve` puts Kotatsu on that private address, and nothing is exposed to the internet. Requests that arrive forwarded through Tailscale are treated as remote and need a pairing code.

## Tokens

| Token | Where it works | How long |
| --- | --- | --- |
| Pairing code | Once, in the app | 5 minutes, then it dies |
| Device token | One phone or computer | Until you remove it in Settings, Devices |
| Agent token | `127.0.0.1` only | Until you clear it in config.json |

Device and pairing tokens are stored as SHA256 hashes, so the database never holds a usable token. Five wrong pairing attempts burn the code. Loopback bypass applies only to requests that come from the Mac itself, never to forwarded ones.

## Approvals

Every adapter asks before writing files, running commands or sending messages, unless you turn approvals off for that agent. Codex runs inside its own workspace sandbox.

## What leaves the Mac

Only what your agent sends, through its own account: Claude, OpenAI, or a provider you configured yourself. Kotatsu itself makes no outbound calls except to the agent addresses you typed.

## Keys you connect

Kotatsu stores no Gmail, Stripe, GitHub or analytics keys. Setup sends a message to your agent and the agent sets the connection up in its own config.

## Reporting a problem

Open an issue at https://github.com/MisotheCod/kotatsu/issues with what you did and what happened. If it is a vulnerability, say so in the title and leave out the details in the first message, so a fix can land before it is public.
