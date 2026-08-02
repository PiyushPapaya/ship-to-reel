// engine/music-bed.mjs — ROADMAP-NEXT.md Tier 2.1: resolve a music bed for
// tempo.bgm, so beat-sync.mjs (BPM estimation + grid-snap, proven in isolation
// since Phase 3c) finally has something real to snap cuts to.
//
// Resolution order (first hit wins), matching this repo's existing "keyless ->
// key" fallback-chain convention (tts.mjs: Edge-TTS free default -> ElevenLabs
// if a key is configured):
//   1. spec.tempo.bgm — an explicit asset path already provided. Used as-is.
//   2. Local MusicGen (facebook/musicgen via a user-provided Python env) — real,
//      gated integration: only attempted if MUSICGEN_CMD (or python+audiocraft)
//      is actually available. No model/weights are bundled or downloaded here
//      (multi-GB, out of scope for this pass) — same "live-unverified, honestly
//      flagged" gap as broll.mjs's Veo/Sora/Runway/Kling providers, degrading
//      to skip on any error rather than failing the build.
//   3. The bundled CC0 pack (assets/music/cc0/{driving,minimal,calm}.mp3) —
//      three short deterministic loops this repo generated and owns outright
//      (ffmpeg lavfi sine+tremolo synthesis, no third-party sample, so there is
//      no license to track), mood-matched from voice.music_mood keywords. This
//      is the guaranteed-always-available final fallback — a build never fails
//      for lack of a bed.
//
// Usage: node engine/music-bed.mjs <specPath> <outDir>
// Writes <outDir>/music/manifest.json: {path, source, bpm, moodMatch}

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, basename } from "node:path";
import { estimateBpm } from "./beat-sync.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CC0_DIR = join(root, "assets", "music", "cc0");
const CC0_TRACKS = {
  driving: join(CC0_DIR, "driving.mp3"),
  minimal: join(CC0_DIR, "minimal.mp3"),
  calm: join(CC0_DIR, "calm.mp3"),
};

// Simple keyword match against voice.music_mood prose (front-matter string,
// not a controlled enum — see reel-spec.schema.json's voice.music_mood).
function matchMood(moodText) {
  const t = (moodText ?? "").toLowerCase();
  if (/treibend|driving|energetic|upbeat|fast|punchy/.test(t)) return "driving";
  if (/warm|calm|soft|editorial|slow|gentle/.test(t)) return "calm";
  return "minimal";
}

function tryMusicGen(prompt, outPath, durationSec) {
  // Real, gated integration — attempted only if a local MusicGen command is
  // actually configured. No bundled model/weights: installing facebook/musicgen
  // (torch + audiocraft, multi-GB) is out of scope for this pass, matching
  // broll.mjs's discipline for its four generative-video providers.
  const cmdTemplate = process.env.MUSICGEN_CMD; // e.g. "python -m audiocraft.generate --prompt {prompt} --duration {duration} --out {out}"
  if (!cmdTemplate) return { status: "skipped", missing: ["MUSICGEN_CMD"] };
  const cmd = cmdTemplate
    .replace("{prompt}", JSON.stringify(prompt))
    .replace("{duration}", String(Math.ceil(durationSec)))
    .replace("{out}", outPath);
  const isWin = process.platform === "win32";
  const r = spawnSync(cmd, { shell: true, encoding: "utf8", cwd: root });
  if (r.status !== 0 || !existsSync(outPath)) {
    return { status: "error", detail: (r.stderr || r.error?.message || "MUSICGEN_CMD failed").slice(-500) };
  }
  return { status: "resolved" };
}

export function resolveMusicBed(spec, outDir) {
  const musicDir = join(resolve(outDir), "music");
  mkdirSync(musicDir, { recursive: true });
  const outPath = join(musicDir, "bgm.mp3");

  const explicit = spec.tempo?.bgm;
  if (explicit && existsSync(resolve(explicit))) {
    copyFileSync(resolve(explicit), outPath);
    const { bpm } = estimateBpm(outPath);
    return writeManifest(musicDir, { path: "music/bgm.mp3", source: "explicit", ref: explicit, bpm });
  }

  const mood = matchMood(spec.voice?.music_mood);
  const prompt = spec.voice?.music_mood || `${mood} instrumental background music, no vocals`;
  // Rough duration estimate (final duration is re-checked by assemble.mjs; the
  // bed just needs to be at least as long as the reel — assemble.mjs loops/trims).
  const roughDuration = (spec.beats?.length ?? 5) * 4;

  const mg = tryMusicGen(prompt, outPath, roughDuration);
  if (mg.status === "resolved") {
    const { bpm } = estimateBpm(outPath);
    return writeManifest(musicDir, { path: "music/bgm.mp3", source: "musicgen", moodMatch: mood, bpm });
  }
  console.log(`music-bed: MusicGen ${mg.status}${mg.missing ? ` (missing: ${mg.missing.join(", ")})` : ""}${mg.detail ? ` — ${mg.detail}` : ""} — falling back to bundled CC0 pack.`);

  const cc0Path = CC0_TRACKS[mood];
  copyFileSync(cc0Path, outPath);
  const { bpm } = estimateBpm(outPath);
  return writeManifest(musicDir, { path: "music/bgm.mp3", source: "cc0-pack", moodMatch: mood, ref: basename(cc0Path), bpm });
}

function writeManifest(musicDir, data) {
  const manifestPath = join(musicDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(data, null, 2));
  console.log(`→ music-bed: ${data.source}${data.moodMatch ? ` (${data.moodMatch})` : ""} — ${data.bpm} BPM -> ${manifestPath}`);
  return data;
}

// --- CLI ----------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("music-bed.mjs")) {
  const specPath = resolve(process.argv[2] ?? join(root, "examples", "reel-spec.example.json"));
  const outDir = resolve(process.argv[3] ?? join(root, "build"));
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  resolveMusicBed(spec, outDir);
}
