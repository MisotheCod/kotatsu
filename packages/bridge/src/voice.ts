// Voice, server side: ElevenLabs for both hearing and speaking, so the browser does not have to be
// trusted with speech recognition (it is unreliable in a home screen app on iOS).
//
// The key is read from the Hermes env file rather than the launchd plist, so rotating it does not
// mean reloading a service.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

let cached = "";

function apiKey(): string {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  if (cached) return cached;
  try {
    const line = readFileSync(join(homedir(), ".hermes/.env"), "utf8")
      .split("\n")
      .find((l) => l.startsWith("ELEVENLABS_API_KEY="));
    if (line) cached = line.slice("ELEVENLABS_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  } catch {
    /* no env file, voice stays off */
  }
  return cached;
}

/** A calm default when an agent has no voice of its own. */
const FALLBACK_VOICE = "SAz9YHcvj6GT2YYXdXww";

/**
 * A local voice service on this Mac: Whisper for hearing, Kokoro for speaking. Free per word, private,
 * and fast enough to talk with. ElevenLabs stays as the fallback, and as the choice when an agent is
 * set to it, so the quota is spent on purpose instead of on every sentence.
 */
const LOCAL = process.env.LOCAL_VOICE_URL ?? "http://127.0.0.1:8791";
let localOk = { at: 0, value: false };

async function localReady(): Promise<boolean> {
  if (Date.now() - localOk.at < 10_000) return localOk.value;
  try {
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), 800);
    const res = await fetch(`${LOCAL}/health`, { signal: c.signal });
    clearTimeout(timer);
    localOk = { at: Date.now(), value: res.ok };
  } catch {
    localOk = { at: Date.now(), value: false };
  }
  return localOk.value;
}

export const voice = {
  /** Local voice needs no key, so voice is available whenever either side is. */
  ready: () => true,
  cloudReady: () => apiKey().length > 10,

  /** Speech to text. Accepts whatever the browser recorded. */
  async transcribe(audio: ArrayBuffer, type: string): Promise<string> {
    if (await localReady()) {
      const res = await fetch(`${LOCAL}/stt`, {
        method: "POST",
        headers: { "content-type": type || "audio/webm" },
        body: audio,
      });
      if (res.ok) {
        const body = (await res.json()) as { text?: string };
        return (body.text ?? "").trim();
      }
      console.warn("[voice] local hearing failed, using ElevenLabs");
    }
    const form = new FormData();
    form.append("file", new Blob([audio], { type: type || "audio/webm" }), "speech.webm");
    form.append("model_id", "scribe_v1");
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey() },
      body: form,
    });
    if (!res.ok) throw new Error(`transcribe ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const body = (await res.json()) as { text?: string };
    return (body.text ?? "").trim();
  },

  /** Text to speech. Local when it is up, ElevenLabs otherwise. */
  async speak(text: string, voiceId?: string, localVoice?: string, mode?: string): Promise<ReadableStream<Uint8Array>> {
    if (mode !== "elevenlabs" && (await localReady())) {
      const res = await fetch(`${LOCAL}/speak`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 1200), voice: localVoice }),
      });
      if (res.ok) return res.body as ReadableStream<Uint8Array>;
      console.warn("[voice] local speak failed, using ElevenLabs");
    }
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || FALLBACK_VOICE}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey(), "content-type": "application/json" },
        body: JSON.stringify({
          text: text.slice(0, 1200),
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true },
        }),
      },
    );
    if (!res.ok) throw new Error(`speak ${res.status}: ${(await res.text()).slice(0, 160)}`);
    return res.body as ReadableStream<Uint8Array>;
  },
};
