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
  tries, then reports the transcript. **[NOT DONE]** — the scorer above only replaces the
  human in the loop; nothing yet reads a low dimension and picks a knob to change. Real
  follow-up work, not a small addition.
- **Fork (needs your call):** this spends API tokens per render. Cap it (frames sampled, max
  loop iterations) so a render has a bounded cost. **Resolved:** capped at 6 sampled frames
  per render (`--max-frames`); no loop exists yet to also cap iterations on.
- **Done when:** `quality-check.mjs --auto build/reel.mp4` produces a score with zero human
  input that tracks a human read within ~0.5, and the loop demonstrably lifts a 3.x render to
  ≥4.0 by changing the *video*, not the number. **Partially done** — the zero-human-input score
  now exists and is wired in; nobody has yet compared it against a human read for calibration
  (needs a real `ANTHROPIC_API_KEY` run against the existing 3.86 build), and the patch loop
  half is untouched.

### 1.2 Give it a real visual signature (the `distinctiveness` dimension, stuck at 3)
- `DECISIONS.md` 4c is blunt: "still a fairly generic clean SaaS launch template outside the
  hook." Beyond the ghost numeral, add a brand-driven signature: a grain/noise texture, a
  *signature transition* (not just crossfade), a recurring motion motif, a distinctive type
  treatment — all driven by a new `brand.signature` block so it varies per project.
- **Done when:** `distinctiveness` honestly reaches 4, and `projekt-a` vs `projekt-b` produce
  visibly different signatures, not a palette swap.

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

### 2.1 Wire beat-sync into cut timing
- `beat-sync.mjs` proves BPM + grid-snap in isolation but isn't wired — blocked on a music
  bed (a licensing call). Resolve the bed, add a `tempo.bgm` asset path (schema field already
  exists), then snap seam boundaries to the beat grid inside `assemble.mjs`.
- **Fork (needs your call):** music source — a CC0/royalty-free pack, or locally-generated
  (MusicGen, already an optional `hyperframes doctor` tool).
- **Done when:** cut boundaries measurably land on the beat grid, an audible bed is muxed,
  and `ffprobe` shows the audio stream alongside narration.

### 2.2 Real intro sting + outro card
- `channel.json` references `intro_sting` and `outro_card` but both are placeholders. Build
  the 0.8s signature auftakt and a real outro-card template in `templates/_shell/`.

---

## Tier 3 — Breadth (use more of what the schema already allows)

### 3.1 More archetypes (pure data, no engine changes)
- `release-reel` — also unblocks `reel.yml`'s `release: published` path, currently a
  documented no-op.
- `deep-dive` — a long cut, which *proves the "any length"* claim end-to-end.
- `promo-reel`. Each is just `archetypes/<name>/{intent.md, beats.json}` (+ a collector if
  the source differs). The schema and engine already support them.

### 3.2 More source kinds
- `resolve-spec`/`collect` only wire `github_pr`. The schema also allows `url` and `brief` —
  add those collectors so a website or a plain brief can drive a reel.

### 3.3 The `skills/` entrypoint (`PLAN.md` §8)
- Add `skills/make-reel/SKILL.md` (+ symlink discovery via `.claude/.agents/.opencode`) so
  reel-bot is invokable as an actual skill, not just a set of scripts.

---

## Tier 4 — Hardening & developer experience

### 4.1 Unify the CLI
- Every script has its own arg convention: `assemble`→dir, `seam-gate`→**file**,
  `render`→dir, `distribute`→`copy,video`. I tripped on this three times during
  verification. Add one `reel <cmd>` entrypoint (or at minimum make args consistent, always
  a project dir) so the pipeline is friction-free.

### 4.2 Engine tests beyond schema validation
- The "same spec → same bytes" determinism guarantee is *claimed* but not *tested*. Add a
  golden-file test: assemble a fixed spec, assert stable HTML output. Add unit coverage for
  `seam-gate` / `quality-check` fail paths so a regression fails a test, not a silent render.

### 4.3 Live-verify the gated paths (needs your credentials)
- `distribute/*` and `broll.mjs` are honestly "unverified against real accounts." One real
  IG/YT post and one real Veo/Sora clip would flip them from scaffold to proven. Until then
  they correctly stay flagged as untested.

### 4.4 Enforce the aesthetic gate in CI
- Once 1.1 lands, wire `quality-check.mjs --auto` into `reel.yml` so CI rejects a flat render
  instead of only checking functional health.

---

## Where I'd start

**1.1 first.** It's the keystone: until the scorer is automated, every other quality
improvement (1.2, 1.3, 2.1) is judged by hand, which doesn't scale and can't run in CI.
Automating it turns the whole `PLAN.md` §5 "critique → patch → re-render until it's not
flat" promise from aspirational into a real loop — and *then* 1.2/1.3/2.1 each get an
objective, hands-off verdict.

Sequence: **1.1 → 1.3 → 1.2 → 2.1** (automate the judge, feed it the biggest levers, then
tune), with Tier 3/4 as parallelizable fill-in.

**Two forks need your call before building:** the per-render token budget for the vision
scorer (1.1), and the music source for beat-sync (2.1, CC0 pack vs local MusicGen).
