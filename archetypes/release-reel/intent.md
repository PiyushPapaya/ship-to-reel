# Intent — release-reel

Use this archetype when `source.kind` is `github_release` (a `release: published`
webhook, one or more merged PRs behind it) and the point is **"here's what
shipped"**, not a single defect being closed. Signals to look for: a tag/version
bump (`vX.Y.Z`), a release title that names capability ("Add …", "Support …")
rather than "fix:"/"revert:", and release notes with more than one bullet /
more than one merged PR referenced.

If the release is actually a single hotfix with one changed behavior, prefer
`bugfix-reel` instead — a whole release-shaped video around one patch overclaims
it. If there's no single release event at all (e.g. a standalone feature pitch
with no tag), prefer `promo-reel`.

## Shape of the story

1. **hook** — the version/name, stated flat (no "huge", no "massive" — see
   `brands/<slug>/voice.md` `forbidden`).
2. **context** — one sentence on why this release exists (the theme, not a
   changelog dump).
3. **feature** — the headline capability, the single thing worth the update.
4. **flow** — the top highlights as a short list (2-4 items, one line each) —
   *not* the full changelog. Uses the beat's repeatable-content shape
   (`slot.items`, rendered by `engine/scenes.mjs`'s generic fallback).
5. **result** — the release as a number: PRs merged, contributors, or a
   before/after metric if the source data has one (reuses `bugfix-reel`'s
   `result` generator — same metric/sub shape).
6. **outro** — fixed channel sign-off (`_shell` handles this; no per-project
   choice here).

## Where the data comes from

**Not yet wired.** `engine/collect.mjs` only implements `github_pr` today; a
`github_release` collector (pulling the release title/body/tag, and ideally
the merged-PR list behind it via `gh api repos/<o>/<r>/releases/tags/<tag>` +
cross-referencing merged PRs) is out of scope for this archetype and is
tracked separately — `.github/workflows/reel.yml`'s `release: published`
trigger is already wired but currently a documented no-op waiting on exactly
this collector (see `DECISIONS.md` Phase 5). Until it exists, this
archetype's placeholders (`release_line`, `release_summary`, `feature_title`,
`feature_body`, `highlights` — an array of short strings, `stat_metric`,
`stat_sub`) must be filled by hand or by a stand-in tokens file shaped like
`collect.mjs`'s output — `resolve-spec.mjs`'s generic `{{dot.path}}`
substitution doesn't care where the tokens object came from, only that the
keys match.
