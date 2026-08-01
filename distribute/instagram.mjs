// distribute/instagram.mjs — Instagram Graph API, Reels publishing flow.
// Gated on a Facebook Developer app + an IG **Business/Creator** account linked to
// a Facebook Page (PLAN.md §11: "IG = Business-Account + Graph API"). Not verified
// against the live API in this pass — no credentials exist yet (see DECISIONS.md
// Phase 6); written against the documented container -> poll -> publish flow.
// Re-check the Graph API version against current docs before first real use.
//
// The Graph API's `media_type: REELS` container requires a **publicly reachable**
// video_url — it cannot take a local file directly. This module does not host the
// video; point IG_VIDEO_PUBLIC_URL at wherever build/reel.mp4 already got uploaded
// (e.g. the CI artifact URL, or your own storage) before calling this.
//
// Required env: IG_ACCESS_TOKEN, IG_BUSINESS_ACCOUNT_ID, IG_VIDEO_PUBLIC_URL

import { requireEnv, skipped, posted } from "./lib.mjs";

const REQUIRED = ["IG_ACCESS_TOKEN", "IG_BUSINESS_ACCOUNT_ID", "IG_VIDEO_PUBLIC_URL"];
const API = "https://graph.facebook.com/v21.0";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120_000;

async function graph(path, params) {
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`instagram graph error at ${path}: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function waitUntilReady(creationId, accessToken) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await fetch(`${API}/${creationId}?fields=status_code&access_token=${accessToken}`);
    const json = await res.json();
    if (json.status_code === "FINISHED") return;
    if (json.status_code === "ERROR") throw new Error(`instagram container failed processing: ${JSON.stringify(json)}`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error("instagram container did not finish processing within timeout");
}

export async function postInstagram({ copy }) {
  const { ok, missing } = requireEnv(REQUIRED);
  if (!ok) return skipped("instagram", missing);

  const accessToken = process.env.IG_ACCESS_TOKEN;
  const igUserId = process.env.IG_BUSINESS_ACCOUNT_ID;

  const container = await graph(`${igUserId}/media`, {
    media_type: "REELS",
    video_url: process.env.IG_VIDEO_PUBLIC_URL,
    caption: copy.instagram.caption,
    access_token: accessToken,
  });

  await waitUntilReady(container.id, accessToken);

  const published = await graph(`${igUserId}/media_publish`, {
    creation_id: container.id,
    access_token: accessToken,
  });

  return posted("instagram", `id=${published.id}`);
}
