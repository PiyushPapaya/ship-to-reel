// engine/patch-loop.mjs — ROADMAP-NEXT.md Tier 1.1, second half: the
// "critique → patch → re-render until it's not flat" loop PLAN.md §5 promises.
// score-frames.mjs (first half of 1.1) automated *scoring*; this closes the loop
// by reading the weakest dimension score-frames.mjs names, mapping it to one
// concrete knob in assemble.mjs's render (see assemble.mjs's KNOB_DEFAULTS),
// nudging that knob, and re-running assemble -> seam-gate -> render ->
// quality-check until the aesthetic gate passes or --max-iters is hit.
//
// Knobs live in <outDir>/patch/knobs.json (assemble.mjs reads it, defaulting to
// 1 == the exact pre-patch-loop render, zero regression for any caller that
// never runs this script). This script is the only intended writer of that file.
//
// Usage:
//   node engine/patch-loop.mjs [specPath] [outDir] [--max-iters N] [--auto]
//                               [--mock-scores path.json]
//
// --auto (the real path): each iteration calls quality-check.mjs --auto, which
// calls score-frames.mjs against a real ANTHROPIC_API_KEY. Falls back to the
// existing "pending" state (loop exits without a verdict, same honest degrade
// as quality-check.mjs itself) if no key is configured — this script does not
// fake a vision-model score.
//
// --mock-scores path.json (test-only, never used by --auto): path to a JSON
// array of per-iteration score objects (same shape score-frames.mjs writes),
// consumed one per iteration via quality-check.mjs's existing --scores flag.
// This exists to prove the loop's control flow (weakest-dimension detection,
// knob selection, convergence, iteration cap) against a real re-render each
// pass, without spending API tokens or requiring a key — see DECISIONS.md
// "ROADMAP-NEXT.md 1.1b" for the verification trail. It does not simulate the
// vision model; it substitutes for it so the *loop*, not the *judge*, can be
// tested deterministically.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const DIMENSIONS = ["typography", "color", "composition", "hierarchy", "motion_flow", "consistency", "distinctiveness"];

// Which knob (see assemble.mjs's KNOB_DEFAULTS) a given weak dimension maps to,
// and which direction ("up" = increase the knob value) is expected to help.
// distinctiveness deliberately shares indexScale with composition — the ghost
// numeral is the only distinctiveness lever this pass has; a real fix is
// ROADMAP-NEXT.md 1.2's brand-signature work (grain/signature-transition/motif),
// tracked separately, not invented here.
const KNOB_BY_DIMENSION = {
  typography: { knob: "typeScale", dir: "up" },
  color: { knob: "glow", dir: "up" },
  composition: { knob: "indexScale", dir: "up" },
  hierarchy: { knob: "staggerBoost", dir: "up" },
  motion_flow: { knob: "parallaxBoost", dir: "up" },
  consistency: { knob: "seamBoost", dir: "up" },
  distinctiveness: { knob: "indexScale", dir: "up" },
};
const KNOB_DEFAULTS = { parallaxBoost: 1, seamBoost: 1, staggerBoost: 1, indexScale: 1, typeScale: 1, glow: 1 };
const KNOB_STEP = 0.15;
const KNOB_MIN = 0.5;
const KNOB_MAX = 1.8;

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
}
const flagVals = new Set([argValue("--max-iters"), argValue("--mock-scores")].filter(Boolean));
const positional = process.argv.slice(2).filter((a) => !a.startsWith("--") && !flagVals.has(a));

const specPath = resolve(positional[0] ?? join(root, "examples", "reel-spec.example.json"));
const outDir = resolve(positional[1] ?? join(root, "build"));
const maxIters = Number(argValue("--max-iters", "3"));
const autoScore = process.argv.includes("--auto");
const mockScoresPath = argValue("--mock-scores", null);
const mp4 = join(outDir, "reel.mp4");
const knobsPath = join(outDir, "patch", "knobs.json");
const logPath = join(outDir, "patch", "log.json");

