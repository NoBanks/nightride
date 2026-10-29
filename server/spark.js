// Muse Spark Open (Meta open weights) served by Baseten, OpenAI-compatible.
const URL_ = "https://inference.baseten.co/v1/chat/completions";
const MODEL = "meta-models/muse-spark-open-1026";

// SPARK=off keeps the key loaded but answers from canned data (saves credit while building).
export const sparkReady = () => Boolean(process.env.BASETEN_API_KEY) && process.env.SPARK !== "off";

// Running token count for this server process, to watch the free credit.
export const usage = { calls: 0, prompt: 0, completion: 0 };

async function chat(messages, { maxTokens = 2000, timeoutMs = 25000 } = {}) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.BASETEN_API_KEY}`, "Content-Type": "application/json" },
    // The model always reasons first; "low" keeps that short so the answer arrives fast.
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, reasoning_effort: "low" }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`spark ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  usage.calls += 1;
  usage.prompt += j.usage?.prompt_tokens || 0;
  usage.completion += j.usage?.completion_tokens || 0;
  console.log(`spark tokens: +${j.usage?.prompt_tokens}/${j.usage?.completion_tokens} | total ${usage.calls} calls, ${usage.prompt + usage.completion} tokens`);
  const text = j.choices?.[0]?.message?.content;
  if (!text) throw new Error("spark: empty answer (reasoning used the whole budget)");
  return text.trim();
}

function parseJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`spark: no JSON in ${text.slice(0, 120)}`);
  return JSON.parse(m[0]);
}

export async function sparkJSON(system, content, opts) {
  return parseJSON(await chat([{ role: "system", content: system }, { role: "user", content }], opts));
}

export async function sparkTranscribe(wav) {
  return chat([{ role: "user", content: [
    { type: "text", text: "Transcribe this audio exactly. Reply with only the words spoken. If nothing is said, reply with nothing." },
    { type: "input_audio", input_audio: { data: wav.toString("base64"), format: "wav" } },
  ] }], { maxTokens: 1500 });
}

export const imagePart = (buf, mime = "image/jpeg") =>
  ({ type: "image_url", image_url: { url: `data:${mime};base64,${buf.toString("base64")}` } });
