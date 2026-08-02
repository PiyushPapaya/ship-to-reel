// engine/__tests__/assemble.test.mjs — Tier 4.2: "same spec -> same bytes" is a
// claim in assemble.mjs's own header comment ("Deterministic: same spec => same
// bytes"). This test actually proves it instead of trusting the comment.
//
// Two things are checked, deliberately kept separate:
//   1. Determinism: assembling the SAME spec twice, into two independent temp
//      dirs, must produce byte-identical index.html. This is the literal claim.
//   2. Regression: the current output must match a checked-in golden fixture
//      (fixtures/golden.html), so a *future* change to assemble.mjs/scenes.mjs
//      that silently alters the generated markup fails THIS test, not just a
//      cross-run comparison that would happily "pass" on new-but-still-stable
//      output.
//
// Non-determinism check (read the whole file, not skimmed): assemble.mjs has no
// Date.now()/Math.random()/crypto-random/process.pid anywhere in its output path.
// The only outDir-dependent inputs it reads are optional sidecar manifests
// (<outDir>/capture/manifest.json, <outDir>/broll/manifest.json,
// <outDir>/narration/manifest.json) — none of which exist in a fresh temp dir,
// so both runs below take the identical "silent build" code path. If any of
// those manifests existed, they could reintroduce nondeterminism (e.g. a
// capture screenshot path); this test deliberately assembles into bare temp
// dirs so that class of nondeterminism is out of scope, and instead pins the
// "no sidecar state" baseline byte-for-byte.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assemble } from "../assemble.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const specPath = join(root, "examples", "reel-spec.example.json");
const goldenPath = join(here, "fixtures", "golden.html");

function assembleToTemp() {
  const dir = mkdtempSync(join(tmpdir(), "reelbot-test-"));
  const result = assemble(specPath, dir);
  return { dir, html: readFileSync(result.out, "utf8"), result };
}

test("assemble: same spec -> same bytes across two independent runs", () => {
  const a = assembleToTemp();
  const b = assembleToTemp();
  try {
    assert.equal(a.html.length, b.html.length, "output length differs between runs");
    assert.equal(a.html, b.html, "index.html differs byte-for-byte between two runs of the same spec");
    assert.deepEqual(
      { duration: a.result.duration, scenes: a.result.scenes },
      { duration: b.result.duration, scenes: b.result.scenes }
    );
  } finally {
    rmSync(a.dir, { recursive: true, force: true });
    rmSync(b.dir, { recursive: true, force: true });
  }
});

test("assemble: output matches checked-in golden fixture (regression baseline)", () => {
  const { dir, html } = assembleToTemp();
  try {
    const golden = readFileSync(goldenPath, "utf8");
    assert.equal(html, golden, "assemble.mjs output no longer matches engine/__tests__/fixtures/golden.html — if this is an intentional change to assemble.mjs/scenes.mjs/templates, regenerate the fixture; otherwise this is a real regression");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
