# Reel-Bot Teardown — wie die Repos gebaut sind & wie wir unser eigenes bauen

Ziel: ein Repo, das aus jedem deiner Projekte (Website / GitHub) automatisch **9:16-Reels** macht — pro Projekt mit **eigenem Branding**, getriggert durch Events (Release, Merge, Bugfix), für IG / YouTube / TikTok.

Kern-Erkenntnis vorweg: Die Tools **konkurrieren nicht, sie stapeln sich**. brag und pitchkit sind Alternativen auf *derselben* Schicht (Story/Orchestrierung); Hyperframes ist der Renderer *unter* beiden; motion-shorts ist ein fertiger Monorepo, der fast deine komplette Ziel-Architektur zeigt. Du merged also nicht "brag + pitchkit", du nimmst quer aus jeder Schicht das Beste.

```
Schicht 5  Distribution   → IG / YouTube / TikTok APIs      (baust du selbst, Stufe 2)
Schicht 4  Trigger        → GitHub Actions (release/merge)   (baust du selbst)
Schicht 3  Story/Orchestr.→ pitchkit-Prinzip (Archetypen+QA) (klauen, nicht forken)
Schicht 2  Branding       → brand.json / frame.md pro Projekt (dein Kernstück)
Schicht 1  Render-Engine  → Hyperframes (HTML→MP4, headless)  (nicht neu erfinden)
```

---

## 1. `latent-spaces/brag` — der One-Shot-Story-Skill

**Sprache:** Python · **Stars:** ~913 · **Lizenz:** MIT · **Rolle:** Schicht 3, aber bewusst minimal.

### Dateistruktur (bereinigt)
```
brag/
├─ skills/brag/
│  ├─ SKILL.md                     ← die gesamte "Intelligenz": Prompt-Anweisungen
│  └─ assets/
│     ├─ music/cues/*.json|.md     ← Musik + "music cues" (Timing-Marker im Track)
│     └─ sfx/{casino,impact,...}/  ← gebündelte Soundeffekte (.ogg)
├─ examples/                       ← Fake-Produktseiten als Benchmark-Suite
│  └─ <fake-startup>/{PRODUCT.md, index.html, styles.css}
├─ docs/                           ← die Launch-Site (GitHub Pages)
├─ .claude-plugin/{plugin.json, marketplace.json}   ← Plugin-Manifest
├─ .claude/skills/brag  → symlink                   ← Discovery-Pfad Claude Code
├─ .agents/skills/brag  → symlink                   ← Discovery-Pfad Codex/opencode
└─ .opencode/skills/brag → symlink
```

### Wie es zusammengebaut ist
Es gibt **fast keinen Code** — die ganze Logik steckt in `SKILL.md` als Anweisungen an den Agenten. Der Skill "besitzt die Story" (Winkel, Ton, welche Momente), schreibt einen Brief und reicht ihn an Hyperframes zum Rendern. Musik/SFX sind statisch gebündelt. Die drei Symlink-Ordner sind der Trick, wie *ein* Repo in jedem Agenten (Claude Code / Codex / opencode) unter dessen Standard-Pfad gefunden wird.

### Was du daraus lernst
- **Skill = Markdown, nicht Code.** Eine gute `SKILL.md` ersetzt hunderte Zeilen Orchestrierungs-Code.
- **Multi-Agent-Discovery via Symlinks** — falls du deinen Reel-Bot je als installierbaren Skill teilen willst.
- **Warum es "one-shot-mäßig" war:** genau *weil* die Story frei improvisiert wird. Kein Archetyp, kein wiederverwendbares Gerüst → jedes Video würfelt neu. Das ist der Punkt, den pitchkit und motion-shorts lösen.
- **Benchmark-Suite (`examples/`)** ist clever: Fake-Seiten, gegen die man den Skill immer wieder testet. Übernimm das Muster für Regressionstests.

---

## 2. `EricSun0218/pitchkit` — deterministisches Toolkit + Script-Archetypen + Self-Review

