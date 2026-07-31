// engine/beat-sync.mjs — Phase 3c: BPM estimation + beat-grid snapping.
//
// Promotes the interrupted Phase 3c scratch attempt (build/audio-analysis/
// estimate-bpm.mjs — energy-based onset detection + autocorrelation over raw PCM)
// into a real engine module, plus a pure `snapBoundariesToBeat` function that
// aligns scene-cut timestamps to the nearest beat.
//
// Scope of THIS pass: prove both building blocks work in isolation (same
// discipline as Phase 3b's capture.mjs — verify before wiring into assemble.mjs's
// critical path). There is no real music-bed asset in this repo yet; sourcing one
// is a licensing/style decision out of scope here (same class of deferral as
// broll/Phase 7). Wiring `tempo.beat_sync` into assemble.mjs's actual cut timing
// once a bgm asset exists is tracked as follow-up, not done in this pass.
//
// Usage:
//   node engine/beat-sync.mjs <audioFile>              // estimate BPM
//   node engine/beat-sync.mjs --snap-test <bpm>         // print a demo snap

import { spawnSync } from "node:child_process";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SR = 11025;

// --- extract mono 16-bit PCM at SR Hz via ffmpeg (works on mp3/wav/webm/etc.) ---
export function extractPcm(audioPath, sampleRate = SR) {
  const pcmPath = join(tmpdir(), `beat-sync-${Date.now()}-${Math.random().toString(36).slice(2)}.pcm`);
  const res = spawnSync(
    "ffmpeg",
    ["-y", "-i", resolve(audioPath), "-ac", "1", "-ar", String(sampleRate), "-f", "s16le", pcmPath],
    { encoding: "utf8" }
  );
  if (res.status !== 0) {
    throw new Error(`ffmpeg PCM extraction failed: ${res.stderr?.slice(-800) ?? res.error?.message}`);
  }
  return pcmPath;
}

// --- energy-based onset detection + autocorrelation BPM estimate ----------------
export function estimateBpmFromPcm(pcmBuf, sampleRate = SR, { minBPM = 70, maxBPM = 175 } = {}) {
  const n = pcmBuf.length / 2;
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) samples[i] = pcmBuf.readInt16LE(i * 2) / 32768;

  const winSize = Math.round(sampleRate * 0.02); // 20ms windows
  const hop = winSize;
  const nWindows = Math.floor((n - winSize) / hop);
  const energy = new Float32Array(nWindows);
  for (let w = 0; w < nWindows; w++) {
    let sum = 0;
    const start = w * hop;
    for (let i = 0; i < winSize; i++) { const s = samples[start + i]; sum += s * s; }
    energy[w] = Math.sqrt(sum / winSize);
  }

  const onset = new Float32Array(nWindows);
  for (let w = 1; w < nWindows; w++) onset[w] = Math.max(0, energy[w] - energy[w - 1]);

  const frameRate = sampleRate / hop;
  const minLag = Math.floor((frameRate * 60) / maxBPM);
  const maxLag = Math.ceil((frameRate * 60) / minBPM);

  let bestLag = minLag, bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    for (let w = 0; w + lag < nWindows; w++) score += onset[w] * onset[w + lag];
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }

  const bpm = (frameRate * 60) / bestLag;
  return { bpm: Math.round(bpm * 10) / 10, durationSec: n / sampleRate };
}

export function estimateBpm(audioPath, opts) {
  const pcmPath = extractPcm(audioPath);
  try {
    const buf = readFileSync(pcmPath);
    return estimateBpmFromPcm(buf, SR, opts);
  } finally {
    if (existsSync(pcmPath)) unlinkSync(pcmPath);
  }
}

// --- pure beat-grid snapping -----------------------------------------------------
// boundaries: cumulative scene-cut timestamps, e.g. [0, 3.5, 7.2, 11.0] for 3 scenes.
// The first (0) and last boundary are anchors and never move; interior cuts snap
// to the nearest beat. Each snapped duration is clamped to a `floor` (e.g. a
// beat's narration length) so a snap can never cut off spoken narration.
export function snapBoundariesToBeat(boundaries, bpm, floors = []) {
  const beatInterval = 60 / bpm;
  const snapped = boundaries.map((b, i) => {
    if (i === 0 || i === boundaries.length - 1) return b;
    return Math.round(b / beatInterval) * beatInterval;
  });
  // Enforce monotonic, floor-respecting durations by pushing later boundaries
  // forward if a snap would otherwise violate a floor or ordering.
  for (let i = 1; i < snapped.length; i++) {
    const floor = floors[i - 1] ?? 0;
    const minBoundary = snapped[i - 1] + floor;
    if (snapped[i] < minBoundary) snapped[i] = minBoundary;
  }
  return snapped.map((b) => Math.round(b * 100) / 100);
}

// --- CLI --------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("beat-sync.mjs")) {
  const arg = process.argv[2];
  if (arg === "--snap-test") {
    const bpm = Number(process.argv[3] ?? 120);
    const demo = [0, 3.5, 7.2, 11.0];
    console.log(`beat interval @ ${bpm}bpm = ${(60 / bpm).toFixed(3)}s`);
    console.log("in:  ", demo);
    console.log("out: ", snapBoundariesToBeat(demo, bpm));
  } else if (arg) {
    const r = estimateBpm(resolve(arg));
    console.log(`estimated ${r.bpm} BPM over ${r.durationSec.toFixed(1)}s of audio (${arg})`);
  } else {
    console.error("usage: node engine/beat-sync.mjs <audioFile>");
    console.error("   or: node engine/beat-sync.mjs --snap-test <bpm>");
    process.exit(1);
  }
}
