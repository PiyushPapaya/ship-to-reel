// engine/__tests__/seam-gate.test.mjs — Tier 4.2: unit coverage for seam-gate.mjs's
// real fail paths, using minimal hand-built HTML fixtures (not full assemble.mjs
// output) so each test isolates exactly one of the three invariants seam-gate.mjs
// actually checks per adjacent scene pair (see engine/seam-gate.mjs):
//   1. overlap > 0                       (cur.start < prev.start + prev.duration)
//   2. prev.track !== cur.track          (hyperframes rejects same-track overlap)
//   3. a tl.fromTo(...opacity: 0...) crossfade tween exists for the later scene
//
// seam-gate.mjs is a CLI script (parses argv, calls process.exit()), not an
// importable module with exported functions, so it's exercised as a real
// subprocess against each fixture — this proves the actual exit code and
// reported failure line, not just "the code looks right".

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const seamGate = join(root, "engine", "seam-gate.mjs");
const fixturesDir = join(here, "fixtures", "seam-gate");

function run(fixtureName) {
  const r = spawnSync(process.execPath, [seamGate, join(fixturesDir, fixtureName)], { encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test("seam-gate: fails when adjacent scenes do not overlap (hard cut)", () => {
  const r = run("overlap-fail.html");
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /✗ scene-0-hook -> scene-1-problem: overlaps \(seam, no hard cut\)/);
  // the OTHER two checks for this same pair must still pass — proves the
  // failure is specifically the overlap invariant, not a blanket false-fail.
  assert.match(r.stdout, /✓ scene-0-hook -> scene-1-problem: different tracks/);
  assert.match(r.stdout, /✓ scene-1-problem: has a crossfade-in tween/);
});

test("seam-gate: fails when overlapping scenes share the same track", () => {
  const r = run("same-track-fail.html");
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /✗ scene-0-hook -> scene-1-problem: different tracks \(1 vs 1\)/);
  assert.match(r.stdout, /✓ scene-0-hook -> scene-1-problem: overlaps/);
  assert.match(r.stdout, /✓ scene-1-problem: has a crossfade-in tween/);
});

test("seam-gate: fails when the later scene has no crossfade-in tween", () => {
  const r = run("missing-crossfade-fail.html");
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /✗ scene-1-problem: has a crossfade-in tween on \.scene-fill/);
  assert.match(r.stdout, /✓ scene-0-hook -> scene-1-problem: overlaps/);
  assert.match(r.stdout, /✓ scene-0-hook -> scene-1-problem: different tracks/);
});

test("seam-gate: fails cleanly with no matched scene clips at all", () => {
  const r = run("no-scenes.html");
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /✗ found 0 scene clips/);
});

test("seam-gate: passes (exit 0) on a real assemble.mjs output (regression baseline)", () => {
  // Uses the checked-in golden fixture from assemble.test.mjs — same file the
  // determinism/golden test pins — so this doubles as a cross-check that the
  // golden fixture itself still satisfies the seam contract.
  const golden = join(here, "fixtures", "golden.html");
  const r = spawnSync(process.execPath, [seamGate, golden], { encoding: "utf8" });
  assert.equal(r.status, 0, `expected exit 0 on golden fixture, got ${r.status}\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /\d+\/\d+ seam checks passed/);
  assert.doesNotMatch(r.stdout, /✗/);
});
