// engine/render.mjs — wrapper around `hyperframes render`, then verify the MP4.
// Renders build/index.html -> build/reel.mp4 (1080x1920) and asserts the output
// exists with the expected dimensions via ffprobe. Never trusts "render succeeded".
//
// Usage: node engine/render.mjs [dir] [output]
//   env: REEL_QUALITY (draft|standard|high, default draft), REEL_WORKERS (default 1)
//   Low-RAM machines: keep workers=1 (each Chrome worker ~256 MB).

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(process.argv[2] ?? join(root, "build"));
const output = resolve(process.argv[3] ?? join(dir, "reel.mp4"));
const quality = process.env.REEL_QUALITY ?? "draft";
const workers = process.env.REEL_WORKERS ?? "1";

const isWin = process.platform === "win32";
const npx = isWin ? "npx.cmd" : "npx";

// Under shell:true, args are concatenated unescaped — quote anything with spaces.
const q = (a) => (isWin && /[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

function run(cmd, args) {
  // shell:true is required on Windows (Node >=20 refuses to spawn .cmd/.bat directly).
  const r = spawnSync(cmd, isWin ? args.map(q) : args, { stdio: "inherit", cwd: root, shell: isWin });
  if (r.status !== 0) {
    console.error(`\n✗ command failed: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

console.log(`→ rendering ${dir} -> ${output} (quality=${quality}, workers=${workers})`);
run(npx, ["--yes", "hyperframes", "render", dir, "-o", output, "-q", quality, "-w", workers]);

// --- verify the artifact ------------------------------------------------------
if (!existsSync(output)) {
  console.error(`✗ expected output missing: ${output}`);
  process.exit(1);
}
const probe = spawnSync(
  "ffprobe",
  ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_read_frames",
   "-show_entries", "format=duration", "-of", "json", "-count_frames", output],
  { encoding: "utf8" }
);
if (probe.status !== 0) {
  console.error("✗ ffprobe failed:\n" + probe.stderr);
  process.exit(1);
}
const meta = JSON.parse(probe.stdout);
const stream = meta.streams?.[0] ?? {};
const bytes = statSync(output).size;
const dur = Number(meta.format?.duration ?? 0);

const okDims = stream.width === 1080 && stream.height === 1920;
const okSize = bytes > 10_000;
console.log(
  `\n  MP4: ${stream.width}x${stream.height}, ${dur.toFixed(2)}s, ` +
  `${stream.nb_read_frames ?? "?"} frames, ${(bytes / 1024).toFixed(0)} KB`
);
if (!okDims || !okSize) {
  console.error(`✗ verification failed (dims ${okDims ? "ok" : "WRONG"}, size ${okSize ? "ok" : "too small"})`);
  process.exit(1);
}
console.log("  ✓ render verified (1080x1920 portrait, non-empty)");
