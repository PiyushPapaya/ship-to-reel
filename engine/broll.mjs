// engine/broll.mjs — resolve spec.broll[] (PLAN.md §4 "echtes Material als Basis" /
// Phase 7) into real downloaded clips, one per configured generative-video provider.
// Optional ingredient, not a core step: only runs when reel-spec.json has a non-empty
// broll[] array (mirrors capture.mjs's spec.source.capture no-op pattern).
//
// Each provider is gated on its own env vars and never throws past its own item —
// same best-effort, degrade-to-"skipped" discipline as distribute/*.mjs (Phase 6):
// a machine with no video-gen credentials configured must still finish cleanly with
// an honest manifest, not fail the run. Written against each provider's currently
// documented REST flow (checked 2026-08-02); re-verify against current docs before
// first real use (Frische-Check, per CLAUDE.md) — none of these have been called
// against a live account in this repo, no credentials exist yet (same honest
// deferral as distribute/*.mjs in Phase 6).
//
// Providers (must match reel-spec.schema.json's broll.provider enum):
//   veo    — Gemini API predictLongRunning. Required: GEMINI_API_KEY (or VEO_API_KEY).
//   sora   — OpenAI Videos API. Required: OPENAI_API_KEY.
//            NB: OpenAI has announced the Sora 2 Videos API sunsets 2026-09-24 —
//            re-check developers.openai.com/api/docs/guides/video-generation before use.
//   runway — Runway text_to_video (Gen-4). Required: RUNWAYML_API_SECRET (or RUNWAY_API_KEY).
//   kling  — Kling AI text2video, JWT (HS256) auth. Required: KLING_ACCESS_KEY, KLING_SECRET_KEY.
//
// Output: <outDir>/broll/{provider}-{index}.mp4 per resolved item + manifest.json,
// a track assemble.mjs can later composite the same way Phase 4b composited
// capture.mjs's frames — that wiring is out of scope for this pass (see DECISIONS.md).
//
// Usage:
//   node engine/broll.mjs --spec build/reel-spec.json [--out build/broll]

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHmac } from "node:crypto";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60_000;

function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  return { ok: missing.length === 0, missing };
}