**Sprache:** TypeScript (Bun) · **Lizenz:** MIT · **Rolle:** Schicht 3, richtig gemacht. Dein wichtigstes Studienobjekt für *Qualität*.

### Dateistruktur (bereinigt)
```
pitchkit/
├─ cli/index.ts                    ← CLI-Entry (doctor, render-storyboard, skill install…)
├─ core/
│  ├─ services/
│  │  ├─ hyperframes/{render.ts, inspect.ts}   ← Wrapper um die Hyperframes-CLI
│  │  ├─ script-archetypes.ts   script-lock.ts  ← Archetyp wählen + "einfrieren"
│  │  ├─ scenes/{atoms.ts, registry.ts, templates.ts,
│  │  │          launch-templates-{apple,saas,tesla}.ts}  ← Scene-Bibliothek
│  │  ├─ tts/{edge,elevenlabs,openai,volcengine}.ts        ← Voice, mit Fallbacks
│  │  ├─ music/{procedural,musicgen,suno,stable-audio}.ts  ← BGM, mit Fallbacks
│  │  ├─ captions/whisper.ts        ← Untertitel via whisper.cpp (lokal)
│  │  ├─ avatar/{heygen,d-id,tavus,kinetic-text}.ts        ← optionaler Avatar
│  │  ├─ quality-check.ts  consistency-validate.ts  measure-text.ts
│  │  │                              ← der Self-Review-Kern (Frames prüfen, Text messen)
│  │  ├─ brand-kit.ts               ← Brand-Palette/Fonts einlesen
│  │  └─ scaffold-storyboard.ts  storyboard-optimize.ts
│  └─ design/video-directions.ts
├─ shared/{product-context.ts, storyboard.ts, tokens.ts, types.ts}
├─ templates/
│  ├─ AGENTS.md                     ← Anweisung für Nicht-Claude-Agenten
│  └─ script-archetypes/<name>/     ← 15+ Archetypen, jeweils:
│     ├─ intent.md                  ← wann dieser Archetyp passt
│     ├─ beat-template.json         ← die "Beats" (Szenen-Abfolge) als Datenstruktur
│     └─ prompts/{vo_tone,music_mood,image_prompts}.md
├─ .claude/skills/{make-pitchkit,pitchkit-video-design}/SKILL.md
└─ install.sh
```

### Wie es zusammengebaut ist
Trennung von **Denken** und **IO**: Der Agent denkt (Repo lesen, Narrativ, Copy), das TypeScript-Toolkit macht nur *deterministische* IO (rendern, encoden, transkribieren) — keine Cloud-AI in der CLI. Drei Ideen, die den Unterschied zu brag machen:

1. **Script-Archetypen statt Improvisation.** Jeder Archetyp ist ein Ordner mit `intent.md` (wann passt er) + `beat-template.json` (die Szenen-Abfolge als Daten) + Prompt-Fragmenten für Voice/Musik/Bilder. Der Agent *wählt* einen Archetyp und füllt ihn, statt frei zu erfinden. `script-lock.ts` friert die Wahl ein, damit sie reproduzierbar bleibt.
2. **Self-Review in zwei Pässen.** Funktional (`quality-check.ts`): echte Frames aus dem MP4 ziehen, gegen abgeschnittenen Text / kaputtes Layout prüfen. Ästhetisch: auf 7 Dimensionen scoren (Typo, Farbe, Komposition, Hierarchie, Motion, Konsistenz, Distinctiveness), erst dann ausliefern. Bei Fehler → Root-Cause → neu rendern.
3. **Alles mit Fallback-Kette.** TTS: Edge (frei) → ElevenLabs (Key). Musik: prozedural → MusicGen/Suno. Läuft komplett *ohne* API-Key, wird mit eigenen Keys besser.