const isWin = process.platform === "win32";
const npx = isWin ? "npx.cmd" : "npx";
const q = (a) => (isWin && /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
function run(cmd, cmdArgs) {
  return spawnSync(cmd, isWin ? cmdArgs.map(q) : cmdArgs, { cwd: root, shell: isWin, encoding: "utf8" });
}
function mustRun(label, cmd, cmdArgs) {
  const r = run(cmd, cmdArgs);
  if (r.status !== 0) {
    console.error(`✗ ${label} failed:\n${(r.stdout ?? "")}${(r.stderr ?? "")}`);
    process.exit(1);
  }
  return r;
}

function readKnobs() {
  if (!existsSync(knobsPath)) return { ...KNOB_DEFAULTS };
  try {
    const parsed = JSON.parse(readFileSync(knobsPath, "utf8"));
    return { ...KNOB_DEFAULTS, ...parsed };
  } catch {
    return { ...KNOB_DEFAULTS };
  }
}
function writeKnobs(knobs) {
  mkdirSync(dirname(knobsPath), { recursive: true });
  writeFileSync(knobsPath, JSON.stringify(knobs, null, 2));
}

let mockScores = null;
if (mockScoresPath) {
  mockScores = JSON.parse(readFileSync(resolve(mockScoresPath), "utf8"));
  if (!Array.isArray(mockScores)) {
    console.error("✗ --mock-scores file must be a JSON array of per-iteration score objects");
    process.exit(1);
  }
}

const transcript = [];

console.log(`→ patch-loop: ${specPath} -> ${outDir} (max ${maxIters} iterations, ${autoScore ? "--auto (real vision scorer)" : mockScores ? "--mock-scores (test harness)" : "no scoring source given"})`);

let finalStatus = "unresolved";
for (let iter = 1; iter <= maxIters; iter++) {
  console.log(`\n--- iteration ${iter}/${maxIters} ---`);
  const knobs = readKnobs();
  console.log(`  knobs: ${JSON.stringify(knobs)}`);

  mustRun("assemble", "node", [join(root, "engine", "assemble.mjs"), specPath, outDir]);
  mustRun("seam-gate", "node", [join(root, "engine", "seam-gate.mjs"), join(outDir, "index.html")]);
  mustRun("render", "node", [join(root, "engine", "render.mjs"), outDir, mp4]);

  let qcArgs = [join(root, "engine", "quality-check.mjs"), outDir, mp4];
  let iterScoresPath = null;
  if (mockScores) {
    iterScoresPath = join(outDir, "patch", `mock-scores-iter-${iter}.json`);
    const scored = mockScores[Math.min(iter - 1, mockScores.length - 1)];
    mkdirSync(dirname(iterScoresPath), { recursive: true });
    writeFileSync(iterScoresPath, JSON.stringify(scored, null, 2));
    qcArgs.push("--scores", iterScoresPath);
  } else if (autoScore) {
    qcArgs.push("--auto");
  }
  const qc = run("node", qcArgs);
  console.log((qc.stdout ?? "").trim());

  const reportPath = join(outDir, "quality", "report.json");
  if (!existsSync(reportPath)) {
    console.error("✗ quality-check produced no report — cannot continue the loop");
    process.exit(1);
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const aesthetic = report.aesthetic;

  const entry = { iteration: iter, knobs, aesthetic };
  transcript.push(entry);

  if (aesthetic.status === "pending") {
    console.log("  … aesthetic scoring is pending (no --auto key configured and no --mock-scores given) — loop cannot judge convergence, stopping.");
    finalStatus = "pending";
    break;
  }

  if (aesthetic.status === "pass") {
    console.log(`  ✓ aesthetic gate passed: avg ${aesthetic.avg} (>= ${aesthetic.threshold.avg}), min ${aesthetic.min} (>= ${aesthetic.threshold.min})`);
    finalStatus = "pass";
    break;
  }

  // fail → find the single weakest dimension, map it to a knob, nudge it.
  const dims = DIMENSIONS.map((d) => [d, aesthetic.dimensions[d]]).filter(([, v]) => Number.isFinite(v));
  dims.sort((a, b) => a[1] - b[1]);
  const [weakest, weakestScore] = dims[0];
  const mapping = KNOB_BY_DIMENSION[weakest];
  console.log(`  ✗ aesthetic gate failed: avg ${aesthetic.avg}, weakest = ${weakest} (${weakestScore}) → nudging knob "${mapping.knob}" ${mapping.dir}`);

  const nextKnobs = { ...knobs };
  const delta = mapping.dir === "up" ? KNOB_STEP : -KNOB_STEP;
  nextKnobs[mapping.knob] = Math.min(KNOB_MAX, Math.max(KNOB_MIN, round2((knobs[mapping.knob] ?? 1) + delta)));
  entry.patch = { dimension: weakest, knob: mapping.knob, from: knobs[mapping.knob] ?? 1, to: nextKnobs[mapping.knob] };
  writeKnobs(nextKnobs);

  if (iter === maxIters) {
    finalStatus = "exhausted";
    console.log(`  … reached --max-iters (${maxIters}) without clearing the gate.`);
  }
}

mkdirSync(dirname(logPath), { recursive: true });
writeFileSync(logPath, JSON.stringify({ generatedAt: new Date().toISOString(), specPath, outDir, maxIters, status: finalStatus, transcript }, null, 2));

console.log(`\npatch-loop finished: ${finalStatus}`);
console.log(`  transcript: ${logPath}`);
process.exit(finalStatus === "pass" ? 0 : finalStatus === "pending" ? 0 : 1);

function round2(n) { return Math.round(n * 100) / 100; }
