// engine/score-frames.mjs — ROADMAP-NEXT.md Tier 1.1: automate the aesthetic
// scorer that quality-check.mjs's `--scores` flag has always required a human
// (or agent) to produce by hand. Sends a capped, evenly-sampled subset of
// build/quality/frames/*.png to a Claude vision model against the same
// 7-dimension rubric quality-check.mjs enforces, and writes the same
// scores.json shape `--scores` already consumes — so the gate becomes fully
// automated without changing quality-check.mjs's threshold logic at all.
//
// Raw HTTP against the Messages API (no @anthropic-ai/sdk dependency), matching
// this repo's existing convention for every other external API call
// (broll.mjs: Veo/Sora/Runway/Kling; tts.mjs: ElevenLabs) — env-var gated,
// best-effort, degrades to a "skipped" status rather than throwing when no key
// is configured, so a machine with no ANTHROPIC_API_KEY still finishes clean.
//
// Usage:
//   node engine/score-frames.mjs [framesDir] [--out path.json] [--max-frames N]
//
// Defaults: framesDir = build/quality/frames, out = build/quality/scores.json,
// max-frames = 6 (bounds the per-render token/cost spend the roadmap flagged
// as a fork needing a cap).

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, basename } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIMENSIONS = ["typography", "color", "composition", "hierarchy", "motion_flow", "consistency", "distinctiveness"];
const MODEL = process.env.SCORE_MODEL ?? "claude-opus-5";

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
}

const rawArgs = process.argv.slice(2);
const flagValues = new Set([argValue("--out"), argValue("--max-frames")].filter(Boolean));
const positional = rawArgs.filter((a) => !a.startsWith("--") && !flagValues.has(a));
const framesDir = resolve(positional[0] ?? join(root, "build", "quality", "frames"));
const outPath = resolve(argValue("--out", join(root, "build", "quality", "scores.json")));
const maxFrames = Number(argValue("--max-frames", "6"));

function fail(message) {
  console.error(`score-frames: ${message}`);
  process.exit(1);
}

if (!existsSync(framesDir)) {
  fail(`frames dir not found: ${framesDir} — run engine/quality-check.mjs first to extract frames`);
}

const allFrames = readdirSync(framesDir).filter((f) => f.endsWith(".png")).sort();
if (allFrames.length === 0) {
  fail(`no .png frames found in ${framesDir}`);
}

// Evenly sample up to maxFrames across the full set — dense enough for the
// model to judge motion/consistency across the reel, capped so cost per
// render stays bounded regardless of clip length.
function sample(files, n) {
  if (files.length <= n) return files;
  const step = (files.length - 1) / (n - 1);
  const picked = [];
  for (let i = 0; i < n; i++) picked.push(files[Math.round(i * step)]);
  return [...new Set(picked)];
}

const sampledFrames = sample(allFrames, maxFrames);

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  const skipped = { status: "skipped", missing: ["ANTHROPIC_API_KEY"] };
  console.log(`score-frames: ${JSON.stringify(skipped)}`);
  console.log("  … no ANTHROPIC_API_KEY — falling back to manual scoring (see quality-check.mjs's pending note)");
  process.exit(0);
}

const RUBRIC = `You are scoring frames sampled from a short-form vertical (1080x1920) marketing reel against a strict 7-dimension aesthetic rubric. Score each dimension 1-5 (5 = best):

- typography: type choices, sizing, hierarchy of text elements
- color: palette cohesion, contrast, brand consistency
- composition: how content fills the 1080x1920 frame (a short text block floating in empty space scores low)
- hierarchy: visual priority — is it obvious what to look at first
- motion_flow: implied by comparing frames — does the sequence suggest deliberate motion/depth, not just static cards
- consistency: do frames read as one coherent visual system
- distinctiveness: does this look like a generic template, or does it have a real visual signature

Be honest and strict — a flat, template-like render should score low. This is a hard gate (avg >= 4.0 to pass), not a participation score. Respond with ONLY a JSON object matching this exact shape, no other text:
{"typography": N, "color": N, "composition": N, "hierarchy": N, "motion_flow": N, "consistency": N, "distinctiveness": N, "notes": "one or two sentences on the weakest dimension and why"}`;

const imageBlocks = sampledFrames.map((f) => ({
  type: "image",
  source: { type: "base64", media_type: "image/png", data: readFileSync(join(framesDir, f)).toString("base64") },
}));

const body = {
  model: MODEL,
  max_tokens: 1024,
  output_config: {
    format: {
      type: "json_schema",
      schema: {
        type: "object",
        properties: {
          typography: { type: "integer" },
          color: { type: "integer" },
          composition: { type: "integer" },
          hierarchy: { type: "integer" },
          motion_flow: { type: "integer" },
          consistency: { type: "integer" },
          distinctiveness: { type: "integer" },
          notes: { type: "string" },
        },
        required: [...DIMENSIONS, "notes"],
        additionalProperties: false,
      },
    },
  },
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: `${RUBRIC}\n\n${sampledFrames.length} frames follow, in playback order (${basename(framesDir)}):` },
        ...imageBlocks,
      ],
    },
  ],
};

console.log(`→ score-frames: ${sampledFrames.length}/${allFrames.length} frames from ${framesDir} → ${MODEL}`);

const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
});

if (!res.ok) {
  fail(`Messages API request failed: ${res.status} ${await res.text()}`);
}

const message = await res.json();
if (message.stop_reason === "refusal") {
  fail(`model declined to score these frames (stop_reason: refusal)`);
}

const textBlock = message.content.find((b) => b.type === "text");
if (!textBlock) fail("no text content in model response");

let scores;
try {
  scores = JSON.parse(textBlock.text);
} catch {
  fail(`model response was not valid JSON: ${textBlock.text.slice(0, 300)}`);
}

const missing = DIMENSIONS.filter((d) => !Number.isFinite(scores[d]));
if (missing.length) fail(`model response missing/invalid dimensions: ${missing.join(", ")}`);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(scores, null, 2));

const avg = DIMENSIONS.reduce((a, d) => a + scores[d], 0) / DIMENSIONS.length;
console.log(`  scored: avg ${avg.toFixed(2)} — ${JSON.stringify(Object.fromEntries(DIMENSIONS.map((d) => [d, scores[d]])))}`);
console.log(`  notes: ${scores.notes}`);
console.log(`  wrote ${outPath}`);
