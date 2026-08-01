// engine/quality-check.mjs — Phase 4 Waechter: functional + aesthetic QA gate.
// "Generieren ist nicht Fertigstellen" (PLAN §5) — never trust "render succeeded".
//
// Functional pass (fully automated, hard gate):
//   - re-runs `hyperframes lint` on the assembled build dir (0 errors required)
//   - extracts frames from the rendered MP4 via ffmpeg
//   - hashes them to catch a frozen/stuck render (the exact bug seam-gate's
//     sibling, capture.mjs, hit in Phase 3b: 4 byte-identical "different" frames)
//   - verifies frame count/dimensions against ffprobe, never just exit-code
//
// Aesthetic pass (scored, NOT automatable without a vision model in this repo):
//   - writes build/quality/report.json, a scorecard scaffold (7 dimensions, 1-5)
//   - if --scores <path> is given, merges those scores and enforces a hard
//     threshold (avg >= 4.0, every dimension >= 3) — flat "slide rows" fail.
//   - without --scores, the aesthetic gate is SKIPPED and reported as pending;
//     this script cannot see the frames itself, so scoring is done by whoever
//     (agent or human) looks at build/quality/frames/*.png and writes the file.
//
// Usage: node engine/quality-check.mjs [dir] [mp4] [--scores path.json] [--auto]
//
// --auto (ROADMAP-NEXT.md Tier 1.1) runs engine/score-frames.mjs against the
// just-extracted frames and uses its output as --scores, so the aesthetic gate
// is fully automated end to end. Falls back to the existing "pending" state
// (never fails the build on its own) if score-frames.mjs skips for lack of
// ANTHROPIC_API_KEY.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2).filter((a) => a !== "--scores" && a !== argScoresValue() && a !== "--auto");
function argScoresValue() {
  const i = process.argv.indexOf("--scores");
  return i === -1 ? undefined : process.argv[i + 1];
}
const autoScore = process.argv.includes("--auto");
let scoresPath = argScoresValue();

const dir = resolve(args[0] ?? join(root, "build"));
const mp4 = resolve(args[1] ?? join(dir, "reel.mp4"));
const framesDir = join(dir, "quality", "frames");
const reportPath = join(dir, "quality", "report.json");

