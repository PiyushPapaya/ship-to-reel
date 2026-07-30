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
