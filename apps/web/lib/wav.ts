// A plain WAV recorder that does not use MediaRecorder at all. Safari's MediaRecorder is the one piece
// that behaves differently from Chrome, so when it produces nothing we fall back to reading the raw
// samples out of Web Audio and writing a WAV header ourselves. Slower to make, but it always works.
export class WavRecorder {
  private ctx: AudioContext;
  private node: ScriptProcessorNode;
  private src: MediaStreamAudioSourceNode;
  private chunks: Float32Array[] = [];
  private stopped = false;

  constructor(stream: MediaStream, private onLevel?: (n: number) => void) {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    this.src = this.ctx.createMediaStreamSource(stream);
    this.node = this.ctx.createScriptProcessor(4096, 1, 1);
    this.node.onaudioprocess = (e) => {
      if (this.stopped) return;
      const data = new Float32Array(e.inputBuffer.getChannelData(0));
      this.chunks.push(data);
      if (this.onLevel) {
        let peak = 0;
        for (let i = 0; i < data.length; i += 32) peak = Math.max(peak, Math.abs(data[i]));
        this.onLevel(peak);  // 0..1, the page decides what counts as speech
      }
    };
    this.src.connect(this.node);
    this.node.connect(this.ctx.destination);
  }

  /** Stops and returns a 16 bit mono WAV. */
  async stop(): Promise<Blob> {
    this.stopped = true;
    this.node.onaudioprocess = null;
    try { this.src.disconnect(); this.node.disconnect(); } catch {}
    const rate = this.ctx.sampleRate;
    await this.ctx.close().catch(() => {});
    return wav(this.chunks, rate);
  }
}

/** 48k down to 16k: a third of the upload, and that is what Whisper reads anyway. */
function resample(input: Float32Array, from: number, to = 16000): Float32Array {
  if (from === to) return input;
  const out = new Float32Array(Math.round((input.length * to) / from));
  const step = from / to;
  for (let i = 0; i < out.length; i++) {
    const at = i * step;
    const i0 = Math.floor(at);
    const i1 = Math.min(i0 + 1, input.length - 1);
    out[i] = input[i0] + (input[i1] - input[i0]) * (at - i0);
  }
  return out;
}

/** Drops the silence before the first word and after the last, keeping a little air. */
function trim(input: Float32Array, rate: number, threshold = 0.008, pad = 0.15): Float32Array {
  let start = 0;
  let end = input.length;
  while (start < end && Math.abs(input[start]) < threshold) start++;
  while (end > start && Math.abs(input[end - 1]) < threshold) end--;
  if (end - start < rate * 0.2) return input;
  const padSamples = Math.round(pad * rate);
  start = Math.max(0, start - padSamples);
  end = Math.min(input.length, end + padSamples);
  return input.slice(start, end);
}

function wav(chunks: Float32Array[], sampleRate: number): Blob {
  // Join, resample to 16k, cut the dead air, then write a plain 16 bit header.
  const joinedLen = chunks.reduce((n, c) => n + c.length, 0);
  let joined = new Float32Array(joinedLen) as Float32Array;
  let at = 0;
  for (const c of chunks) { joined.set(c, at); at += c.length; }
  joined = resample(joined, sampleRate);
  joined = trim(joined, 16000);
  sampleRate = 16000;
  const total = joined.length;
  const buffer = new ArrayBuffer(44 + total * 2);
  const view = new DataView(buffer);
  const str = (at: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i)); };
  str(0, "RIFF");
  view.setUint32(4, 36 + total * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);        // PCM
  view.setUint16(22, 1, true);        // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, total * 2, true);

  let offset = 44;
  for (let i = 0; i < joined.length; i++) {
    const v = Math.max(-1, Math.min(1, joined[i]));
    view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}
