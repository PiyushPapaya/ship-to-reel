// engine/__tests__/quality-check.test.mjs — Tier 4.2: unit coverage for
// quality-check.mjs's real fail paths, using the MINIMAL fixture that triggers
// each one (per engine/quality-check.mjs, read in full):
//
//   - "render exists" (line ~66): if the mp4 path doesn't exist, it records a
//     failure and calls report()/exit(1) immediately, before touching ffmpeg.
//   - the aesthetic gate (line ~127 on): entirely driven by a `--scores <path>`
//     JSON file, independent of the actual video content — so a synthetic
//     scores.json is the correct minimal fixture for its two checks:
//       "aesthetic: avg >= 4.0"          (average of 7 dimensions below 4.0)
//       "aesthetic: every dimension >= 3" (one dimension below the floor)
//
// quality-check.mjs is a CLI script (not an importable module — it runs
// top-level code and calls process.exit()), so it's exercised as a real
// subprocess, same discipline as seam-gate.test.mjs. Each test also invokes the
// real `npx hyperframes lint` and `ffmpeg`/`ffprobe` subprocesses quality-check.mjs
// itself shells out to (nothing is mocked out) — that's why this file is slower
// than the others (a few seconds per test) but it's testing REAL behavior, not a
// stand-in for it. A deliberately corrupt (non-video) "mp4" is used for the
// aesthetic-gate tests since the aesthetic gate is fully decoupled from whether
// ffmpeg can actually decode the file — exactly the "fake/corrupt mp4" fixture
// the roadmap item itself calls out as sufficient.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const qualityCheck = join(root, "engine", "quality-check.mjs");

function run(args) {
  const r = spawnSync(process.execPath, [qualityCheck, ...args], { encoding: "utf8", cwd: root });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function tempProjectDir() {
  // A bare dir is enough for `hyperframes lint` to run (and correctly fail/complain
  // about no composition — that's fine, it's not what these tests assert on); the
  // point of these fixtures is the mp4/scores fail path, not the lint pass path.
  return mkdtempSync(join(tmpdir(), "reelbot-qc-"));
}

test("quality-check: fails immediately when the mp4 does not exist", () => {
  const dir = tempProjectDir();
  try {
    const missingMp4 = join(dir, "reel.mp4");
    const r = run([dir, missingMp4]);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /✗ render exists: /);
    assert.match(r.stdout, /no MP4 found — run engine\/render\.mjs first/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("quality-check: aesthetic gate fails when the average score is below 4.0", () => {
  const dir = tempProjectDir();
  try {
    const fakeMp4 = join(dir, "reel.mp4");
    writeFileSync(fakeMp4, Buffer.from("not a real mp4 file"));
    const scoresPath = join(dir, "scores.json");
    // Every dimension individually clears the >=3 floor, but the average (2.57)
    // sits below the 4.0 gate — isolates the avg check from the min-dimension
    // check (same real numbers DECISIONS.md Phase 4 used for its own first
    // honest scoring run, reused here as a realistic low score).
    writeFileSync(scoresPath, JSON.stringify({
      typography: 3, color: 3, composition: 2, hierarchy: 3,
      motion_flow: 2, consistency: 3, distinctiveness: 2,
    }));
    const r = run([dir, fakeMp4, "--scores", scoresPath]);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /✗ aesthetic: avg >= 4 \(got 2\.57\)/);
    assert.match(r.stdout, /avg score 2\.57 below threshold/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("quality-check: aesthetic gate fails when any single dimension is below 3", () => {
  const dir = tempProjectDir();
  try {
    const fakeMp4 = join(dir, "reel.mp4");
    writeFileSync(fakeMp4, Buffer.from("not a real mp4 file"));
    const scoresPath = join(dir, "scores.json");
    // avg is a healthy 4.14 (comfortably clears the 4.0 gate) but distinctiveness
    // = 2 is below the per-dimension floor of 3 — proves the two aesthetic
    // checks are independent gates, not just one combined average check.
    writeFileSync(scoresPath, JSON.stringify({
      typography: 5, color: 5, composition: 4, hierarchy: 4,
      motion_flow: 5, consistency: 4, distinctiveness: 2,
    }));
    const r = run([dir, fakeMp4, "--scores", scoresPath]);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /✓ aesthetic: avg >= 4 \(got 4\.14\)/);
    assert.match(r.stdout, /✗ aesthetic: every dimension >= 3/);
    assert.match(r.stdout, /lowest dimension = 2 \(< 3\)/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("quality-check: aesthetic scores file rejected when a dimension is missing/invalid", () => {
  const dir = tempProjectDir();
  try {
    const fakeMp4 = join(dir, "reel.mp4");
    writeFileSync(fakeMp4, Buffer.from("not a real mp4 file"));
    const scoresPath = join(dir, "scores.json");
    // "distinctiveness" is entirely absent — hits the missing/invalid-dimension
    // guard before the avg/min checks ever run.
    writeFileSync(scoresPath, JSON.stringify({
      typography: 5, color: 5, composition: 4, hierarchy: 4,
      motion_flow: 5, consistency: 4,
    }));
    const r = run([dir, fakeMp4, "--scores", scoresPath]);
    assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /✗ aesthetic scores: complete/);
    assert.match(r.stdout, /missing\/invalid: distinctiveness/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
