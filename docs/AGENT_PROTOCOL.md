# Agent protocol

Any program that can read and write HTTP can be a Kotatsu agent. This is the whole protocol. It is small enough to wrap an existing agent in an afternoon.

## How it is used

You add an agent in Settings, then Connect by address, and type its URL. Kotatsu posts every message in a chat to that URL and reads the answer back as a stream.

## The request

Kotatsu sends one POST per turn:

```http
POST /your/endpoint
Content-Type: application/json
Accept: text/event-stream
Authorization: Bearer <optional token you set on the agent>

{
  "sessionId": "abc123",          // null on the first message in this chat
  "channelId": "website",         // which chat this is
  "text": "why did signups drop?",
  "context": "who is in this chat, how to post nudges", // send it only on the first turn
  "model": "whatever you asked for",
  "cwd": "/Users/you/Projects/website"
}
```

## The response

Answer with `text/event-stream`. One event per block, `event:` then `data:`, then a blank line.

```
event: session
data: {"sessionId":"abc123"}

event: status
data: {"text":"Reading the analytics"}

event: delta
data: {"text":"Signups fell after Tues"}

event: delta
data: {"text":"day's release."}

event: done
data: {"text":"Signups fell after Tuesday's release.","sessionId":"abc123"}
```

| Event | Meaning |
| --- | --- |
| `session` | The id to send back next turn, so the agent keeps its own memory |
| `delta` | Text so far. Send as often as you like. It replaces the message being drawn |
| `status` | One short line for the running list, like "Running tests" |
| `approval` | The agent wants to do something that needs a yes |
| `done` | The final text. Kotatsu stops listening after this |
| `error` | `{"message":"..."}`. Shown to the person |

`delta` is the whole text so far, not a chunk. Never send both `delta` and a different `done`.

## Approvals

```
event: approval
data: {"id":"ap_1","title":"Deploy the pricing page?","command":"vercel deploy --prod","tool":"bash","replyUrl":"http://127.0.0.1:9000/approvals"}
```

Kotatsu shows a card with Approve and No. The answer comes back as:

```http
POST <replyUrl>
Content-Type: application/json

{"approvalId":"ap_1","verdict":"approve"}
```

`verdict` is `approve` or `reject`. If you do not send a `replyUrl`, Kotatsu posts to your agent's own URL.

Approvals are the promise that writing files, running commands or sending messages asks first. If your agent can do those things, send the event.

## Posting things back

An agent on this Mac can also post with the agent token, from `127.0.0.1` only:

| What | Call |
| --- | --- |
| A nudge | `POST /agent/nudges {title, body, why, channelId?, actions?}` |
| A watch | `POST /agent/watches {title, query, cadence}` |
| A metric | `POST /agent/metrics {channelId, key, label, unit, points}` |
| The morning brief | `POST /agent/brief {text, stats?}` |
| A cron run | `POST /api/crons/runs {job, name?, title, body, ok?, channelId?}` |

The token is on this Mac only: `kotatsu token`.

## A working stub

```js
import { createServer } from "node:http";

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { text, sessionId } = JSON.parse(body || "{}");
    res.writeHead(200, { "content-type": "text/event-stream" });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("session", { sessionId: sessionId ?? "demo" });
    send("delta", { text: `You said: ${text}` });
    send("done", { text: `You said: ${text}` });
    res.end();
  });
}).listen(9000);
```

Save that as `agent.mjs`, run `node agent.mjs`, then add `http://127.0.0.1:9000` as an agent.
