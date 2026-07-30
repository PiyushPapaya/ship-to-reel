---
tone: confident, technical, dry wit
pacing: fast, short sentences
lexicon:
  release: ship
  bug fix: patch
forbidden:
  - revolutionary
  - game-changing
  - seamless
music_mood: minimal, driving, no vocals
narration: second person ("you can now…")
---

# Voice — projekt-a

This file controls **tone, word choice, and narrative stance**. The YAML front matter
above holds the machine-readable knobs (validated against
`reel-spec.schema.json#/$defs/voice`); the prose below is context for the agent that
writes the script.

## Stance

Talk like a developer to developers: direct, no marketing fat. One sentence, one claim.
No adjective chains. A dry counter beats an exclamation mark.

## Word choice (from `lexicon`)

- "ship" instead of "release"
- "patch" instead of "bug fix"

## Forbidden (from `forbidden`)

Never "revolutionary", "game-changing", or "seamless". If a sentence only works with a
word like that, the sentence is the problem — rewrite it.

## Music & narration

Music: minimal, driving, no vocals — it carries the pace, it doesn't push.
Narration: second person singular. The viewer is addressed, not an audience.
