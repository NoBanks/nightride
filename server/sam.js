// Meta SAM 3.1 on the Meta Model API: outlines the broken part in the rider's clip, frame by frame.
// The part name comes from Muse Spark's look at the same clip, so the two models work as one.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { parseVideoStream, recordsOfKind, decodeMaskToSVGPath } from "@meta-sam/parser";
import { reserve, samVideoCost } from "./spend.js";

const API = "https://api.meta.ai/v1/responses";
export const SAM_FPS = 10; // ~25 frames for a 2.5 s clip; SAM bills a 50-frame minimum either way
const MAX_SECONDS = 4; // longer uploads are cut, so every call stays under the 50-frame minimum: $0.01
const MAX_POINTS = 120; // per ring, plenty for an outline and small on the wire

export const samReady = () => Boolean(process.env.MODEL_API_KEY) && process.env.SAM !== "off";

// SAM takes H.264 MP4 only; Android records WebM. Small and steady-rate so frames map to playback time.
export async function toMp4(input) {
  const dir = await mkdtemp(join(tmpdir(), "nightride-sam-"));
  const src = join(dir, "in"), out = join(dir, "out.mp4");
  try {
    await writeFile(src, input);
    await new Promise((resolve, reject) => {
      const ff = spawn(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-i", src, "-t", String(MAX_SECONDS), "-an",
        "-vf", `fps=${SAM_FPS},scale='min(480,iw)':-2`, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", "-y", out], { windowsHide: true });
      const err = [];
      ff.stderr.on("data", (d) => err.push(d));
      ff.on("error", reject);
      ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${Buffer.concat(err)}`))));
    });
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Server-sent events from the Responses API, as the event objects the parser expects.
// onDone gets the final response, which carries what Meta billed.
async function* sse(body, onDone = () => {}) {
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let cut;
    while ((cut = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (!data || data === "[DONE]") continue;
      const event = JSON.parse(data);
      if (event.type === "response.completed") onDone(event.response);
      yield event;
    }
  }
}

// "M x y L x y ... Z" is local to the mask's box; shift by its corner and scale by the frame
// size -> rings of [x, y] in 0..1 of the video, thinned to MAX_POINTS.
export function pathToRings(path, left, top, width, height) {
  const rings = [];
  const norm = (v, d) => +Math.min(1, Math.max(0, v / d)).toFixed(4);
  for (const sub of path.split(/(?=M)/)) {
    const nums = sub.match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([norm(left + nums[i], width), norm(top + nums[i + 1], height)]);
    if (pts.length < 3) continue;
    const step = Math.ceil(pts.length / MAX_POINTS);
    rings.push(step > 1 ? pts.filter((_, i) => i % step === 0) : pts);
  }
  return rings;
}

// One call: the clip plus a short noun phrase ("rear tire"). Returns { fps, frames: [{ rings }] },
// one entry per clip frame; frames where SAM found nothing have no rings.
export async function samTrack(clip, part, { signal } = {}) {
  const mp4 = await toMp4(clip);
  // The spend ceiling: no reservation, no call.
  const settle = reserve(samVideoCost(MAX_SECONDS * SAM_FPS), `sam-3.1 "${part}"`);
  if (!settle) throw new Error("Meta spend cap reached");
  const r = await fetch(API, {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sam-3.1",
      stream: true,
      metadata: { mask_encoding: "one_bit" },
      input: [{ type: "message", role: "user", content: [
        { type: "input_text", text: part },
        { type: "input_video", video_url: `data:video/mp4;base64,${mp4.toString("base64")}` },
      ] }],
    }),
  });
  if (!r.ok) throw new Error(`sam-3.1 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const result = await parseVideoStream(sse(r.body, (resp) => settle(samVideoCost(resp?.usage?.video_frames_processed ?? 0)))).finalResult;
  if (result.outcome.status !== "completed") throw new Error(`sam-3.1 ${result.outcome.status}`);

  // Every box token repeats the frame size SAM worked in.
  const size = result.rawOutput.match(/;w=(\d+);h=(\d+)/);
  if (!size) return { fps: SAM_FPS, frames: [], found: 0 };
  const [width, height] = [Number(size[1]), Number(size[2])];
  const byFrame = new Map();
  for (const m of recordsOfKind(result.records, "mask")) {
    const f = m.frame?.frameIndex ?? 0;
    const rings = pathToRings(decodeMaskToSVGPath(m.mask), m.bounds.left, m.bounds.top, width, height);
    byFrame.set(f, [...(byFrame.get(f) || []), ...rings]);
  }
  const count = byFrame.size ? Math.max(...byFrame.keys()) + 1 : 0;
  const frames = Array.from({ length: count }, (_, i) => ({ rings: byFrame.get(i) || [] }));
  return { fps: SAM_FPS, frames, found: frames.filter((f) => f.rings.length).length };
}
