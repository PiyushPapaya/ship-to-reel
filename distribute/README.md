# distribute/ — Stufe 2 (PLAN.md §6)

Posts a finished `build/reel.mp4` to YouTube / Instagram / TikTok. Deliberately
separate from `reel.yml` — each platform's API is gated behind its own setup, so
this stays a manual/local step until you've done that setup, per PLAN.md §11:

- **YouTube Data API v3** — a Google Cloud project with the YouTube Data API
  enabled, an OAuth client, and a one-time-obtained refresh token for your
  channel (`gcloud`/OAuth playground). Scope: `youtube.upload`.
- **Instagram Graph API** — an IG **Business or Creator** account linked to a
  Facebook Page, a Facebook Developer app, and a page access token with
  `instagram_content_publish`. The Reels container needs a **publicly
  reachable** video URL (Graph API can't take a local file) — host
  `build/reel.mp4` somewhere first (e.g. the CI artifact URL) and point
  `IG_VIDEO_PUBLIC_URL` at it.
- **TikTok Content Posting API** — a TikTok for Developers app that has passed
  **Content Posting API app review** (the heaviest gate of the three — expect
  this to take the longest).

None of this has been exercised against a live account yet (no credentials
exist in this repo/session) — each module is written against each platform's
currently documented flow, but treat the actual posting call as unverified
until you run it once for real. Re-check the endpoint version/limits against
current docs at that point (things move; see CLAUDE.md's Frische-Check rule).

## Usage

```sh
npm run distribution-copy   # build/reel-spec.json + build/tokens.json -> build/distribution/copy.json
npm run distribute          # posts to every platform with env vars set; skips the rest cleanly
```

Or run one platform directly, e.g. `node distribute/youtube.mjs` is not a CLI —
import `postYouTube` from `distribute/youtube.mjs`/`instagram.mjs`/`tiktok.mjs`
if you want to call a single platform in isolation.

## Env vars

| Var | Platform | Required? |
|---|---|---|
| `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` | YouTube | yes |
| `YT_PRIVACY_STATUS` | YouTube | no — default `private` |
| `IG_ACCESS_TOKEN`, `IG_BUSINESS_ACCOUNT_ID`, `IG_VIDEO_PUBLIC_URL` | Instagram | yes |
| `TIKTOK_ACCESS_TOKEN` | TikTok | yes |
| `TIKTOK_PRIVACY_LEVEL` | TikTok | no — default `SELF_ONLY` |

Missing vars for a platform are never a hard failure — `distribute/index.mjs`
skips that platform, logs which vars are missing, and still exits 0. Defaults
lean private/self-only on purpose: nothing here should be able to auto-publish
publicly the first time you wire in a real token.