### Was du daraus lernst
- **`beat-template.json` ist das Herz.** Eine Szenen-Abfolge als *Datei*, nicht als Prompt. Genau das brauchst du pro Reel-Typ (release-reel, bugfix-reel, promo-reel).
- **Self-Review vor Auslieferung** ist nicht optional, wenn es automatisch in CI läuft — niemand schaut jeden Render an. `quality-check.ts` ist die Blaupause.
- **`brand-kit.ts` + `tokens.ts`** zeigen, wie man Brand-Werte sauber vom Rendering trennt → direkt anschlussfähig an deine Multi-Brand-Idee.
- **9:16 ist ein Preset**, kein eigener Pfad: `render-storyboard sb.json out.mp4 --preset portrait` → 1080×1920.

---

## 3. `heygen-com/hyperframes` — die Render-Engine + offizielle Domain-Skills

**Sprache:** TypeScript · **Lizenz:** Apache-2.0 · **Rolle:** Schicht 1 (Engine) + fertige Schicht-3-Bausteine.

### Für dich relevante Teile
```
hyperframes/
├─ .claude/skills/  (=.agents/skills/, gespiegelt)
│  ├─ changelog-video/            ← DEIN Bugfix/Release-Reel-Vorbild
│  │  ├─ SKILL.md
│  │  ├─ examples/{master-skeleton.html, script-tokens.json}
│  │  ├─ references/{build-spec.md, lexicon.json, script-voice.md,
│  │  │              visualization-registry.md}
│  │  ├─ assets/fonts/*.woff2
│  │  └─ scripts/align-captions.mjs
│  ├─ captions-overlay/  cut-the-curve/  seam-craft/
│  ├─ motion-doctrine/            ← Motion-Regeln + "seam gate" (Übergänge erzwingen)
│  │  └─ scripts/{seam-gate.mjs, seam-stamp.mjs}
│  └─ oversized-cursor/
├─ .github/workflows/             ← ECHTE CI-Beispiele zum Abschauen
│  ├─ regression.yml  fast-video-validation.yml
│  ├─ windows-render.yml  catalog-previews.yml
│  └─ .github/actions/prepare-ffmpeg-bin/  install-ffmpeg-windows/
├─ docs/catalog/blocks/*.mdx      ← 50+ fertige Bausteine (code-diff, code-scroll,
│                                    app-showcase, cinematic-zoom, terminal-*, …)
├─ DESIGN.md                      ← Beispiel für Brand-Tokens im Web-Kontext
└─ CLAUDE.md / AGENTS.md          ← Router-Doku (welcher Skill wann)
```
Plus die per `npx skills add heygen-com/hyperframes` nachladbaren Workflow-Skills: **`/pr-to-video`** (GitHub-PR → Changelog/Fix/Refactor-Explainer), **`/product-launch-video`** (URL → Promo/Site-Tour), **`/faceless-explainer`** (Text → typografisch).

### Wie es zusammengebaut ist
Eine Komposition ist eine **HTML-Datei mit `data-*`-Attributen** für Timing/Tracks; ein seekbarer Animations-Runtime (GSAP/CSS/Lottie/…) wird an die Hyperframes-Uhr gepinnt. Der Renderer seekt jeden Frame in headless Chrome, encodet mit FFmpeg → **deterministisch** (gleicher Input = gleiche Bytes), damit CI/Regression funktioniert. `changelog-video` ist praktisch schon dein Fix-Reel: `script-tokens.json` (Daten) → `master-skeleton.html` (Template) → `align-captions.mjs` (Untertitel-Sync).

### Was du daraus lernst
- **`changelog-video/` 1:1 als Startpunkt** für den Bugfix/Release-Reel klauen — Token-JSON + Skeleton-HTML + Caption-Script sind exakt dein Bedarf.
- **Die `.github/workflows/` sind Gold**: Wie man FFmpeg in CI installiert (auch Windows), wie man Renders validiert, wie Frame-Caching läuft. Nicht raten — abschreiben.
- **`data-*`-Timing + "seam gate"** (Übergänge werden erzwungen, keine harten Schnitte) = der Grund, warum Hyperframes-Videos "produziert" aussehen statt wie Slides.
- **`DESIGN.md` vs. `frame.md`**: die Web-Design-Tokens existieren, müssen aber "für die Kamera" übersetzt werden — genau die Trennung, die deine Brand-Schicht braucht.

---

