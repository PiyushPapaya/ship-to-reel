# ROADMAP-NEXT.md — improving reel-bot past "it renders"

The build roadmap (`PLAN.md` §10, phases 0–7) is complete and the engine renders
1080×1920 reels for free. This document is about the gap between **"works"** and
**"actually looks cinematic"** — and it's ordered by *how much each item moves the real
thing* (a video that doesn't look flat), not by breadth.

**The anchor fact:** the QA guardian honestly scores the current reel at **avg 3.86 / 5**,
below its own hard **4.0** gate, with `distinctiveness` and `composition` the weak
dimensions (`DECISIONS.md` Phase 4b/4c). The engine already *measures* its own flatness.
The whole plan below is about earning that score for real — never gaming it.

---

## Tier 1 — Close the honesty gap (make the guardian pass, legitimately)

The QA loop is half-built: `quality-check.mjs` extracts frames but a human/agent must score
them via `--scores`. That missing keystone is the highest-leverage work in the repo.

### 1.1 Automate the aesthetic scorer (vision model) → real critique→patch→re-render
- **What:** add `engine/score-frames.mjs` that sends the extracted `build/quality/frames/*.png`
  to a vision model (Claude with image input) against the existing 7-dimension rubric and
  returns the same `scores.json` shape `--scores` already consumes. The gate becomes fully
  automated; CI can finally enforce the aesthetic pass, not just the functional one.
  **[DONE]** — `engine/score-frames.mjs` ships (raw Messages API call, `claude-opus-5` default,
  capped at 6 sampled frames), and `quality-check.mjs --auto` wires it in, falling back to the
  existing "pending" state if no `ANTHROPIC_API_KEY` is configured. See `DECISIONS.md` →
  "ROADMAP-NEXT.md 1.1" for the verification trail.
- **Then the loop the plan promised becomes real** (`PLAN.md` §5): on fail, the model names
  the weakest dimension **and a concrete cause**; an auto-patch step applies one targeted
  change (a knob in `assemble.mjs`/`scenes.mjs`), re-renders, re-scores — until ≥4.0 or N
  tries, then reports the transcript. **[DONE]** — `engine/patch-loop.mjs` maps the weakest
  scored dimension to one of six new `assemble.mjs` knobs, nudges it, and re-runs
  assemble→seam-gate→render→quality-check up to `--max-iters`. See `DECISIONS.md` →
  "ROADMAP-NEXT.md 1.1b" for the verification trail.
- **Fork (needs your call):** this spends API tokens per render. Cap it (frames sampled, max
  loop iterations) so a render has a bounded cost. **Resolved:** capped at 6 sampled frames
  per render (`--max-frames`), and the patch loop is capped at `--max-iters` (default 3).
- **Done when:** `quality-check.mjs --auto build/reel.mp4` produces a score with zero human
  input that tracks a human read within ~0.5, and the loop demonstrably lifts a 3.x render to
  ≥4.0 by changing the *video*, not the number. **Loop mechanics fully verified** against real
  re-renders each iteration via a test-only `--mock-scores` harness (3.71 → 3.86 → 4.00, pass);
  the real vision-scorer path (`--auto`) is wired and CI-enforced (see 4.4) but still needs a
  real `ANTHROPIC_API_KEY` run for human-calibration comparison — no key exists in this repo/session.

### 1.2 Give it a real visual signature (the `distinctiveness` dimension, stuck at 3) — **[DONE]**
- `DECISIONS.md` 4c is blunt: "still a fairly generic clean SaaS launch template outside the
  hook." Beyond the ghost numeral, add a brand-driven signature: a grain/noise texture, a
  *signature transition* (not just crossfade), a recurring motion motif, a distinctive type
  treatment — all driven by a new `brand.signature` block so it varies per project.
- **Done when:** `distinctiveness` honestly reaches 4, and `projekt-a` vs `projekt-b` produce
  visibly different signatures, not a palette swap. **Done** — new optional `brand.signature`
  schema block (grain/transition/motif/type_treatment); `projekt-a` (wipe/corner-mark/mono-accent)
  and `projekt-b` (iris/scan-line/oversized-caps) render visibly distinct per `hyperframes
  snapshot`, not a palette swap. See `DECISIONS.md` → "ROADMAP-NEXT.md 1.2".

### 1.3 Composite B-roll into scenes (Phase 7's deliberately deferred half) — **[DONE]**
- `broll.mjs` resolves clips but `assemble.mjs` never composites them — same split as
  `capture.mjs` (3b → 4b). Wire resolved `broll[]` clips in as `<video class="clip">` depth
  backgrounds behind the hook/problem scenes, under the existing scrim, exactly like capture
  footage. **This is the actual film-look lever** `PLAN.md` §4 named.
- **Done when:** a spec with a `broll` item (a mock local clip if no API key) renders with
  real video motion behind the hook; `seam-gate` + `lint` stay green. **Done** —
  `assemble.mjs` now reads `<outDir>/broll/manifest.json` and, for each beat with a
  `status: "resolved"` item matching its `at`, emits a root-level `<video class="clip">`
  (hyperframes requires media to be a direct root child, never nested — see `DECISIONS.md`
  → "ROADMAP-NEXT.md 1.3" for why that shaped the design) positioned as the scene's depth
  layer, under the scrim, with its own drift+scale parallax tween. Verified with a mock
  local clip: `seam-gate` 13/13, `hyperframes lint`/`validate` 0 errors, a `snapshot` visually
  confirmed real per-frame motion, and a full render passed `quality-check.mjs` functional
  5/5 including the frozen-frame check.

---

## Tier 2 — Motion & audio that "sits"

### 2.1 Wire beat-sync into cut timing — **[DONE]**
- `beat-sync.mjs` proves BPM + grid-snap in isolation but isn't wired — blocked on a music
  bed (a licensing call). Resolve the bed, add a `tempo.bgm` asset path (schema field already
  exists), then snap seam boundaries to the beat grid inside `assemble.mjs`.
- **Fork (needs your call):** music source — a CC0/royalty-free pack, or locally-generated
  (MusicGen, already an optional `hyperframes doctor` tool). **Resolved: both** — user asked
  for a dual-source resolver, so `engine/music-bed.mjs` tries local MusicGen first (gated via
  `MUSICGEN_CMD`, no bundled model), then falls back to a bundled self-authored CC0 pack.
- **Done when:** cut boundaries measurably land on the beat grid, an audible bed is muxed,
  and `ffprobe` shows the audio stream alongside narration. **Done** — see `DECISIONS.md` →
  "ROADMAP-NEXT.md 2.1" for the verification trail.

### 2.2 Real intro sting + outro card — **[DONE]**
- `channel.json` references `intro_sting` and `outro_card` but both are placeholders. Build
  the 0.8s signature auftakt and a real outro-card template in `templates/_shell/`. **Done** —
  `assets/sting.json` + `templates/_shell/outro/v1/card.json`, both rendered as real seam-gated
  scenes, deliberately not brand-tokened (fixed channel identity). See `DECISIONS.md` →
  "ROADMAP-NEXT.md 2.2".

---

## Tier 3 — Breadth (use more of what the schema already allows)

### 3.1 More archetypes (pure data, no engine changes) — **[DONE]**
- `release-reel` — also unblocks `reel.yml`'s `release: published` path, currently a
  documented no-op (the archetype exists now; `collect.mjs` still has no `github_release`
  collector, flagged as a separate, smaller follow-up).
- `deep-dive` — a long cut, which *proves the "any length"* claim end-to-end. **Done** —
  50.6s vs `bugfix-reel`'s 10.7s, same pace machinery, zero engine changes.
- `promo-reel`. Each is just `archetypes/<name>/{intent.md, beats.json}` (+ a collector if
  the source differs). The schema and engine already support them.

### 3.2 More source kinds — **[DONE]**
- `resolve-spec`/`collect` only wire `github_pr`. The schema also allows `url` and `brief` —
  add those collectors so a website or a plain brief can drive a reel. **Done** —
  `collect.mjs` gained `collectUrl`/`collectBrief`, same tokens shape as the PR path.

### 3.3 The `skills/` entrypoint (`PLAN.md` §8) — **[DONE]**
- Add `skills/make-reel/SKILL.md` (+ symlink discovery via `.claude/.agents/.opencode`) so
  reel-bot is invokable as an actual skill, not just a set of scripts. **Done** — discovery
  via NTFS junctions (Windows fallback for a true symlink, hash-verified identical content).

---

## Tier 4 — Hardening & developer experience

### 4.1 Unify the CLI — **[DONE]**
- Every script has its own arg convention: `assemble`→dir, `seam-gate`→**file**,
  `render`→dir, `distribute`→`copy,video`. I tripped on this three times during
  verification. Add one `reel <cmd>` entrypoint (or at minimum make args consistent, always
  a project dir) so the pipeline is friction-free. **Done** — `bin/reel.mjs`, a thin dispatcher;
  every old per-script/npm invocation still works unchanged.

### 4.2 Engine tests beyond schema validation — **[DONE]**
- The "same spec → same bytes" determinism guarantee is *claimed* but not *tested*. Add a
  golden-file test: assemble a fixed spec, assert stable HTML output. Add unit coverage for
  `seam-gate` / `quality-check` fail paths so a regression fails a test, not a silent render.
  **Done** — `engine/__tests__/` (11 tests, `node:test`), deliberate-break-then-revert proof
  confirmed the tests actually catch regressions, not just pass tautologically.

### 4.3 Live-verify the gated paths (needs your credentials)
- `distribute/*` and `broll.mjs` are honestly "unverified against real accounts." One real
  IG/YT post and one real Veo/Sora clip would flip them from scaffold to proven. Until then
  they correctly stay flagged as untested. **Still not done** — deliberately out of scope for
  this pass (needs real distribution/video-gen credentials nobody has supplied); not silently
  worked around.

### 4.4 Enforce the aesthetic gate in CI — **[DONE]**
- Once 1.1 lands, wire `quality-check.mjs --auto` into `reel.yml` so CI rejects a flat render
  instead of only checking functional health. **Done** — `reel.yml`'s quality-check step now
  passes `--auto` + forwards `ANTHROPIC_API_KEY` from secrets; degrades to the pre-existing
  pending state (no behavior change) if the secret isn't configured.

---

## Status: everything except 4.3 is done

Every item in Tiers 1–4 is built and verified except **4.3** (live-verify `distribute/*` /
`broll.mjs` against real accounts and real video-gen credentials) — that one genuinely needs
credentials nobody has supplied yet, so it correctly stays flagged as untested rather than
faked. `1.1`'s real vision-scorer path (`--auto`) is wired end-to-end and CI-enforced (4.4),
but still needs a real `ANTHROPIC_API_KEY` run in this environment for human-calibration
comparison — no key exists in this repo/session, flagged honestly in `DECISIONS.md` rather
than simulated.

Original sequencing note (now historical): **1.1 → 1.3 → 1.2 → 2.1** (automate the judge,
feed it the biggest levers, then tune), with Tier 3/4 as parallelizable fill-in — is exactly
how this pass was actually executed (Tier 3/4's independent items ran in parallel via
subagents while 1.1b/1.2/2.1/2.2 were built sequentially by the coordinating session).

**Two forks were resolved by the user before building:** the per-render token budget for the
vision scorer (1.1) — capped at 6 frames, 3 patch-loop iterations — and the music source for
beat-sync (2.1) — resolved as **both** (MusicGen tried first, CC0 pack as guaranteed fallback),
not an either/or choice.