const isWin = process.platform === "win32";
const npx = isWin ? "npx.cmd" : "npx";
const q = (a) => (isWin && /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
function run(cmd, cmdArgs) {
  return spawnSync(cmd, isWin ? cmdArgs.map(q) : cmdArgs, { cwd: root, shell: isWin, encoding: "utf8" });
}

const results = [];
const record = (name, ok, detail) => { results.push({ name, ok, detail }); return ok; };

console.log(`→ quality-check: ${dir} / ${mp4}`);

// --- functional pass 1: hyperframes lint ---------------------------------------
const lint = run(npx, ["--yes", "hyperframes", "lint", dir]);
const lintOut = (lint.stdout || "") + (lint.stderr || "");
record("hyperframes lint: 0 errors", lint.status === 0, lint.status === 0 ? undefined : lintOut.trim().slice(-500));

// --- functional pass 2: extract + verify frames --------------------------------
if (!existsSync(mp4)) {
  record(`render exists: ${mp4}`, false, "no MP4 found — run engine/render.mjs first");
  report();
}
mkdirSync(framesDir, { recursive: true });
for (const f of readdirSync(framesDir)) {
  try { unlinkSync(join(framesDir, f)); } catch {}
}
// 2 fps sample — dense enough to catch a frozen render, sparse enough to review by eye
const extract = run("ffmpeg", ["-y", "-i", mp4, "-vf", "fps=2", join(framesDir, "frame-%03d.png")]);
const frameFiles = existsSync(framesDir) ? readdirSync(framesDir).filter((f) => f.endsWith(".png")).sort() : [];
record("ffmpeg frame extraction succeeded", extract.status === 0 && frameFiles.length > 0,
  extract.status === 0 ? (frameFiles.length ? undefined : "0 frames written") : (extract.stderr || "").trim().slice(-500));

// --- functional pass 3: probe the mp4 itself (dims/duration/frame count) -------
const probe = run("ffprobe", ["-v", "error", "-select_streams", "v:0",
  "-show_entries", "stream=width,height,nb_read_frames", "-show_entries", "format=duration",
  "-of", "json", "-count_frames", mp4]);
let meta = {};
try { meta = JSON.parse(probe.stdout); } catch {}
const stream = meta.streams?.[0] ?? {};
record("ffprobe: 1080x1920", stream.width === 1080 && stream.height === 1920,
  `got ${stream.width}x${stream.height}`);
record("ffprobe: duration > 1s", Number(meta.format?.duration ?? 0) > 1,
  `duration=${meta.format?.duration}`);

// --- functional pass 4: frozen-render detection (hash every sampled frame) -----
const hashes = frameFiles.map((f) => createHash("sha256").update(readFileSync(join(framesDir, f))).digest("hex"));
const uniqueHashes = new Set(hashes);
const minExpectedUnique = Math.min(3, frameFiles.length); // at least a few distinct visuals expected
record(
  `frames are not frozen (${uniqueHashes.size}/${frameFiles.length} unique)`,
  frameFiles.length === 0 || uniqueHashes.size >= minExpectedUnique,
  uniqueHashes.size < minExpectedUnique
    ? `only ${uniqueHashes.size} distinct frame(s) across ${frameFiles.length} samples — looks like a stuck/frozen render`
    : undefined
);

// --- optional: auto-score via engine/score-frames.mjs (ROADMAP-NEXT.md 1.1) ---
if (autoScore && !scoresPath) {
  const autoOut = join(dirname(reportPath), "scores.json");
  if (existsSync(autoOut)) unlinkSync(autoOut); // never trust a stale scores.json from a prior manual/--auto run
  const scoreRun = run("node", [join(root, "engine", "score-frames.mjs"), framesDir, "--out", autoOut]);
  console.log((scoreRun.stdout || "").trim());
  if (scoreRun.stderr) console.log(scoreRun.stderr.trim());
  if (scoreRun.status === 0 && existsSync(autoOut)) {
    scoresPath = autoOut;
  } else {
    console.log("  … --auto could not produce scores (see above) — falling back to pending aesthetic state");
  }
}

// --- aesthetic pass: scorecard scaffold + optional threshold gate --------------
const DIMENSIONS = ["typography", "color", "composition", "hierarchy", "motion_flow", "consistency", "distinctiveness"];
const THRESHOLD = { avg: 4.0, min: 3 }; // deliberately harder than a catalog tool — flat "slide rows" fail

let aestheticReport = {
  status: "pending",
  note: `no --scores file given — score build/quality/frames/*.png (1-5 per dimension) and re-run with --scores <path.json>`,
  dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, null])),
};

if (scoresPath) {
  const supplied = JSON.parse(readFileSync(resolve(scoresPath), "utf8"));
  const scores = DIMENSIONS.map((d) => Number(supplied[d]));
  const missing = DIMENSIONS.filter((d, i) => !Number.isFinite(scores[i]));
  if (missing.length) {
    record("aesthetic scores: complete", false, `missing/invalid: ${missing.join(", ")}`);
  } else {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const min = Math.min(...scores);
    record(
      `aesthetic: avg >= ${THRESHOLD.avg} (got ${avg.toFixed(2)})`,
      avg >= THRESHOLD.avg,
      avg >= THRESHOLD.avg ? undefined : `avg score ${avg.toFixed(2)} below threshold — flat/low-flow render, needs a patch pass`
    );
    record(
      `aesthetic: every dimension >= ${THRESHOLD.min}`,
      min >= THRESHOLD.min,
      min >= THRESHOLD.min ? undefined : `lowest dimension = ${min} (< ${THRESHOLD.min})`
    );
    aestheticReport = {
      status: avg >= THRESHOLD.avg && min >= THRESHOLD.min ? "pass" : "fail",
      avg: round2(avg),
      min,
      threshold: THRESHOLD,
      dimensions: Object.fromEntries(DIMENSIONS.map((d, i) => [d, scores[i]])),
      notes: supplied.notes ?? undefined,
    };
  }
} else {
  console.log(`  … aesthetic pass pending: score frames in ${framesDir} and re-run with --scores <path.json>`);
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  functional: results.map(({ name, ok, detail }) => ({ name, ok, detail })),
  aesthetic: aestheticReport,
}, null, 2));

report();

function round2(n) { return Math.round(n * 100) / 100; }

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
  console.log(`\n${results.length - failed}/${results.length} functional/aesthetic checks passed`);
  console.log(`  report: ${reportPath}`);
  process.exit(failed ? 1 : 0);
}