## 4. `cgaravitoq/motion-shorts` — dein fertiger Bauplan (Multi-Brand, 9:16, Distribution)

**Sprache:** TypeScript (Turborepo/Bun) · **Lizenz:** MIT · **Rolle:** zeigt fast deine gesamte Ziel-Architektur auf einmal. **Das wichtigste Repo dieses Dokuments.**

### Dateistruktur (bereinigt)
```
motion-shorts/
├─ apps/hyperframe/
│  ├─ brands/                       ★ DEINE MULTI-BRAND-STRUKTUR
│  │  ├─ vidext/brand.json
│  │  └─ vidext-lime/brand.json     ← 1 Ordner = 1 Projekt-Branding
│  ├─ hyperframes.json              ← Registry + Pfade-Config
│  ├─ templates/
│  │  ├─ _shell/                    ← universelles Gerüst: Tokens, BG-Layer,
│  │  │                               Brand-Corner-Watermark, EINE paused GSAP-
│  │  │                               Timeline + Crossfades, Captions/Audio
│  │  └─ scenes/<type>/v1/          ← 39 typed Scene-Types (hook, title-cards,
│  │                                  flow, metric, big-stat, code, comparison,
│  │                                  timeline, quote, outro, media-split,
│  │                                  before-after, promo-* …)
│  ├─ src/episodes/                 ← Referenz-Episoden (fertige scene-spec.json)
│  └─ scripts/
│     ├─ assemble.ts                ← scene-spec.json → EIN monolithisches index.html
│     ├─ capture-source.ts          ← Screen-Capture einer Website/App
│     ├─ generate-audio.ts  hydrate-bgm.ts
│     ├─ new-episode.ts
│     └─ lib/{brand-pack.ts, scene-router.ts, scene-instantiator.ts,
│             scene-spec.ts, assemble-episode.ts, distribution-spec.ts,
│             r2-artifacts.ts, telemetry.ts}
├─ .agents/skills/ (gespiegelt nach .claude/ .codex/ .opencode/)
│  ├─ canonical-short/              ← der End-to-End-Playbook-Skill
│  ├─ extract-brand-pack/           ★ Figma/Website → brand.json
│  ├─ produce-from-source/          ← Quelle (Repo/URL) → Reel
│  ├─ promo-from-brief/             ← Brief → Promo-Reel
│  ├─ new-episode/  hyperframes-visual-qa/   ← QA-Loop
│  ├─ generate-distribution-copy/   ★ Titel/Beschreibung/Tags für YT/IG/TikTok
│  │  └─ references/{publishing-copies.md, notion-archive-page.md}
│  ├─ figma-to-scene-type/
│  └─ audio-pipeline/ text-to-speech/ speech-to-text/
├─ .opencode/
│  ├─ agents/{short-strategist, short-researcher, short-composer,
│  │          short-visual-director, short-audio-producer, short-qa,
│  │          short-publisher, short-producer}.md   ← die Agenten-Crew
│  └─ commands/short-from-idea.md
├─ .github/workflows/ci.yml
└─ .mcp.json                        ← Notion-MCP (Archiv der veröffentlichten Shorts)
```

### `brand.json` — so einfach ist die Multi-Brand-Schicht wirklich
```json
{
  "slug": "vidext",
  "palette": {
    "paper": "#fff", "ink": "#000", "ink-inverse": "#fff",
    "surface": "#f4f4f4", "line": "#e5e5e5", "muted": "#b3b3b3",
    "font": "\"Inter\", system-ui, sans-serif",
    "radius-pill": "128px", "radius-chip": "40px", "radius-card": "65px",
    "shadow-badge": "0 4px 2px rgba(157,155,155,0.05)"
  },
  "publishable": true,
  "notes": "Social-ad design system, aus Figma extrahiert."
}
```
Mehr ist es nicht. Ein Ordner pro Projekt, eine `brand.json` mit Palette + Font + Radii. Das `_shell/`-Template liest die Tokens ein und setzt u.a. die **Brand-Corner-Watermark** und den **Outro** (fester Brand-Sign-off, immer als letzte Szene).

