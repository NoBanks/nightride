// Browser recordings (WebM/Opus on Android, MP4 on iPhone) -> 16 kHz mono WAV for the model.
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

export function toWav(input) {
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", "16000", "-f", "wav", "pipe:1"]);
    const out = [], err = [];
    ff.stdout.on("data", (d) => out.push(d));
    ff.stderr.on("data", (d) => err.push(d));
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}: ${Buffer.concat(err)}`))));
    ff.stdin.on("error", () => {}); // ffmpeg may close stdin early on bad input; "close" reports it
    ff.stdin.end(input);
  });
}
