// engine/tts.mjs — Phase 3c narration: provider-agnostic TTS with word timestamps.
//
// Default provider is Edge-TTS (msedge-tts — free, keyless, wraps Microsoft Edge's
// Read Aloud service) per PLAN §11's "keyless -> key" fallback chain. If
// ELEVENLABS_API_KEY is set, ElevenLabs is used instead (higher-quality voice,
// paid). Both paths return the same shape: an audio file + word-level timestamps,
// so align-captions.mjs and assemble.mjs never need to know which provider ran.
//
// What gets spoken: the same text already rendered on-screen by scenes.mjs for
// that beat (stripped of markup) — not a separate authored script. This keeps
// narration and captions perfectly in sync by construction and needs no new
// schema field for a "script"; beats already carry all the visible copy.
//
// Usage:
//   node engine/tts.mjs [specPath] [outDir]        // synthesize every beat
//   node engine/tts.mjs --text "..." --out <dir>   // synthesize one line (debug)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { renderScene } from "./scenes.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_EDGE_VOICE = "en-US-AriaNeural";
const DEFAULT_ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs' public "Rachel" voice

function textOf(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// --- Edge-TTS (default, free, keyless) -----------------------------------------
async function synthesizeEdge({ text, outDir, voice }) {
  mkdirSync(outDir, { recursive: true });
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice ?? DEFAULT_EDGE_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
    wordBoundaryEnabled: true,
  });
  const { audioFilePath, metadataFilePath } = await tts.toFile(outDir, text);
  const meta = JSON.parse(readFileSync(metadataFilePath, "utf8"));
  const words = meta.Metadata.filter((m) => m.Type === "WordBoundary").map((m) => ({
    text: m.Data.text.Text,
    start: m.Data.Offset / 1e7, // 100ns ticks -> seconds
    end: (m.Data.Offset + m.Data.Duration) / 1e7,
  }));
  const duration = words.length ? words[words.length - 1].end : 0;
  return { audioPath: audioFilePath, words, duration, provider: "edge" };
}

// --- ElevenLabs (optional, key required) ---------------------------------------
function charsToWords(chars, starts, ends) {
  const words = [];
  let cur = null;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (/\s/.test(c)) {
      if (cur) { words.push(cur); cur = null; }
      continue;
    }
    if (!cur) cur = { text: c, start: starts[i], end: ends[i] };
    else { cur.text += c; cur.end = ends[i]; }
  }
  if (cur) words.push(cur);
  return words;
}

async function synthesizeElevenLabs({ text, outDir, voice }) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = voice ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_ELEVENLABS_VOICE_ID;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  mkdirSync(outDir, { recursive: true });
  const audioPath = join(outDir, "audio.mp3");
  writeFileSync(audioPath, Buffer.from(json.audio_base64, "base64"));
  const words = charsToWords(
    json.alignment.characters,
    json.alignment.character_start_times_seconds,
    json.alignment.character_end_times_seconds
  );
  const duration = words.length ? words[words.length - 1].end : 0;
  return { audioPath, words, duration, provider: "elevenlabs" };
}

// --- provider selection ---------------------------------------------------------
export async function synthesize({ text, outDir, voice, provider }) {
  const chosen = provider ?? (process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "edge");
  if (chosen === "elevenlabs") return synthesizeElevenLabs({ text, outDir, voice });
  return synthesizeEdge({ text, outDir, voice });
}

// --- whole-spec orchestration ----------------------------------------------------
export async function synthesizeSpec(spec, outDir) {
  const ctx = { brand: spec.brand, channel: spec.channel, voice: spec.voice };
  const beats = [];
  for (let i = 0; i < spec.beats.length; i++) {
    const beat = spec.beats[i];
    const text = textOf(renderScene(beat, ctx));
    if (!text) {
      beats.push({ beatIndex: i, type: beat.type, words: [], duration: 0, audioPath: null });
      continue;
    }
    const beatDir = join(outDir, `beat-${i}`);
    const r = await synthesize({ text, outDir: beatDir });
    beats.push({ beatIndex: i, type: beat.type, text, ...r });
  }
  const manifest = { generatedAt: new Date().toISOString(), beats };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

// --- CLI --------------------------------------------------------------------
function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else { flags[key] = next; i++; }
    }
  }
  return flags;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("tts.mjs")) {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.text) {
    const outDir = resolve(flags.out ?? join(root, "build/narration/debug"));
    synthesize({ text: flags.text, outDir, voice: flags.voice, provider: flags.provider })
      .then((r) => console.log(`synthesized (${r.provider}) -> ${r.audioPath}  (${r.duration.toFixed(2)}s, ${r.words.length} words)`))
      .catch((err) => { console.error("tts failed:", err.message); process.exit(1); });
  } else {
    const specPath = resolve(process.argv[2] ?? join(root, "examples/reel-spec.example.json"));
    const outDir = resolve(process.argv[3] ?? join(root, "build/narration"));
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    synthesizeSpec(spec, outDir)
      .then((manifest) => {
        const total = manifest.beats.reduce((s, b) => s + b.duration, 0);
        console.log(`synthesized ${manifest.beats.length} beats -> ${outDir}  (${total.toFixed(2)}s total)`);
      })
      .catch((err) => { console.error("tts failed:", err.message); process.exit(1); });
  }
}
