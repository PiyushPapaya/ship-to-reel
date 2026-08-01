// distribute/tiktok.mjs — TikTok Content Posting API v2, direct FILE_UPLOAD flow.
// Gated on a TikTok for Developers app that has passed **Content Posting API app
// review** (PLAN.md §11: "TikTok = Content Posting API + App-Review" — the
// heaviest gate of the three). Not verified against the live API in this pass —
// no credentials/app review exist yet (see DECISIONS.md Phase 6); written against
// the documented init -> PUT upload flow, single chunk (fine for reel-length
// clips well under the API's chunk-size ceiling). Re-check the endpoint/limits
// against current docs before first real use.
//
// Required env: TIKTOK_ACCESS_TOKEN
// Optional env: TIKTOK_PRIVACY_LEVEL (default "SELF_ONLY" — never auto-publish public)

import { readFileSync, statSync } from "node:fs";
import { requireEnv, skipped, posted } from "./lib.mjs";

const REQUIRED = ["TIKTOK_ACCESS_TOKEN"];
const API = "https://open.tiktokapis.com/v2";

export async function postTikTok({ copy, videoPath }) {
  const { ok, missing } = requireEnv(REQUIRED);
  if (!ok) return skipped("tiktok", missing);

  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  const size = statSync(videoPath).size;

  const initRes = await fetch(`${API}/post/publish/video/init/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      post_info: {
        title: copy.tiktok.caption,
        privacy_level: process.env.TIKTOK_PRIVACY_LEVEL ?? "SELF_ONLY",
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: size,
        chunk_size: size,
        total_chunk_count: 1,
      },
    }),
  });
  const init = await initRes.json();
  if (!initRes.ok || init.error?.code !== "ok") {
    throw new Error(`tiktok upload init failed: ${initRes.status} ${JSON.stringify(init)}`);
  }
  const { upload_url, publish_id } = init.data;

  const uploadRes = await fetch(upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${size - 1}/${size}`,
    },
    body: readFileSync(videoPath),
  });
  if (!uploadRes.ok) throw new Error(`tiktok upload failed: ${uploadRes.status} ${await uploadRes.text()}`);

  return posted("tiktok", `publish_id=${publish_id}`);
}
