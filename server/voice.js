// Hearing the rider. Muse Spark Open (open weights) listens first; it's a general model, so it can
// answer "I can't transcribe audio" instead of the words. When it does, or hears nothing, Meta's
// Muse Voice Transcribe (a dedicated speech-to-text model) gets the same audio.
import { reserve } from "./spend.js";

const ASR = "https://api.meta.ai/v1/asr/transcribe";
export const voiceReady = () => Boolean(process.env.MODEL_API_KEY) && process.env.VOICE !== "off";

// A model talking about the audio instead of transcribing it. Riders say "flat" and "chain", not this.
const REFUSAL = /\b(I (can(no|')t|do(n'| no)t have|am unable|'m unable|am not able)|unable to (listen|hear|transcribe|process)|as an AI|audio (file|message|clip|input)|transcri(be|ption|pt)|no (playable |audible )?(audio|speech)|provide the audio)\b/i;
export const isRefusal = (text) => REFUSAL.test(text);

// Length and loudness of a 16-bit mono WAV, so the log can tell a silent mic from a model problem.
export function wavStats(wav) {
  // Samples start after the "data" chunk header; ffmpeg can put other chunks before it.
  const at = wav.indexOf("data", 12);
  const start = at >= 0 ? at + 8 : 44;
  const bytes = wav.length - start - ((wav.length - start) % 2);
  const pcm = new Int16Array(wav.buffer.slice(wav.byteOffset + start, wav.byteOffset + start + bytes));
  let peak = 0;
  for (const s of pcm) peak = Math.max(peak, Math.abs(s));
  return { seconds: +(pcm.length / 16000).toFixed(1), peakDb: peak ? +(20 * Math.log10(peak / 32768)).toFixed(1) : -Infinity };
}

// Meta's published price: $0.18 per hour of audio. Reserved against the same $140 ceiling as SAM.
export async function voiceTranscribe(wav, seconds, { signal } = {}) {
  const settle = reserve(Math.max(0.001, (seconds * 0.18) / 3600), "muse-voice-transcribe");
  if (!settle) throw new Error("Meta spend cap reached");
  const form = new FormData();
  form.append("request", new Blob([JSON.stringify({ mode: "PUSH_TO_TALK", model: "muse-voice-transcribe-1.0", audioEncoding: "WAV" })], { type: "application/json" }));
  form.append("audio", new Blob([wav], { type: "audio/wav" }), "talk.wav");
  const r = await fetch(`${ASR}?sessionId=nightride-${Date.now()}`, {
    method: "POST", signal, body: form, headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}` },
  });
  if (!r.ok) throw new Error(`muse-voice-transcribe ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  settle(((j.audioDurationMs || 0) / 1000) * 0.18 / 3600);
  return String(j.transcript || "").trim();
}
