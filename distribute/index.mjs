// distribute/index.mjs — Stufe 2 orchestrator (PLAN.md §6): posts a finished reel
// to every configured platform. Deliberately NOT wired into reel.yml — Stufe 2 is
// "später", a manual/local step run after you've set up a platform's gated access
// (see distribute/README.md), not an automatic CI trigger.
//
// Never hard-fails the whole run over one platform: each platform's own missing
// env vars or a live API error is caught and reported per-platform, then the
// summary always exits 0 — best-effort distribution, not a build gate.
//
// Usage: node distribute/index.mjs [copyPath] [videoPath]
//   defaults: build/distribution/copy.json, build/reel.mp4

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { postYouTube } from "./youtube.mjs";
import { postInstagram } from "./instagram.mjs";
import { postTikTok } from "./tiktok.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const copyPath = resolve(process.argv[2] ?? join(root, "build/distribution/copy.json"));
const videoPath = resolve(process.argv[3] ?? join(root, "build/reel.mp4"));

if (!existsSync(copyPath)) {
  console.error(`copy not found: ${copyPath} (run: npm run distribution-copy)`);
  process.exit(1);
}
if (!existsSync(videoPath)) {
  console.error(`video not found: ${videoPath} (run: npm run build)`);
  process.exit(1);
}

const copy = JSON.parse(readFileSync(copyPath, "utf8"));

const platforms = [
  ["youtube", postYouTube],
  ["instagram", postInstagram],
  ["tiktok", postTikTok],
];

const results = [];
for (const [name, post] of platforms) {
  try {
    results.push(await post({ copy, videoPath }));
  } catch (err) {
    console.error(`✗ ${name}: ${err.message}`);
    results.push({ platform: name, status: "error", error: err.message });
  }
}

console.log("\nDistribution summary:");
for (const r of results) {
  const extra = r.missing ? ` (missing ${r.missing.join(", ")})` : r.error ? ` (${r.error})` : "";
  console.log(`  ${r.platform}: ${r.status}${extra}`);
}

process.exit(0);
