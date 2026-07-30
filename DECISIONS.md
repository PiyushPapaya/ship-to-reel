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

## Phase 2 — From real data

- **Ran as the main agent, no subagents** (user override for this phase — CLAUDE.md's Phase 2+ subagent guidance was explicitly skipped for this pass).
- **`collect.mjs` talks to GitHub only through `gh` via `execFileSync` with an argv array**, never a shell string — a hostile PR title or filename in the ref can't inject a command. Ref parsed with a strict `owner/repo#number` regex before any `gh` call.
- **One representative file per PR**, not the full diff: pick the largest non-lockfile change by additions+deletions, then take the first added/first removed line from its unified-diff `patch`, trimmed to 60 chars. A `code-diff` beat is a caption card, not a diff viewer — showing everything would blow the beat's duration and the schema's single-slot shape.
- **`collect.mjs` outputs display-ready strings** (`hook_line`, `problem_body`, …), not raw PR fields — keeps `archetypes/bugfix-reel/beats.json` pure data (placeholders only, no formatting logic), matching PLAN §3 ("Archetypen als Daten"). Formatting (label-joining, PR-body fallback, pluralizing "file/files") lives in `collect.mjs`, not in the template or in `resolve-spec.mjs`.
- **Placeholder syntax is `{{dot.path}}`**, resolved generically in `resolve-spec.mjs` (`fillTemplate`) against whatever tokens object it's given — not bugfix-reel-specific, so the next archetype (release-reel) reuses it unchanged.
- **`resolve-spec.mjs` re-validates the merged spec against `reel-spec.schema.json`** before returning it (same ajv-strict gate as `assemble.mjs`) — a broken merge fails loud at resolve time, not three steps later at render time.
- **`meta.duration` fixed to `"auto"`, `meta.format` defaults to `"9:16"`** (channel's layout call, per the merge rule) — no per-archetype duration math yet; `assemble.mjs` already derives real timing from `tempo.pace` + each beat's `dur` range.
- **`build/` is now fully gitignored** (was previously only `*.mp4`/`out/`/`dist/`); Phase 1's rendered HTML/PNG snapshots were untracked stragglers, not intentional check-ins.
- **Proof, end-to-end from a real merged PR** (not synthetic data): `node engine/collect.mjs anuraghazra/github-readme-stats#4709` → `resolve-spec.mjs` → `assemble.mjs` → `render.mjs` → `build/reel.mp4`, verified 1080×1920, 11.90s, 357 frames. `npm run validate` still 5/5 green (no regression on Phase 0/1 data).