async function pollUntilDone(check, { intervalMs = POLL_INTERVAL_MS, timeoutMs = POLL_TIMEOUT_MS } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result !== undefined) return result;
    if (Date.now() > deadline) throw new Error(`polling timed out after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function downloadTo(url, destPath, extraHeaders = {}) {
  const res = await fetch(url, { headers: extraHeaders });
  if (!res.ok) throw new Error(`download failed: ${res.status} ${await res.text()}`);
  writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

// --- providers ------------------------------------------------------------------

async function resolveVeo({ prompt, destPath }) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.VEO_API_KEY;
  if (!apiKey) return { status: "skipped", missing: ["GEMINI_API_KEY"] };

  const model = process.env.VEO_MODEL ?? "veo-3.1-generate-preview";
  const base = "https://generativelanguage.googleapis.com/v1beta";

  const startRes = await fetch(`${base}/models/${model}:predictLongRunning?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instances: [{ prompt }], parameters: { aspectRatio: "9:16" } }),
  });
  if (!startRes.ok) throw new Error(`veo start failed: ${startRes.status} ${await startRes.text()}`);
  const { name: opName } = await startRes.json();

  const op = await pollUntilDone(async () => {
    const res = await fetch(`${base}/${opName}?key=${apiKey}`);
    if (!res.ok) throw new Error(`veo poll failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    return body.done ? body : undefined;
  });
  if (op.error) throw new Error(`veo generation failed: ${op.error.message}`);

  const uri = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error("veo: no video uri in completed operation response");
  await downloadTo(`${uri}&key=${apiKey}`, destPath);
  return { status: "resolved" };
}

async function resolveSora({ prompt, destPath }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { status: "skipped", missing: ["OPENAI_API_KEY"] };

  const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  const startRes = await fetch("https://api.openai.com/v1/videos", {
    method: "POST",
    headers,
    body: JSON.stringify({ model: process.env.SORA_MODEL ?? "sora-2", prompt, size: "720x1280", seconds: "8" }),
  });
  if (!startRes.ok) throw new Error(`sora start failed: ${startRes.status} ${await startRes.text()}`);
  const { id } = await startRes.json();

  const video = await pollUntilDone(async () => {
    const res = await fetch(`https://api.openai.com/v1/videos/${id}`, { headers });
    if (!res.ok) throw new Error(`sora poll failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    if (body.status === "failed") throw new Error(`sora generation failed: ${body.error?.message ?? "unknown error"}`);
    return body.status === "completed" ? body : undefined;
  });

  await downloadTo(`https://api.openai.com/v1/videos/${video.id}/content`, destPath, headers);
  return { status: "resolved" };
}

async function resolveRunway({ prompt, destPath }) {
  const apiKey = process.env.RUNWAYML_API_SECRET ?? process.env.RUNWAY_API_KEY;
  if (!apiKey) return { status: "skipped", missing: ["RUNWAYML_API_SECRET"] };

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Runway-Version": "2024-11-06",
  };
  const startRes = await fetch("https://api.dev.runwayml.com/v1/text_to_video", {
    method: "POST",
    headers,
    body: JSON.stringify({ model: process.env.RUNWAY_MODEL ?? "gen4_turbo", promptText: prompt, ratio: "720:1280", duration: 8 }),
  });
  if (!startRes.ok) throw new Error(`runway start failed: ${startRes.status} ${await startRes.text()}`);
  const { id } = await startRes.json();

  const task = await pollUntilDone(async () => {
    const res = await fetch(`https://api.dev.runwayml.com/v1/tasks/${id}`, { headers });
    if (!res.ok) throw new Error(`runway poll failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    if (body.status === "FAILED") throw new Error(`runway generation failed: ${body.failure ?? "unknown error"}`);
    return body.status === "SUCCEEDED" ? body : undefined;
  });

  const url = task.output?.[0];
  if (!url) throw new Error("runway: no output url in succeeded task");
  await downloadTo(url, destPath);
  return { status: "resolved" };
}

function klingJwt(accessKey, secretKey) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 };
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const signature = createHmac("sha256", secretKey).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

async function resolveKling({ prompt, destPath }) {
  const { ok, missing } = requireEnv(["KLING_ACCESS_KEY", "KLING_SECRET_KEY"]);
  if (!ok) return { status: "skipped", missing };

  const token = klingJwt(process.env.KLING_ACCESS_KEY, process.env.KLING_SECRET_KEY);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const startRes = await fetch("https://api.klingai.com/v1/videos/text2video", {
    method: "POST",
    headers,
    body: JSON.stringify({ model_name: process.env.KLING_MODEL ?? "kling-v1", prompt, aspect_ratio: "9:16", duration: "5" }),
  });
  if (!startRes.ok) throw new Error(`kling start failed: ${startRes.status} ${await startRes.text()}`);
  const { data } = await startRes.json();

  const result = await pollUntilDone(async () => {
    const res = await fetch(`https://api.klingai.com/v1/videos/text2video/${data.task_id}`, { headers });
    if (!res.ok) throw new Error(`kling poll failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    if (body.data?.task_status === "failed") throw new Error(`kling generation failed: ${body.data.task_status_msg ?? "unknown error"}`);
    return body.data?.task_status === "succeed" ? body.data : undefined;
  });

  const url = result.task_result?.videos?.[0]?.url;
  if (!url) throw new Error("kling: no video url in succeeded task");
  await downloadTo(url, destPath);
  return { status: "resolved" };
}

const PROVIDERS = { veo: resolveVeo, sora: resolveSora, runway: resolveRunway, kling: resolveKling };

// --- orchestration ----------------------------------------------------------------

export async function resolveBroll({ broll, outDir }) {
  mkdirSync(outDir, { recursive: true });

  const items = [];
  for (let i = 0; i < broll.length; i++) {
    const item = broll[i];
    const resolve = PROVIDERS[item.provider];
    if (!resolve) {
      items.push({ ...item, index: i, status: "error", error: `unknown provider "${item.provider}"` });
      continue;
    }

    const file = `${item.provider}-${i}.mp4`;
    const destPath = join(outDir, file);
    console.log(`broll[${i}] (${item.provider} @ ${item.at}): resolving...`);
    try {
      const result = await resolve({ prompt: item.prompt, destPath });
      if (result.status === "skipped") {
        console.log(`  ⏭  skipped — missing ${result.missing.join(", ")}`);
        items.push({ ...item, index: i, status: "skipped", missing: result.missing });
      } else {
        console.log(`  ✓ resolved -> ${file}`);
        items.push({ ...item, index: i, status: "resolved", file });
      }
    } catch (err) {
      console.error(`  ✗ error: ${err.message}`);
      items.push({ ...item, index: i, status: "error", error: err.message });
    }
  }

  const manifest = { generatedAt: new Date().toISOString(), items };
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

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("broll.mjs")) {
  const flags = parseArgs(process.argv.slice(2));
  if (!flags.spec) {
    console.error("usage: node engine/broll.mjs --spec <reel-spec.json> [--out build/broll]");
    process.exit(1);
  }
  const specPath = resolve(flags.spec);
  if (!existsSync(specPath)) {
    console.error(`spec not found: ${specPath}`);
    process.exit(1);
  }
  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const outDir = resolve(flags.out ?? "build/broll");

  if (!spec.broll?.length) {
    console.log("spec.broll is empty — nothing to resolve, skipping.");
    process.exit(0);
  }

  resolveBroll({ broll: spec.broll, outDir })
    .then((manifest) => {
      const failed = manifest.items.filter((i) => i.status === "error");
      console.log(`\nbroll: ${manifest.items.length} item(s) -> ${outDir}/manifest.json`);
      if (failed.length) process.exit(1); // best-effort per item, but a hard error is worth surfacing to the caller
    })
    .catch((err) => {
      console.error("broll failed:", err.message);
      process.exit(1);
    });
}
