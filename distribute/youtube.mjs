// distribute/youtube.mjs — YouTube Data API v3, resumable upload.
// Gated on a real Google Cloud OAuth client + a one-time-obtained refresh token
// (PLAN.md §11/§6: "YouTube Data API v3"). Not verified against the live API in
// this pass — no credentials exist yet (see DECISIONS.md Phase 6) — written
// against the documented resumable-upload flow; re-check the endpoint/scopes
// against current docs before first real use (Frische-Check, per CLAUDE.md).
//
// Required env: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN
// Optional env: YT_PRIVACY_STATUS (default "private" — never auto-publish public)

import { createReadStream, statSync } from "node:fs";
import { requireEnv, skipped, posted } from "./lib.mjs";

const REQUIRED = ["YT_CLIENT_ID", "YT_CLIENT_SECRET", "YT_REFRESH_TOKEN"];

async function refreshAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YT_CLIENT_ID,
      client_secret: process.env.YT_CLIENT_SECRET,
      refresh_token: process.env.YT_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status} ${await res.text()}`);
  const { access_token } = await res.json();
  return access_token;
}

export async function postYouTube({ copy, videoPath }) {
  const { ok, missing } = requireEnv(REQUIRED);
  if (!ok) return skipped("youtube", missing);

  const accessToken = await refreshAccessToken();
  const metadata = {
    snippet: {
      title: copy.youtube.title,
      description: copy.youtube.description,
      tags: copy.youtube.tags,
    },
    status: { privacyStatus: process.env.YT_PRIVACY_STATUS ?? "private" },
  };

  const size = statSync(videoPath).size;
  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(size),
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!initRes.ok) throw new Error(`youtube upload init failed: ${initRes.status} ${await initRes.text()}`);
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("youtube upload init: no resumable Location header returned");

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(size) },
    body: createReadStream(videoPath),
    duplex: "half",
  });
  if (!uploadRes.ok) throw new Error(`youtube upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
  const video = await uploadRes.json();
  return posted("youtube", `id=${video.id}`);
}
