// engine/assemble.mjs — resolved reel-spec.json + _shell + scenes -> ONE index.html.
// Deterministic: same spec => same bytes. The HTML is generated, never hand-edited.
//
// Usage: node engine/assemble.mjs [specPath] [outDir]
//   defaults: examples/reel-spec.example.json  ->  build/

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { renderScene } from "./scenes.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readText = (p) => readFileSync(join(root, p), "utf8");

// --- duration resolution ------------------------------------------------------
const DEFAULT_DUR = { hook: 2.5, problem: 3.5, "code-diff": 4, result: 3, outro: 2.5 };
const PACE_FACTOR = { fast: 0.8, medium: 1.0, slow: 1.25 };
const round1 = (n) => Math.round(n * 10) / 10;

function sceneDuration(beat, pace) {
  const f = PACE_FACTOR[pace] ?? 1.0;
  const d = beat.dur;
  if (typeof d === "number") return round1(d);
  if (d && typeof d === "object") {
    // range: fast -> min, slow -> max, medium -> midpoint
    if (pace === "fast") return round1(d.min);
    if (pace === "slow") return round1(d.max);
    return round1((d.min + d.max) / 2);
  }
  return round1((DEFAULT_DUR[beat.type] ?? 3) * f);
}

// --- schema gate --------------------------------------------------------------
function validateSpec(spec) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const schema = JSON.parse(readText("reel-spec.schema.json"));
  const validate = ajv.compile(schema);
  if (!validate(spec)) {
    throw new Error("spec fails reel-spec.schema.json:\n  " + ajv.errorsText(validate.errors, { separator: "\n  " }));
  }
}

// --- token injection ----------------------------------------------------------
function paletteToCss(palette) {
  return Object.entries(palette)
    .map(([k, v]) => `        --${k}: ${v};`)
    .join("\n");
}

export function assemble(specPath, outDir) {
  const spec = JSON.parse(readFileSync(resolve(specPath), "utf8"));
  validateSpec(spec);

  const { meta, channel, brand, tempo } = spec;
  const pace = tempo?.pace ?? "medium";
  const ctx = { brand, channel, voice: spec.voice };

  // Lay scenes out sequentially; total duration = sum (meta.duration range is advisory in Phase 1).
  let t = 0;
  const clips = [];
  const tweens = [];
  spec.beats.forEach((beat, i) => {
    const dur = sceneDuration(beat, pace);
    const id = `scene-${i}-${beat.type}`;
    const inner = renderScene(beat, ctx);
    clips.push(
      `      <section id="${id}" class="scene clip" data-start="${round1(t)}" data-duration="${dur}" data-track-index="1">\n` +
        `        ${inner}\n` +
        `      </section>`
    );
    // Uniform entrance: content rises + fades in shortly after the scene begins.
    tweens.push(
      `      tl.from("#${id} .anim", { opacity: 0, y: 40, duration: 0.5, stagger: 0.12, ease: "power3.out" }, ${round1(t + 0.15)});`
    );
    t += dur;
  });
  const total = round1(t);

  const wm = channel.watermark ?? {};
  const safe = channel.safe_areas ?? {};

  let html = readText("templates/_shell/shell.html");
  const fill = {
    ID: meta.id,
    TOKENS: paletteToCss(brand.palette),
    SAFE_TOP: safe.top ?? 0,
    SAFE_BOTTOM: safe.bottom ?? 0,
    SAFE_RIGHT: safe.right ?? 0,
    DURATION: total,
    CLIPS: clips.join("\n"),
    TIMELINE_BODY: tweens.join("\n"),
    WATERMARK_TEXT: wm.text ?? channel.handle ?? "",
    WATERMARK_OPACITY: wm.opacity ?? 0.7,
  };
  for (const [k, v] of Object.entries(fill)) {
    html = html.replaceAll(`{{${k}}}`, String(v));
  }

  const outAbs = resolve(outDir);
  mkdirSync(outAbs, { recursive: true });
  writeFileSync(join(outAbs, "index.html"), html, "utf8");
  copyFileSync(join(root, "node_modules/gsap/dist/gsap.min.js"), join(outAbs, "gsap.min.js"));

  return { out: join(outAbs, "index.html"), duration: total, scenes: spec.beats.length };
}

// --- CLI ----------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("assemble.mjs")) {
  const specPath = process.argv[2] ?? join(root, "examples/reel-spec.example.json");
  const outDir = process.argv[3] ?? join(root, "build");
  const r = assemble(specPath, outDir);
  console.log(`assembled ${r.scenes} scenes -> ${r.out}  (${r.duration}s)`);
}
