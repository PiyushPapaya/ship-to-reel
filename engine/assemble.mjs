// engine/assemble.mjs — resolved reel-spec.json + _shell + scenes -> ONE index.html.
// Deterministic: same spec => same bytes. The HTML is generated, never hand-edited.
//
// Usage: node engine/assemble.mjs [specPath] [outDir]
//   defaults: examples/reel-spec.example.json  ->  build/

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
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

// --- seams (Phase 3: master-timeline, no hard cuts) ---------------------------
// Every scene boundary overlaps by SEAM_BY_PACE seconds: the next scene's fill
// crossfades in on top of the (still-opaque) previous one — see seam-gate.mjs,
// which asserts this overlap actually exists in the rendered output.
const SEAM_BY_PACE = { fast: 0.3, medium: 0.4, slow: 0.5 };
const MAX_SEAM_FRACTION = 0.4; // never eat more than 40% of the shorter neighbor

function seamFor(pace, prevDur, nextDur) {
  const wanted = SEAM_BY_PACE[pace] ?? 0.4;
  return round1(Math.min(wanted, MAX_SEAM_FRACTION * Math.min(prevDur, nextDur)));
}

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

  // Master-timeline: scenes overlap by a seam so the next scene's fill crossfades
  // over the previous one instead of a hard cut (PLAN §4 "erzwungene Seams").
  // Overlapping clips must sit on different tracks (hyperframes rejects same-track
  // overlap), so consecutive scenes alternate between track 1 and 2.
  // Phase 3b's capture.mjs writes <outDir>/capture/{manifest.json,frame-NN.png}.
  // If present, the hook scene composites the first frame as real UI footage
  // (PLAN §4.3 "echtes Material als Basis") instead of the plain gradient depth
  // layer every other scene gets.
  const captureManifestPath = join(resolve(outDir), "capture", "manifest.json");
  let captureFrame = null;
  if (existsSync(captureManifestPath)) {
    const manifest = JSON.parse(readFileSync(captureManifestPath, "utf8"));
    if (manifest.frames?.length) captureFrame = `capture/${manifest.frames[0].file}`;
  }

  const durs = spec.beats.map((beat) => sceneDuration(beat, pace));
  let t = 0;
  const clips = [];
  const tweens = [];
  spec.beats.forEach((beat, i) => {
    const dur = durs[i];
    const seam = i === 0 ? 0 : seamFor(pace, durs[i - 1], dur);
    const start = round1(t - seam);
    const id = `scene-${i}-${beat.type}`;
    const inner = renderScene(beat, ctx);
    const track = (i % 2) + 1;
    const useCapture = i === 0 && captureFrame;
    const bgClass = useCapture ? "bg-depth bg-capture" : "bg-depth";
    const bgStyle = useCapture ? ` style="background-image:url('${captureFrame}')"` : "";
    clips.push(
      `      <section id="${id}" class="scene clip" data-start="${start}" data-duration="${dur}" data-track-index="${track}">\n` +
        `        <div class="scene-fill">\n` +
        `          <div class="${bgClass}"${bgStyle}></div>\n` +
        (useCapture ? `          <div class="scrim"></div>\n` : "") +
        `        ${inner}\n` +
        `        </div>\n` +
        `      </section>`
    );
    if (i === 0) {
      // First scene has nothing to crossfade from — it's simply opaque from t=0.
      tweens.push(`      tl.set("#${id} .scene-fill", { opacity: 1 }, 0);`);
    } else {
      tweens.push(
        `      tl.fromTo("#${id} .scene-fill", { opacity: 0 }, { opacity: 1, duration: ${seam}, ease: "none" }, ${start});`
      );
    }
    // Depth parallax: the background layer drifts+scales across the full scene
    // span, independently of the content entrance — the "flat slide" complaint
    // from Phase 4's aesthetic score was fade-only motion with no depth cue.
    tweens.push(
      `      tl.fromTo("#${id} .bg-depth", { x: -24, y: -16, scale: 1.06 }, { x: 24, y: 16, scale: 1.14, duration: ${round1(dur + seam)}, ease: "none" }, ${start});`
    );
    // Content entrance: rises + scales in once the crossfade has mostly landed.
    tweens.push(
      `      tl.from("#${id} .anim", { opacity: 0, y: 56, scale: 0.94, duration: 0.6, stagger: 0.12, ease: "power3.out" }, ${round1(start + seam * 0.6 + 0.1)});`
    );
    t = start + dur;
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
