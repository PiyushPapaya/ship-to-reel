# Intent — deep-dive

Use this archetype when the source material genuinely supports a **long cut**
— enough substance for origin/context, more than one distinct capability,
a mechanism worth walking through, a comparison, and outside proof (a stat or
a quote) — and length is not a constraint. This is the archetype that proves
`PLAN.md` §1/§3's "any length" claim end-to-end: `meta.duration: "auto"` plus
beats with wide `dur` ranges means the *same engine* that renders a ~10s
`bugfix-reel` also renders a 40s+ walkthrough from this file, with no engine
changes — only more beats and wider slots.

Pick this over `promo-reel` when the pitch needs room: multiple features, not
one; a mechanism ("how it works"), not just a claim; supporting proof
(a metric and/or a quote), not just a hook. Pick `release-reel` instead if the
source is specifically a tagged GitHub release and the ask is "what shipped
this version," not a full product story. Pick `bugfix-reel` instead for a
single defect.

## Shape of the story (10 beats — roughly double `bugfix-reel`'s 5)

1. **hook** — the sharpest single claim, stated flat.
2. **context** — why this exists; the problem space before this project.
3. **feature** — capability #1, the core one.
4. **feature** — capability #2, a second distinct capability (not a
   rephrasing of #1 — if there's only one real capability, this is the wrong
   archetype; use `promo-reel`).
5. **flow** — how it actually works, as a short numbered list (2-6 steps,
   `slot.items`).
6. **comparison** — before/after, or vs. the alternative.
7. **big-stat** — the proof, as a number.
8. **quote** — outside validation (a maintainer/user quote), if the source
   has one; drop this beat if it doesn't (see `Length rules` below).
9. **cta** — the single next action.
10. **outro** — fixed channel sign-off.

## Length rules

- **`meta.duration` stays `"auto"`.** Every beat here carries a wide `dur`
  range rather than a fixed number — `slow` pace pushes toward each beat's
  `max`, `fast` toward `min` (`engine/assemble.mjs`'s `sceneDuration`) — so
  the *same* `beats.json` renders noticeably shorter or longer depending on
  `tempo.pace`, without touching the file.
- Use `slow` or `medium` pace for this archetype by default (`fast` defeats
  the point of a deep-dive — see this file's own `tempo` block, which the
  agent may still override).
- If the source genuinely lacks material for a beat (no quote, no second
  distinct feature), drop that beat from the resolved spec rather than
  padding it with filler — `reel-spec.schema.json`'s `beats` only requires
  `minItems: 1`, so a 10-beat template shrinking to 7-8 for a thinner source
  is expected, not an error.

## Where the data comes from

No dedicated collector — a deep-dive is assembled from whatever combination
of `github_pr`/`github_release`/`url`/`brief` sources actually has this much
material (a large feature PR, a milestone release with a written brief on
top, or a hand-written brief). Placeholders (`hook_line`, `context_title`,
`context_body`, `feature1_title`/`feature1_body`, `feature2_title`/
`feature2_body`, `steps` — an array, `comparison_before`/`comparison_after`,
`stat_metric`/`stat_sub`, `quote_body`/`quote_attribution`, `cta_line`,
`cta_handle`) are filled by hand or a stand-in tokens file today, same
`{{dot.path}}` mechanism `resolve-spec.mjs` already uses.
