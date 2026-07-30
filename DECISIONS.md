# DECISIONS.md

One-line records of small choices made while building reel-bot (per CLAUDE.md).
Big architectural forks go to the user; these are the small ones I made myself.

## Phase 0 — Foundation

- **Schema validates the *resolved* spec** (all `$ref` inlined), since that's the contract `assemble.mjs` will consume; authoring-time `$ref` forms are resolved by `resolve-spec.mjs` in Phase 2, not validated here.
- **One schema file with `$defs`** rather than separate channel/brand/voice schema files; the validator retrieves sub-validators by JSON-pointer (`#/$defs/<name>`). Keeps the base plate a single source of truth.
- **voice is authored as `voice.md` with YAML front matter** (the machine-readable knobs) plus prose; the schema's `$defs/voice` validates the front matter, prose stays human context. Both checkable and readable.
- **Renamed `verboten` → `forbidden`** in the voice schema/keys, matching the English-everywhere preference.
- **`brands/projekt-a/` kept as PLAN specifies** and filled with a neutral, real-token starter brand (a copy-me template) rather than fabricating a real client's brand colors.
- **`channel.handle` is a placeholder `@your_handle`** — the real handle is a data value for the user to fill; structure and 9:16 safe-area math are what Phase 0 fixes (top 220 / bottom 320 / right 120 at 1080×1920).
- **Verification via `engine/validate.mjs` (ajv 2020, strict)** run as `npm run validate`; also enforces `min ≤ max` on every range, which JSON Schema alone can't express. Negative-tested to confirm it rejects bad input.
- **Toolchain:** ajv + `yaml` as the only devDeps; no runtime deps yet. Node ≥ 22 (24.13 present), FFmpeg on PATH (8.1.2).
- **Repo layout note:** `Downloads/Reels` lives inside the larger `Downloads` git repo (git root = `Downloads`); commits stage only `Reels/**` paths.

## Phase 1 — One local render

- **Monolithic composition** (motion-shorts style): `assemble.mjs` emits ONE standalone `index.html` (root + one clip per beat + one paused GSAP timeline). Deferred sub-compositions to later — the `timeline_track_too_dense` lint note is advisory, not an error.
- **Scenes as JS generators** (`engine/scenes.mjs`), one per beat type (hook/problem/code-diff/result/outro) + a generic fallback, rather than per-type template folders. Keeps assembly deterministic and one file; `templates/_shell/shell.html` holds the outer skeleton + brand-token CSS + persistent watermark.
- **GSAP vendored locally** (copied into `build/` by assemble) instead of a CDN `<script>` — removes the CDN-compromise/SRI vector the security hook flagged and makes renders network-independent/deterministic.
- **Watermark has no `class="clip"`** so the runtime keeps it visible the whole video (per the data-attributes contract), instead of a full-span clip.
- **Sequential scenes on one track, fade-in entrance only.** No crossfades/seams yet — those are deliberately Phase 3 (Cinematic); Phase 1 accepts hard cuts to prove the pipeline.
- **Duration model:** per-scene = `beat.dur` (number, or range resolved by `tempo.pace`: fast→min, slow→max, medium→mid) else a per-type default × pace factor; root `data-duration` = sum. `meta.duration` range is advisory in Phase 1.
- **Darkened secondary text** (`.body` #3f3f46, code file/add/del) to clear all WCAG-AA contrast warnings — the `--muted` palette token is for lines/placeholders, not body copy.
- **render.mjs uses `shell:true` on Windows** (Node ≥20 refuses to spawn `npx.cmd` directly) with defensive arg-quoting; verifies the MP4 via ffprobe (1080×1920, non-empty) rather than trusting "render succeeded".
- **Proof:** `npm run build` → `build/reel.mp4`, verified 1080×1920, 11.90s, 357 frames. Lint 0 errors, validate 0 errors + all text passes WCAG AA.
