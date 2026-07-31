// engine/capture.mjs — screen-capture real UI as base footage (PLAN.md §4 "echtes
// Material als Basis", Phase 3). Only runs when reel-spec.json has source.capture=true.
//
// What gets captured: for source.kind === "github_pr", the PR's own conversation page
// (github.com/.../pull/N) — that IS real UI for a bugfix reel, and unlike a
// preview-deploy URL it's guaranteed to exist for every merged PR (no new schema
// field, no deploy-detection logic to build/maintain). The "Files changed" tab was
// tried first and rejected: GitHub renders it as a virtualized SPA view with no
// scrollable height in the DOM at load time (verified empirically — scrollHeight
// stayed pinned to viewport height), so it silently produced 4 identical frames.
// The conversation page is normal document flow and scrolls as expected.
// For source.kind === "url", captures that URL directly.
//
// Output: a short scroll-capture sequence of PNG frames + a manifest, written to
// <outDir>/capture/ — a track assemble.mjs can later composite as background footage
// for the hook/problem scene. Capture is a standalone, verifiable building block in
// this pass; wiring it into assemble.mjs's beat rendering is a separate step.
//
// Usage:
//   node engine/capture.mjs --spec build/reel-spec.json [--out build/capture]
//   node engine/capture.mjs --url https://example.com [--out build/capture]

import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const VIEWPORT = { width: 1080, height: 1920 }; // 9:16, matches the render preset
const SCROLL_STEPS = 4;
const STEP_DELAY_MS = 220; // let fonts/images settle before each shot

function urlForSource(source) {
  if (source.kind === "url") return source.ref;
  if (source.kind === "github_pr") {
    const m = /^([\w.-]+)\/([\w.-]+)#(\d+)$/.exec(source.ref ?? "");
    if (!m) throw new Error(`capture: source.ref must look like owner/repo#123, got: ${source.ref}`);
    const [, owner, repo, number] = m;
    return `https://github.com/${owner}/${repo}/pull/${number}`;
  }
  throw new Error(`capture: don't know how to derive a URL for source.kind "${source.kind}"`);
}

export async function capture({ url, outDir }) {
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });

  const frames = [];
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(STEP_DELAY_MS);

    const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
    const maxScroll = Math.max(0, scrollHeight - VIEWPORT.height);

    for (let i = 0; i < SCROLL_STEPS; i++) {
      const y = SCROLL_STEPS === 1 ? 0 : Math.round((maxScroll * i) / (SCROLL_STEPS - 1));
      await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
      await page.waitForTimeout(STEP_DELAY_MS);
      const file = `frame-${String(i).padStart(2, "0")}.png`;
      await page.screenshot({ path: join(outDir, file) });
      frames.push({ file, scrollY: y });
    }
  } finally {
    await browser.close();
  }

  const manifest = { url, viewport: VIEWPORT, capturedAt: new Date().toISOString(), frames };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

// --- CLI ----------------------------------------------------------------------
function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else { flags[key] = next; i++; }
    }
  }
  return flags;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("capture.mjs")) {
  const flags = parseArgs(process.argv.slice(2));
  const outDir = resolve(flags.out ?? "build/capture");

  let url = flags.url;
  if (!url) {
    if (!flags.spec) {
      console.error("usage: node engine/capture.mjs --spec <reel-spec.json> [--out build/capture]");
      console.error("   or: node engine/capture.mjs --url <url> [--out build/capture]");
      process.exit(1);
    }
    const specPath = resolve(flags.spec);
    if (!existsSync(specPath)) {
      console.error(`spec not found: ${specPath}`);
      process.exit(1);
    }
    const spec = JSON.parse(readFileSync(specPath, "utf8"));
    if (!spec.source?.capture) {
      console.log(`spec.source.capture is false — nothing to capture, skipping.`);
      process.exit(0);
    }
    url = urlForSource(spec.source);
  }

  capture({ url, outDir })
    .then((manifest) => {
      console.log(`captured ${manifest.frames.length} frames from ${url} -> ${outDir}`);
    })
    .catch((err) => {
      console.error("capture failed:", err.message);
      process.exit(1);
    });
}
