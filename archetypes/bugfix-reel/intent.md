# Intent — bugfix-reel

Use this archetype when `source.kind` is `github_pr` (or `github_release` for a
patch release) and the change is a **fix**, not a feature launch: the PR title,
labels, or diffstat signal a bug/regression/incident being closed out, not new
capability being announced. Signals to look for: labels like `bug`, `fix`,
`hotfix`, `regression`, `ci`; a small-to-medium diffstat (a few files); a title
starting with `fix:` / `revert:` / `patch:`.

If the PR reads as a feature ("feat:", new UI, new endpoint) or a release with
many merged PRs behind it, prefer `release-reel` instead — `bugfix-reel` tells
a **before → fix → after** story around a single, specific defect, and will
undersell a feature launch or overclaim a routine release.

## Shape of the story

1. **hook** — the cost or symptom, stated flat (no drama words — see
   `brands/<slug>/voice.md` `forbidden`).
2. **problem** — what was actually broken, one sentence.
3. **code-diff** — the smallest representative fix (one file, the line(s) that
   mattered — not the full diff).
4. **result** — the outcome as a number: lines changed, files touched, or a
   concrete before/after metric if the source data has one.
5. **outro** — fixed channel sign-off (`_shell` handles this; no per-project
   choice here).

## Where the data comes from

`engine/collect.mjs <owner/repo#number>` pulls title, author, labels, diffstat,
and one representative file patch via `gh api`. `engine/resolve-spec.mjs` fills
this archetype's `beats.json` template with those tokens — no manual editing
of beats for a routine bugfix reel.
