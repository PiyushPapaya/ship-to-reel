# Intent — promo-reel

Use this archetype for a general product/feature promo that isn't tied to a
single GitHub event — `source.kind` is typically `url` or `brief` (a website,
landing page, or a short written brief), though a `github_release` can also
route here instead of `release-reel` when the ask is "sell this thing" rather
than "here's the changelog." Signals to look for: the request names a product
or feature and wants it pitched (attention → value → proof → action), not a
fix/regression story and not a full release rundown.

If there's a specific merged PR fixing one defect, prefer `bugfix-reel`. If
there's a tagged release with several merged PRs behind it and the point is
"what shipped," prefer `release-reel`. If the story needs real depth — origin,
mechanism, comparison, proof, multiple features — and length isn't a
constraint, prefer `deep-dive` instead; `promo-reel` is deliberately short and
will flatten a story that needs room.

## Shape of the story

1. **hook** — the single sharpest claim about the product, stated flat (no
   "revolutionary" / "game-changing" — see `brands/<slug>/voice.md`
   `forbidden`).
2. **feature** — the one capability that earns the hook (what it actually
   does).
3. **comparison** — the "instead of X, now Y" contrast, or a before/after —
   whichever the source data actually has; the reason to care.
4. **cta** — the single next action (try it, install it, read more) plus a
   handle/link if the source provides one.
5. **outro** — fixed channel sign-off (`_shell` handles this; no per-project
   choice here).

Deliberately short-to-medium (fast pace, tight seams) — a promo earns
attention in seconds; it does not need `deep-dive`'s room to walk through
mechanism or multiple features.

## Where the data comes from

**Not yet wired.** No `url`/`brief` collector exists yet in `engine/collect.mjs`
(tracked in `ROADMAP-NEXT.md` §3.2). Until one exists, this archetype's
placeholders (`promo_line`, `feature_title`, `feature_body`,
`comparison_before`, `comparison_after`, `cta_line`, `cta_handle`) are filled
by hand or a stand-in tokens file — same `{{dot.path}}` substitution
`resolve-spec.mjs` already uses for `bugfix-reel`.
