// A tiny agent for testing the http adapter. It answers with what it was told.
import { createServer } from "node:http";

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const { text, sessionId } = JSON.parse(body || "{}");
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("session", { sessionId: sessionId ?? "test-session-1" });
    send("delta", { text: "Testy heard: " });
    send("delta", { text: `Testy heard: ${text}` });
    send("done", { text: `Testy heard: ${text}`, sessionId: "test-session-1" });
    res.end();
  });
}).listen(9100, "127.0.0.1", () => console.log("test agent on 9100"));