### Wie es zusammengebaut ist — die eine wichtige Idee
> **Ein Short ist eine typisierte `scene-spec.json`, kein handgeschriebenes HTML.**

Pipeline: `script.txt` → `voice.mp3` + wort-genaue `captions.json` → `scene-spec.json` (typisierte Szenen) → **`assemble.ts`** baut daraus *ein* monolithisches, pausiertes `index.html` (1:1 — gleiche Spec ⇒ gleiche Bytes) → per-Szene-QA → `hyperframes render` → mp4/mov/webm. Das `index.html` wird **generiert, nie von Hand editiert.** Wiederholbare Slots haben Ranges (z.B. `flow.steps` 2–6, `metric.stats` 1–4).

Dazu eine **Agenten-Crew** (opencode): strategist → researcher → composer → visual-director → audio-producer → qa → publisher. Und eine echte **Distribution-Schicht**: `generate-distribution-copy` erzeugt Plattform-Copys, `distribution-spec.ts` + Notion-MCP archivieren, was veröffentlicht wurde.

### Was du daraus lernst (das meiste!)
- **`brands/<slug>/brand.json` ist deine Antwort auf "jedes Projekt eigenes Branding".** Genau so bauen.
- **scene-spec statt HTML** = deterministisch + testbar + LLM-freundlich. Der Agent schreibt *Daten*, nicht Markup. Das ist der Reife-Sprung gegenüber brag.
- **`_shell/` mit Watermark + Outro** löst "Branding automatisch überall" strukturell: Brand-Elemente leben im Shell, nicht in jeder Szene.
- **`extract-brand-pack`**: du musst `brand.json` nicht von Hand schreiben — ein Skill zieht sie aus Figma/Website.
- **`generate-distribution-copy`** ist die einzige fertige Distribution-Referenz im ganzen Ökosystem — auch wenn sie nur Copy erzeugt, nicht auto-postet.
- **Agenten-Crew** zeigt, wie man den Prozess in Rollen zerlegt, falls du später über einen einzelnen Skill hinauswächst.

---

## 5. Ehrenrunde — spezialisierte Muster zum Nachschlagen

| Repo | Ein Satz | Was du klaust |
|---|---|---|
| `zedarvates/hermes-ai-tester` | Screenshot → HyperFrames-Video → **GitHub Issue** | Blaupause fürs *Event → Video → Auslieferung*-Verdrahten |
| `Meir770ar/agentic-video-maker` | Brief → Render → **Gemini-Kritik → Auto-Patch → Re-Render** | Der Critique-Loop als eigener Schritt |
| `code2mp4/code2mp4` | Prompt → editierbare Motion-Source → deterministisches MP4 | Saubere Trennung Source↔Render |
| `heygen-com/hyperframes-vercel-template` | Next.js, rendert MP4 auf Vercel Sandbox | Server-Rendering statt CI-Runner |
| `heygen-com/hyperframes-cloudflare-template` | Workers + Containers, R2-Output | Serverless Rendering + Objekt-Storage |
| `KyaniteLabs/mcp-video` | 87 FFmpeg/HF-Tools als lokaler MCP-Server | Video-Editing als MCP-Tools |
| `ai-agents-.../fb-ad-video-studio` | FB/IG/TikTok-Ads als Code, Ad-Struktur + Reverse-Template | Bewährte Ad-/Reel-Dramaturgie |

---

## 6. Dein `reel-bot` — konkret zusammengesetzt

Nimm **motion-shorts als Skelett**, injiziere **pitchkits Archetyp+QA-Denke**, starte vom Hyperframes-**`changelog-video`** für den Fix-Reel, trigger per **GitHub Action**, Distribution erst Stufe 2.

