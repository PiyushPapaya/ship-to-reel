---
name: make-reel
description: Build a branded, vertical (1080x1920) MP4 "reel" from a real source (a merged GitHub PR today; other archetypes are wired but not yet built end-to-end) using reel-bot's own engine -- no third-party video tool, no guessing at CLI flags. Use when someone says "/make-reel", "build the reel for this PR", "render a bugfix-reel", or wants a reel-bot MP4 produced from a real source rather than by hand-editing HTML.
---

# make-reel

reel-bot turns a real source (right now: a merged GitHub PR -- `bugfix-reel` is
the only archetype/collector built end-to-end so far; `promo-reel`,
`release-reel`, `deep-dive` exist as archetype data under `archetypes/` but
have no collector wired yet) into a short, branded, vertical video by walking
its own deterministic pipeline: **collect -> resolve-spec -> assemble ->
seam-gate -> align-captions -> render -> quality-check**.

This file is instructions only -- no code. Every command below is the real
invocation these scripts take today (verified against `package.json`'s
`scripts` block, each script's own top-of-file usage comment, and the
authoritative sequence `.github/workflows/reel.yml` actually runs in CI).
Do not invent flags; if a script's usage comment and this file ever disagree,
trust the script.

## Important: `npm run build` is NOT the real pipeline

`npm run build` (`assemble.mjs && seam-gate.mjs && align-captions.mjs &&
render.mjs`) is a convenience chain that defaults to
`examples/reel-spec.example.json` -- a fixture, not a real reel-spec. It skips
`collect` and `resolve-spec` entirely. **CI never uses it.**
`.github/workflows/reel.yml` calls each engine script explicitly, in this
order, with real args (see DECISIONS.md: "`npm run build`'s hardcoded
example-spec path is not what CI uses"). Follow the CI sequence below, not
`npm run build`, whenever the goal is a real reel from a real source.

## Inputs this skill needs

| Input | What it is | Where it comes from |
|---|---|---|
| Source kind | Today: a merged PR (`owner/repo#number`). Other archetypes have no collector yet. | The caller/user |
| Brand slug | Which brand config to apply | `brands/<slug>/brand.json` + `brands/<slug>/voice.md` (e.g. `projekt-a`, `projekt-b`) |
| Archetype | Which beat structure to render | `archetypes/<name>/{intent.md,beats.json,prompts/}` (only `bugfix-reel` has a working collector today) |
| `channel.json` | Channel-level brand: handle, watermark, safe areas, caption style, intro/outro | Repo root, already checked in -- read it, don't invent values |
| `GH_TOKEN` | GitHub auth for `gh` CLI (used by `collect.mjs`) | Environment (CI: `secrets.GITHUB_TOKEN`) |

## The real pipeline, in order

All paths are relative to the repo root. This mirrors `.github/workflows/reel.yml`
exactly (the `pull_request` / `bugfix-reel` path -- the only one built so far).

```bash
# 0. Sanity: schema fixtures still valid before touching real data
npm run validate                      # -> node engine/validate.mjs

# 1. Collect real source data (PR only, today)
node engine/collect.mjs "<owner>/<repo>#<number>" build/tokens.json
#    requires GH_TOKEN in env; writes build/tokens.json

# 2. Resolve the full spec: channel + brand + voice + archetype + tokens -> ONE reel-spec.json
node engine/resolve-spec.mjs \
  --archetype bugfix-reel \
  --brand projekt-a \
  --tokens build/tokens.json \
  --out build/reel-spec.json
#    optional flags (see resolve-spec.mjs usage comment): --format 9:16, --pace fast|medium|slow, --capture

# 3. Assemble: reel-spec.json + _shell + scenes -> deterministic index.html
node engine/assemble.mjs build/reel-spec.json build/

# 4. Seam gate: re-parses the ASSEMBLED build/index.html, fails the build on any hard cut
node engine/seam-gate.mjs build/index.html

# 5. Align captions (only if narration exists -- no-ops cleanly otherwise)
node engine/align-captions.mjs build/ build/reel-spec.json

# 6. Render: wraps `hyperframes render`, verifies the MP4 via ffprobe
REEL_QUALITY=standard REEL_WORKERS=1 node engine/render.mjs build/ build/reel.mp4
#    REEL_QUALITY: draft|standard|high (default draft). Low-RAM machines: keep REEL_WORKERS=1.

# 7. Quality check: functional gate always; aesthetic gate if you can score it
node engine/quality-check.mjs build/ build/reel.mp4 --auto
#    --auto (ROADMAP-NEXT Tier 1.1) runs engine/score-frames.mjs against the
#    extracted frames and feeds its scores.json back in automatically -- this
#    is how an agent (not a human) closes the aesthetic loop. Needs
#    ANTHROPIC_API_KEY; without one it degrades to "pending", never fails the
#    build on its own. Without --auto, quality-check only runs the functional
#    gate (lint, frame-hash/frozen-render check, dimension/frame-count check)
#    unless you pass --scores path.json yourself.
```

Prerequisites CI also does before any of the above, worth replicating locally
if the environment is fresh: `ffmpeg` installed, `npx hyperframes browser
ensure`, `npx hyperframes doctor`.

### If narration/TTS is in scope

`align-captions.mjs` only does anything if `<buildDir>/narration/manifest.json`
exists. If the archetype calls for narration, run `node engine/tts.mjs`
(see its own top-of-file usage comment for exact args) before step 5, and
optionally `node engine/beat-sync.mjs` before rendering.

### B-roll (optional, gated)

If the spec calls for generated b-roll clips (Veo/Sora/Runway/Kling), run
`node engine/broll.mjs` (see its usage comment) before step 3 -- `assemble.mjs`
composites resolved `broll[]` clips into their scenes if present.

## What the caller gets back

- `build/reel.mp4` -- 1080x1920 vertical MP4, seam-gated (no hard cuts),
  caption-aligned if narration was in scope.
- `build/quality/report.json` -- the quality-check scorecard: functional gate
  result (pass/fail) plus the aesthetic gate (7 dimensions, 1-5 each,
  threshold avg >= 4.0 / every dimension >= 3) if `--auto` or `--scores` was used.
- `build/quality/frames/*.png` -- the extracted frames the aesthetic gate scored.
- `build/reel-spec.json` and `build/tokens.json` -- the resolved spec and raw
  source data, kept for debugging/reproducibility (same spec -> same
  `index.html` bytes, by design).

A failing seam-gate, a failing functional quality-check, or an aesthetic
score below threshold all mean the reel is not done -- "generating is not
finishing" (PLAN.md §5). Fix the underlying cause and re-run from the failed
step forward; do not ship a reel a gate rejected.

## Distribution (Stufe 1 today)

Nothing in this skill auto-posts anywhere. Today's CI (`reel.yml`) uploads
`build/reel.mp4` as a workflow artifact and posts a Slack notification
pointing at it; a human posts it manually. `npm run distribution-copy`
(`engine/generate-distribution-copy.mjs`) can generate per-platform
title/description/tags/captions from `build/reel-spec.json` +
`build/tokens.json` if that's needed next. `npm run distribute`
(`distribute/index.mjs`) exists but is gated behind real platform
credentials (IG Business + Graph API, YouTube Data API v3, TikTok Content
Posting API) and is explicitly unverified against real accounts -- do not
treat it as ready without those credentials in place.
