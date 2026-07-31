// engine/align-captions.mjs — Phase 3c: word-accurate caption sync.
//
// Runs AFTER assemble.mjs, BEFORE render.mjs (PLAN §9's data flow). It mutates the
// already-assembled build/index.html in place: for every beat that has narration
// (engine/tts.mjs's <outDir>/narration/manifest.json), it injects one
// <div class="captions"> per scene — frame-relative and nested inside that scene's
// own .scene-fill, so it shows/hides automatically with the scene's existing
// data-start/data-duration clip lifecycle (no new global overlay/timeline needed) —
// plus per-word highlight tweens appended to the same GSAP timeline the seams and
// entrance animations already use.
//
// Position/size come from channel.captions (channel wins layout, per PLAN §1's
// merge rule); the highlight color is the brand accent token already in :root.
//
// No-ops cleanly (exit 0) if <outDir>/narration/manifest.json doesn't exist — most
// builds won't have run tts.mjs, same pattern as capture.mjs's --spec no-op.
//
// Usage: node engine/align-captions.mjs [buildDir] [specPath]
//   defaults: build/  /  <buildDir>/reel-spec.json

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const round2 = (n) => Math.round(n * 100) / 100;

// A beat's full transcript is too long to show as one static block — it would
// sit on screen for the whole beat and visually collide with that scene's own
// headline/body (verified: rendering all words at once overlapped "The problem"
// beat's own <h1>). Real captions show a short rolling line instead: chunk words
// by count and a character budget, one chunk visible at a time.
const MAX_CHUNK_WORDS = 5;
const MAX_CHUNK_CHARS = 26;

function chunkWords(words) {
  const chunks = [];
  let cur = [];
  let chars = 0;
  for (const w of words) {
    const wLen = w.text.length + 1;
    if (cur.length && (cur.length >= MAX_CHUNK_WORDS || chars + wLen > MAX_CHUNK_CHARS)) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
    cur.push(w);
    chars += wLen;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

export function alignCaptions(buildDir, spec) {
  const narrationManifestPath = join(buildDir, "narration", "manifest.json");
  if (!existsSync(narrationManifestPath)) {
    console.log(`no ${narrationManifestPath} — skipping caption alignment (run engine/tts.mjs first).`);
    return { skipped: true };
  }
  const timingPath = join(buildDir, "timing.json");
  if (!existsSync(timingPath)) {
    throw new Error(`align-captions: ${timingPath} not found — run engine/assemble.mjs first`);
  }

  const timing = JSON.parse(readFileSync(timingPath, "utf8"));
  const narration = JSON.parse(readFileSync(narrationManifestPath, "utf8"));
  const capCfg = spec.channel.captions;
  const posClass = `pos-${capCfg.position}`;
  const boxClass = capCfg.box ? " boxed" : "";

  const htmlPath = join(buildDir, "index.html");
  let html = readFileSync(htmlPath, "utf8");

  const tweenLines = [];
  let totalWords = 0;
  for (const beat of narration.beats) {
    if (!beat.words?.length) continue;
    const t = timing[beat.beatIndex];
    if (!t) continue;
    const id = t.id;

    const chunks = chunkWords(beat.words);
    let globalWi = 0;
    const chunkDivs = chunks
      .map((chunk, ci) => {
        const spans = chunk
          .map((w) => `<span class="cw" data-i="${globalWi++}">${esc(w.text)}</span>`)
          .join(" ");
        return `<div class="cline" data-c="${ci}">${spans}</div>`;
      })
      .join("");
    const captionsHtml = `\n          <div class="captions ${posClass}${boxClass}">${chunkDivs}</div>`;

    // Insert right before this scene's "</div>\n      </section>" close — i.e.
    // as the last child of .scene-fill, so it's frame-relative like .stage.
    const closeRe = new RegExp(`(<section id="${id}"[\\s\\S]*?)(\\s*</div>(?:\\n\\s*<audio[^>]*></audio>)?\\n\\s*</section>)`);
    if (!closeRe.test(html)) {
      throw new Error(`align-captions: couldn't find scene section for ${id} in ${htmlPath}`);
    }
    html = html.replace(closeRe, (_, before, after) => `${before}${captionsHtml}${after}`);

    globalWi = 0;
    chunks.forEach((chunk, ci) => {
      const chunkStart = round2(t.start + Math.min(chunk[0].start, t.duration));
      const chunkEnd = round2(t.start + Math.min(chunk[chunk.length - 1].end, t.duration));
      const lineSel = `#${id} .cline[data-c='${ci}']`;
      // Only one line visible at a time — this is what keeps captions from
      // sitting on screen long enough to collide with the scene's own headline.
      tweenLines.push(`      tl.set("${lineSel}", { opacity: 1 }, ${chunkStart});`);
      tweenLines.push(`      tl.set("${lineSel}", { opacity: 0 }, ${chunkEnd});`);

      chunk.forEach((w) => {
        const start = round2(t.start + Math.min(w.start, t.duration));
        const end = round2(t.start + Math.min(w.end, t.duration));
        const sel = `#${id} .cw[data-i='${globalWi}']`;
        if (capCfg.box) {
          tweenLines.push(`      tl.set("${sel}", { backgroundColor: "var(--accent)", color: "var(--paper)" }, ${start});`);
          tweenLines.push(`      tl.set("${sel}", { backgroundColor: "transparent", color: "var(--ink)" }, ${end});`);
        } else {
          tweenLines.push(`      tl.set("${sel}", { color: "var(--accent)" }, ${start});`);
          tweenLines.push(`      tl.set("${sel}", { color: "var(--ink)" }, ${end});`);
        }
        globalWi++;
        totalWords++;
      });
    });
  }

  if (tweenLines.length) {
    html = html.replace(
      `window.__timelines["main"] = tl;`,
      `${tweenLines.join("\n")}\n      window.__timelines["main"] = tl;`
    );
  }

  writeFileSync(htmlPath, html, "utf8");
  return { skipped: false, beats: narration.beats.filter((b) => b.words?.length).length, words: totalWords };
}

// --- CLI ----------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("align-captions.mjs")) {
  const buildDir = resolve(process.argv[2] ?? join(root, "build"));

  // Check for narration BEFORE touching a spec path — most builds (e.g. plain
  // `npm run build`, which never runs resolve-spec.mjs or tts.mjs) have neither
  // narration nor a build/reel-spec.json, and must no-op cleanly rather than
  // crash on a missing spec file.
  if (!existsSync(join(buildDir, "narration", "manifest.json"))) {
    console.log(`no ${join(buildDir, "narration", "manifest.json")} — skipping caption alignment (run engine/tts.mjs first).`);
    process.exit(0);
  }

  const defaultSpecPath = existsSync(join(buildDir, "reel-spec.json"))
    ? join(buildDir, "reel-spec.json")
    : join(root, "examples/reel-spec.example.json");
  const specPath = resolve(process.argv[3] ?? defaultSpecPath);
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const r = alignCaptions(buildDir, spec);
  if (!r.skipped) {
    console.log(`aligned captions: ${r.beats} beats, ${r.words} words -> ${join(buildDir, "index.html")}`);
  }
}
