# reel-bot

**Your own video engine.** Turn any project — a GitHub PR, a website, a brief — into a
brand-consistent vertical **reel of any length**, in **any layout**, with flowing
animation, real captured footage, a chosen style/voice/tempo, and a QA guardian that
rejects flat "slideshow" output.

It renders **for free**: HTML/CSS/SVG + GSAP animation → MP4 via
[HyperFrames](https://www.npmjs.com/package/hyperframes) and FFmpeg, with narration from
free Edge-TTS. No paid API keys are required for the core pipeline. Paid providers
(ElevenLabs voices, Veo/Sora/Runway/Kling B-roll, platform auto-posting) are strictly
optional and degrade to a clean skip when their credentials are absent.

---

## Why this is different

Most "reel generator" tools do the same thing: line up catalog scenes → render. It works,
but it looks like tiles in a row — because that *is* the architecture. reel-bot adds three
layers no single catalog tool has together:

1. **One base plate** (`reel-spec.schema.json`) that every borrowed building block snaps
   onto — instead of stitching foreign schemas side by side.
2. **A cinematic layer** — one continuous master timeline with *enforced* crossfade seams
   (hard jump-cuts are a build failure), real screen-capture footage composited under the
   graphics, and beat-sync building blocks. This is the jump from "slides" to "film".
3. **A hard style/voice/tempo dial** (channel + brand + voice + tempo as data) plus a QA
   loop that scores on *"flowing, not flat"* and fails the build when it isn't.

**Honest ceiling:** HTML motion graphics top out at "high-end motion graphics," not
Runway/Sora photorealism. True film-look comes only from generative B-roll clips (Phase 7),
which HyperFrames merely *composites* — so B-roll is an optional ingredient, never the core.

---

## How it's built — the five ideas

### 1. The base plate — `reel-spec.schema.json`
A single JSON Schema (2020-12, strict) is the contract the whole engine speaks. A resolved
`reel-spec.json` carries five sections: `meta` (id, duration, format, archetype),
`channel`, `brand`, `voice`, `tempo`, `source`, `beats[]`, and optional `broll[]`. Every
borrowed building block is *adapted* until it fits this one schema — the schema is the
translator between otherwise-incompatible foreign formats. `engine/validate.mjs` gates it
(ajv strict, plus `min ≤ max` range checks JSON Schema alone can't express).

### 2. Two branding layers
- **Layer A — `channel.json`** (constant, your IG/YT/TikTok identity): handle, 9:16 safe
  areas, watermark, caption style, outro card. Write once, never touch again.
- **Layer B — `brands/<slug>/`** (per project): `brand.json` (palette, fonts, radii, logo)
  + `voice.md` (tone, pacing, lexicon, forbidden words, music mood, narration person).

**Merge rule (hard-wired):** layout/format → **channel always wins**; colour/font/motion/
voice → **brand+voice win**; captions are the edge case — *position/size* from channel,
*accent colour* from brand. Every video stays recognizably yours while adapting to the
project. New project = new `brands/` folder, zero engine changes (proven with a deliberately
contrasting `projekt-b`).

### 3. Archetypes as data
Story shape lives in `archetypes/<name>/` as files the agent only *fills* — `intent.md`
(when this archetype fits), `beats.json` (the scene sequence with slot ranges → drives
length). Little input → short reel; lots of input → long cut. Same spec, different length.
`bugfix-reel` is the shipped, end-to-end-proven archetype.

### 4. The cinematic layer
Premium doesn't come from more scene types — it comes from four things catalog tools skip:
- **Master timeline, not segments** — one paused GSAP timeline across the whole video.
- **Enforced seams** — `engine/seam-gate.mjs` re-parses the assembled HTML and *fails the
  build* if any adjacent scene pair lacks a positive overlap + crossfade tween on separate
  tracks. Biggest single lever from "slide" to "film".
- **Real material** — `engine/capture.mjs` scroll-captures the actual GitHub PR page; the
  hook scene composites it as a depth background with a legibility scrim.
- **Beat-sync** — `engine/beat-sync.mjs` proves BPM estimation + beat-grid snapping
  (isolated building block; not wired into cut timing until a licensed music bed exists).

### 5. The QA guardian
"Generating is not finishing." `engine/quality-check.mjs` runs two passes:
- **Functional (fully automated):** `hyperframes lint`, ffprobe dimensions/duration, and
  frame-hash uniqueness to catch a frozen render. Never trusts "render succeeded".
- **Aesthetic (scored):** extracts frames and enforces a threshold *harder* than the tools
  it borrows from (avg ≥ 4.0, every one of 7 dimensions ≥ 3). Scored by whoever drives the
  build via `--scores`, since no vision model is wired into the repo.

---

## Data flow (a bugfix reel, end-to-end)

```
PR merged
 → collect.mjs        gh api → {title, labels, diffstat, author} → tokens.json
 → resolve-spec.mjs   channel + brands/<slug> + archetypes/bugfix-reel + tempo
                      → reel-spec.json   (merge rule above, re-validated)
 → capture.mjs        (if UI) scroll-capture the PR page as base footage
 → tts.mjs            free Edge-TTS (or ElevenLabs if key) → narration + word timestamps
 → assemble.mjs       reel-spec + _shell → ONE index.html (master timeline, seams)
 → seam-gate.mjs      assert every seam is a real crossfade, or fail
 → align-captions.mjs word-accurate rolling captions wired into the timeline
 → render.mjs         hyperframes render → reel.mp4 (1080×1920), verified via ffprobe
 → quality-check.mjs  frames + flow score; fail → root-cause → patch → re-render
 → distribution-copy  per-platform title/description/tags (free, voice-checked)
 → distribute/        Stufe 2, gated: IG / YouTube / TikTok (manual, optional)
```

---

## Quickstart (free, no keys)

Requirements: **Node ≥ 22**, **FFmpeg on PATH**, `npx hyperframes doctor` green.

```bash
npm install

# Full free render from the bundled example spec:
node engine/assemble.mjs   examples/reel-spec.example.json build/proof
node engine/seam-gate.mjs  build/proof/index.html
node engine/render.mjs     build/proof build/proof/reel.mp4      # → 1080×1920 MP4
node engine/quality-check.mjs build/proof build/proof/reel.mp4   # functional gate

# Free narration (Edge-TTS, no API key):
node engine/tts.mjs --text "shipping beats perfect." --out build/proof/narration

# From a real merged PR:
node engine/collect.mjs      owner/repo#123
node engine/resolve-spec.mjs --brand projekt-a --archetype bugfix-reel
# → then assemble → seam-gate → render → quality-check as above
```

### Unified CLI (`bin/reel.mjs`)

Every script above has its own argv convention (`assemble` takes a dir, `seam-gate`
takes a file, `distribute` takes two file paths, ...) — that's still true and every
command above still works exactly as documented. `bin/reel.mjs` is an additive thin
dispatcher (ROADMAP-NEXT.md Tier 4.1) that normalizes all of them to "primary
positional arg = one project/build dir", translating that into whatever the
underlying script actually expects, and passing any extra flags straight through:

```bash
node bin/reel.mjs assemble       build/proof examples/reel-spec.example.json
node bin/reel.mjs seam-gate      build/proof            # resolves to build/proof/index.html
node bin/reel.mjs render         build/proof
node bin/reel.mjs quality-check  build/proof
node bin/reel.mjs score-frames   build/proof            # resolves to build/proof/quality/frames

# or the combined pipeline in one call: assemble -> seam-gate -> align-captions -> render
node bin/reel.mjs build build/proof examples/reel-spec.example.json
```

Also available as `npm run reel -- <cmd> [dir] [...args]` and, once installed, `npx reel <cmd> [dir]`
(see the `bin`/`scripts` entries in `package.json`). Run `node bin/reel.mjs --help` for
the full command list.

`npm run validate` runs the schema gate (7/7). See `package.json` scripts for shortcuts
(`assemble`, `render`, `quality-check`, `distribution-copy`, …).

---

## Free vs. optional (gated)

| Capability | Cost | Behaviour without credentials |
|---|---|---|
| Assemble → seam-gate → render → MP4 | **free** | works |
| Narration (Edge-TTS) | **free** | works |
| Captions, quality gate, distribution copy | **free** | works |
| Narration (ElevenLabs) | key | falls back to free Edge-TTS |
| B-roll (Veo / Sora / Runway / Kling) | key | that `broll[]` item is `skipped`, exit 0 |
| Auto-post (IG / YouTube / TikTok) | OAuth | each platform logs `skipped`, exit 0 |

Everything gated follows one discipline: **missing config → log + skip + exit 0**, never a
hard build failure. Live posting/B-roll has *not* been verified against real accounts (no
credentials exist) — this is stated plainly, not presented as tested. Re-check each
provider's current API before a first real run.

---

## Repo layout

```
reel-spec.schema.json     ★ the base plate — everything snaps onto this
channel.json              Layer A: your channel identity
brands/<slug>/            Layer B: brand.json + voice.md per project (projekt-a, projekt-b)
archetypes/bugfix-reel/   story as data: intent.md + beats.json
templates/_shell/         master-timeline skeleton + watermark + outro + brand-token CSS
bin/reel.mjs               unified CLI dispatcher — one project dir for every subcommand (Tier 4.1)
engine/
  validate.mjs            schema + range gate
  collect.mjs             gh CLI → source tokens (argv array, no shell injection)
  resolve-spec.mjs        channel+brand+voice+archetype+tempo → reel-spec.json (merge)
  scenes.mjs              deterministic per-beat HTML generators
  assemble.mjs            reel-spec + _shell → one index.html
  seam-gate.mjs           enforce crossfade seams (fails on hard cuts)
  capture.mjs             scroll-capture the PR page as base footage
  tts.mjs                 Edge-TTS (free) / ElevenLabs → narration + word timestamps
  align-captions.mjs      word-accurate rolling captions into the timeline
  beat-sync.mjs           BPM estimate + beat-grid snap (building block)
  render.mjs              hyperframes render → mp4, verified via ffprobe
  quality-check.mjs       functional + aesthetic QA passes
  broll.mjs               Veo/Sora/Runway/Kling clips (gated ingredient)
  generate-distribution-copy.mjs   per-platform copy, voice-checked
distribute/               Stufe 2: gated IG/YouTube/TikTok posting (manual)
.github/workflows/reel.yml  CI: merged-PR → render → artifact + Slack
```

---

## Status

The build roadmap (`PLAN.md` §10, phases 0–7) is **complete and verified** — schema,
one-render, real-data path, cinematic layer, QA guardian, CI + multi-brand, distribution
copy, and B-roll providers. Each phase's proof (real renders, not "should work") is logged
in `DECISIONS.md`.

Deliberately deferred, tracked as follow-up (not silently skipped): compositing B-roll into
scenes, wiring beat-sync into cut timing (needs a licensed music bed), a `release-reel`
archetype, and an automatable aesthetic scorer (needs a vision model). See `DECISIONS.md`
for the honest boundary on each.

---

## License / provenance

reel-bot is assembled from *adapted* building blocks (motion-shorts, pitchkit, hyperframes,
brag, and others — see `PLAN.md` §7 for the block-by-block source and license table). Each
block was reshaped to fit `reel-spec.json`, not copy-pasted. At runtime only this repo's own
code runs.