```
reel-bot/
├─ brands/                          ← [von motion-shorts] Multi-Brand
│  ├─ projekt-a/brand.json          ← Palette, Font, Logo, radii, voice-tone
│  ├─ projekt-a/frame.md            ← Kamera-Übersetzung der Web-Tokens
│  └─ projekt-b/{brand.json, frame.md}
├─ archetypes/                      ← [von pitchkit] je Reel-Typ eine Daten-Datei
│  ├─ release-reel/{intent.md, beat-template.json, prompts/}
│  ├─ bugfix-reel/{intent.md, beat-template.json, prompts/}
│  └─ promo-reel/{intent.md,  beat-template.json, prompts/}
├─ templates/
│  ├─ _shell/                       ← [von motion-shorts] Watermark + Outro + Timeline
│  └─ scenes/<type>/v1/             ← nur die Scene-Types, die du brauchst
├─ scripts/
│  ├─ collect.mjs                   ← gh CLI → PR/Release-Daten → script-tokens.json
│  ├─ assemble.ts                   ← scene-spec.json → index.html (deterministisch)
│  ├─ quality-check.ts              ← [von pitchkit] Frames prüfen, Text messen
│  └─ align-captions.mjs            ← [von hyperframes changelog-video]
├─ .github/workflows/reel.yml       ← Trigger: release published / PR merged
│                                     (FFmpeg-Setup aus hyperframes-Workflows)
├─ distribute/                      ← STUFE 2: IG Graph / YT Data v3 / TikTok API
│  └─ (Stufe 1: MP4 als Artifact + Slack-Post)
├─ hyperframes.json                 ← Registry/Pfade
└─ SKILL.md                         ← [von brag] die Orchestrierungs-Anweisung
```

### Datenfluss (ein Bugfix-Reel)
```
PR merged
  → reel.yml triggert
  → collect.mjs:  gh api → { titel, labels, diffstat, autor } → script-tokens.json
  → Agent wählt archetypes/bugfix-reel + brands/projekt-a → scene-spec.json
  → assemble.ts:  scene-spec + _shell (brand-tokens) → index.html
  → align-captions.mjs:  TTS + wort-genaue Untertitel
  → hyperframes render --preset portrait → reel.mp4  (1080×1920)
  → quality-check.ts:  Frames prüfen; bei Fehler → fix → re-render
  → Stufe 1: MP4 als Artifact hochladen + Slack-Notify
  → Stufe 2: distribute/ postet auf IG/YT/TikTok
```

### Reihenfolge beim Bauen (Aufwand realistisch)
1. `brand.json` + `_shell/` für **ein** Projekt, hardcoded scene-spec → ein Render lokal. (Beweist die Brand-Schicht.)
2. `collect.mjs` + `bugfix-reel`-Archetyp → aus echten PR-Daten ein Reel.
3. `reel.yml` in CI, MP4 als Artifact. (Stufe 1 fertig — das ist schon nutzbar.)
4. `quality-check.ts` einhängen (sonst rendert CI Müll, den keiner sieht).
5. Zweites Projekt = nur neuer `brands/`-Ordner. (Beweist Multi-Brand.)
6. Erst *jetzt* `distribute/` — pro Plattform einzeln, weil jede API gated ist.

### Voraussetzungen
Node ≥ 22, FFmpeg auf PATH, `npx hyperframes doctor` grün. Für Voice optional ElevenLabs-Key (sonst Edge-TTS frei). Auto-Posting: IG braucht **Business-Account + Graph API**, YouTube **Data API v3**, TikTok **Content Posting API + App-Review** — deshalb Stufe 2.

---

## 7. Ein-Satz-Lehre pro Repo

- **brag** — Skill-Logik gehört in `SKILL.md`, nicht in Code; aber freie Improvisation = one-shot.
- **pitchkit** — Archetyp-Datei + Self-Review-Pass sind der Unterschied zwischen "okay" und "wiederholbar gut".
- **hyperframes** — Renderer nicht neu erfinden; `changelog-video` + die CI-Workflows direkt abschreiben.
- **motion-shorts** — `brands/<slug>/brand.json` + typed `scene-spec.json` + `_shell` ist buchstäblich deine Ziel-Architektur.
- **hermes-ai-tester** — so verdrahtet man "Event → Video → landet automatisch woanders".
- **Templates (vercel/cloudflare)** — wenn CI-Runner nicht reichen, rendert man serverseitig.
