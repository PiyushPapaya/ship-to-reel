// engine/seam-gate.mjs — Phase 3 proof that the master-timeline has no hard cuts.
// Parses the ASSEMBLED build/index.html (never trusts assemble.mjs's own math) and
// asserts, for every adjacent scene pair:
//   1. they actually overlap in time by a positive seam,
//   2. the overlap sits on two different data-track-index lanes (hyperframes
//      rejects same-track overlap, so this also catches a track-alternation bug),
//   3. the later scene has a crossfade-in tween on its .scene-fill in the timeline body.
// Exits non-zero on any failure — "generating is not finishing" (PLAN §5).
//
// Usage: node engine/seam-gate.mjs [indexHtmlPath]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = resolve(process.argv[2] ?? join(root, "build/index.html"));
const html = readFileSync(htmlPath, "utf8");

// --- parse every <section class="scene clip" ...> in document order -----------
// scene-sting / scene-outro-card (ROADMAP-NEXT.md 2.2's channel-constant
// bookends) are real scenes with the same crossfade contract as beats — the
// seam gate must cover them too, not silently skip them for lacking a beat index.
const sceneRe = /<section id="(scene-\d+-[a-z-]+|scene-sting|scene-outro-card)" class="scene clip" data-start="([\d.]+)" data-duration="([\d.]+)" data-track-index="(\d+)"/g;
const scenes = [];
for (const m of html.matchAll(sceneRe)) {
  scenes.push({ id: m[1], start: Number(m[2]), duration: Number(m[3]), track: Number(m[4]) });
}

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

record(`found ${scenes.length} scene clips`, scenes.length > 0, scenes.length ? undefined : "no <section class=\"scene clip\"> matched — did assemble.mjs run first?");

for (let i = 1; i < scenes.length; i++) {
  const prev = scenes[i - 1];
  const cur = scenes[i];
  const prevEnd = round1(prev.start + prev.duration);
  const overlap = round1(prevEnd - cur.start);

  record(
    `${prev.id} -> ${cur.id}: overlaps (seam, no hard cut)`,
    overlap > 0,
    overlap > 0 ? undefined : `expected cur.start < prev.start+prev.duration (${prevEnd}); got cur.start=${cur.start} (overlap=${overlap})`
  );

  record(
    `${prev.id} -> ${cur.id}: different tracks (${prev.track} vs ${cur.track})`,
    prev.track !== cur.track,
    prev.track !== cur.track ? undefined : `both on track ${prev.track} — hyperframes rejects same-track overlap`
  );

  // ROADMAP-NEXT.md 1.2: brand.signature.transition swaps the plain opacity
  // crossfade for a clip-path reveal (wipe/iris) — still a real seam (no hard
  // cut), just a different reveal shape, so either counts as satisfying this
  // invariant.
  const fadeRe = new RegExp(`tl\\.fromTo\\("#${cur.id} \\.scene-fill",\\s*\\{\\s*opacity:\\s*0\\s*\\}`);
  const clipRevealRe = new RegExp(`tl\\.fromTo\\("#${cur.id} \\.scene-fill",\\s*\\{\\s*clipPath:`);
  const hasSeamTween = fadeRe.test(html) || clipRevealRe.test(html);
  record(
    `${cur.id}: has a crossfade-in tween on .scene-fill`,
    hasSeamTween,
    hasSeamTween ? undefined : "no tl.fromTo(...opacity:0...) or clip-path reveal found for this scene's .scene-fill"
  );
}

report();

function round1(n) {
  return Math.round(n * 10) / 10;
}

function report() {
  let failed = 0;
  for (const r of results) {
    if (r.ok) {
      console.log(`  ✓ ${r.name}`);
    } else {
      failed++;
      console.log(`  ✗ ${r.name}`);
      if (r.detail) console.log(`    ${r.detail}`);
    }
  }
  console.log(`\n${results.length - failed}/${results.length} seam checks passed`);
  process.exit(failed ? 1 : 0);
}
