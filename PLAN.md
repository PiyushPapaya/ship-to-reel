# PLAN.md — Reel-Bot: dein eigenes Video-Engine-Repo

> **Vision.** Ein Repo, das aus jedem Projekt (Website / GitHub / Brief) **Videos beliebiger Länge** erzeugt — kurze 9:16-Reels bis lange Cuts — in **beliebigem Layout**, in **höherer Qualität** als die Katalog-Tools, mit **fließender Animation, echten Bildern/B-Roll, in wählbarem Style, Ton und Tempo**, und pro Projekt **markenkonsistent**.
>
> **Prinzip.** Keine fremden Repos hintereinander aufrufen. Stattdessen: Repos in **Bauteile** zerlegen (Lego), auf **eine gemeinsame Grundplatte** einrasten, daraus **eigene Skills** bauen. Zur Laufzeit läuft nur *dein* Code.

---

## 0. Warum das etwas Neues wird (der ehrliche Kern)

Alle existierenden Tools (brag, pitchkit, motion-shorts, …) machen im Grunde dasselbe: **Katalog-Szenen aneinanderreihen → rendern.** Deterministisch, praktisch — aber es sieht aus wie Kacheln hintereinander. Das ist keine Fehlwahrnehmung, das *ist* die Architektur.

Das Neue an deinem Repo sind **drei Schichten, die keins dieser Repos zusammen hat**:

1. **Eine gemeinsame Grundplatte** (`reel-spec.json`), auf die geliehene Bauteile aus 4+ Repos einrasten — statt fremde Schemas nebeneinander.
2. **Ein Cinematic-Layer** (durchgehende Master-Timeline + erzwungene Seams + echtes Capture/B-Roll + Beat-Sync) — der Sprung von "Slides" zu "Film".
3. **Ein harter Style/Ton/Tempo-Regler** (channel + brand + voice + tempo als Daten) plus ein QA-Loop, der auf *"fließend, nicht flach"* scored und neu rendert, bis es sitzt.

Kein einzelnes Repo besitzt alle drei. Genau das ist die Lücke, die du füllst.

**Grenze bewusst benennen:** Hyperframes rendert HTML/CSS/SVG → Ceiling ist "high-end Motion Graphics", nicht Runway/Sora-Photorealismus. Echten Film-Look gibt es nur über generative B-Roll (Veo/Sora) *als Clips*, die Hyperframes nur **kompositiert**. Deshalb ist B-Roll im Plan eine eigene, optionale Zutat — kein Kern.

---

## 1. Die Grundplatte — `reel-spec.json` (das eine Schema)

Das ist das Fundament. Jedes geliehene Bauteil muss auf *dieses* Schema passen; sonst ist es doch nur "hintereinander gestückelt, eine Ebene tiefer". Die eigentliche Arbeit dieses Projekts ist dieses Schema, nicht das Sammeln von Teilen.

```jsonc
{
  "meta": {
    "id": "projekt-a-bugfix-2026-07-29",
    "duration": "auto",        // "auto" | Sekunden | {min, max} → beliebige Länge
    "format": "9:16",          // 9:16 | 1:1 | 16:9 | custom {w,h}
    "archetype": "bugfix-reel" // welche Story-Vorlage (siehe §3)
  },
  "channel":  { "$ref": "channel.json" },              // EBENE A: dein Kanal-Brand
  "brand":    { "$ref": "brands/projekt-a/brand.json" },// EBENE B: Projekt-Optik
  "voice":    { "$ref": "brands/projekt-a/voice.md" },  // EBENE B: Ton/Stil/Lexikon
  "tempo": {
    "pace": "fast",            // slow | medium | fast  → treibt Szenen-Dauer + Cuts
    "beat_sync": true,         // Schnitte auf Musik-Beats legen
    "energy_curve": "build"    // flat | build | wave  → Spannungsbogen
  },
  "source": {
    "kind": "github_pr",       // github_pr | github_release | url | brief
    "ref":  "owner/repo#123",
    "capture": true            // Screen-Capture der UI als Basis-Footage?
  },
  "beats": [                   // die Story als DATEN (gelernt von pitchkit)
    { "type": "hook",        "slot": {} },
    { "type": "problem",     "slot": {} },
    { "type": "code-diff",   "slot": {} },
    { "type": "result",      "slot": {} },
    { "type": "outro",       "slot": {} }   // fester Brand-Sign-off, immer letzte
  ],
  "broll": [                   // optional: generative Clips als Zutat
    { "at": "hook", "provider": "veo", "prompt": "…", "role": "background" }
  ]
}
```

**Merge-Regel (fest verdrahtet):** Layout/Format = **channel gewinnt immer**. Farbe/Font/Motion/Ton = **brand+voice gewinnen**. Grenzfall Captions: *Position/Größe* vom channel, *Akzentfarbe* vom brand. So bleibt jedes Video erkennbar deins und passt sich trotzdem ans Projekt an.

**Beliebige Länge** entsteht hier: `duration:"auto"` + `beats[]` mit Ranges (jeder Szenen-Typ hat min/max Slots, wie motion-shorts es macht: `flow.steps` 2–6 etc.). Wenig Input → kurzer Reel; viel Input → langer Cut. Dieselbe Spec, andere Länge.

---

## 2. Die zwei Branding-Ebenen (deine Kern-Anforderung)

### Ebene A — `channel.json` (konstant, dein IG/YT/TikTok-Absender)
Einmal schreiben, nie wieder anfassen.
```jsonc
{
  "handle": "@dein_handle",
  "safe_areas": { "top": 220, "bottom": 320 },   // 9:16 UI-Overlays freihalten
  "watermark": { "text": "@dein_handle", "corner": "bottom-left", "opacity": 0.7 },
  "captions":  { "font": "…", "size": 64, "position": "lower-third", "box": true },
  "intro_sting": "assets/sting.json",             // 0.8s Signature-Auftakt
  "outro_card": "templates/_shell/outro/v1"       // deine feste Abschluss-Karte
}
```

### Ebene B — pro Projekt zwei Dateien
`brands/<slug>/brand.json` (Optik — 1:1 das motion-shorts-Muster):
```jsonc
{ "slug":"projekt-a", "palette":{ "paper":"#fff","ink":"#000","accent":"#5B8DEF",
  "font":"\"Inter\", sans-serif", "radius-card":"48px" }, "logo":"logo.svg" }
```
`brands/<slug>/voice.md` (Ton/Stil — gelernt von pitchkit `vo_tone.md` + hyperframes `script-voice.md`):
```markdown
tone: selbstbewusst, technisch, trocken-witzig
pacing: schnell, kurze Sätze
lexicon: "shippen" statt "veröffentlichen"; "Bug" statt "Fehler"
verboten: "revolutionär", "game-changing"
music_mood: minimal, treibend, kein Gesang
narration: 2. Person ("du kannst jetzt…")
```

Neues Projekt = neuer Ordner. `brand.json` kannst du sogar automatisch aus Figma/Website ziehen (Bauteil `extract-brand-pack` aus motion-shorts).

---

## 3. Der Story-Layer — Archetypen als Daten (gegen den "One-Shot"-Look von brag)

brag improvisiert → würfelt jedes Mal neu. Du machst es wie pitchkit: **feste Vorlagen als Dateien**, die der Agent nur *füllt*.

```
archetypes/
├─ promo-reel/     {intent.md, beats.json, prompts/{vo_tone,music_mood,image}.md}
├─ release-reel/   {intent.md, beats.json, prompts/}
├─ bugfix-reel/    {intent.md, beats.json, prompts/}
└─ deep-dive/      {intent.md, beats.json, prompts/}   ← langer Cut
```
- `intent.md` — wann dieser Archetyp passt (der Agent wählt danach).
- `beats.json` — die Szenen-Abfolge mit Slot-Ranges → steuert **Länge**.
- `script-lock` — die Wahl einfrieren = reproduzierbar (gelernt von pitchkit).

So bekommst du **beliebige Video-Typen** (kurz/lang, promo/technisch) aus *einem* System, ohne Improvisation.

---

## 4. Der Cinematic-Layer (der eigentliche Qualitätssprung)

Premium kommt **nicht** von mehr Szenen-Typen. Es kommt von vier Dingen, die die Katalog-Repos weglassen:

1. **Master-Timeline statt Segmente.** *Eine* pausierte GSAP-Timeline über das ganze Video mit Crossfades (Bauteil aus motion-shorts `_shell`). Nicht N unabhängige Clips.
2. **Erzwungene Seams.** Übergänge sind Pflicht, harte Jump-Cuts verboten (Bauteil `seam-gate`/`motion-doctrine` aus hyperframes). Das ist der größte Einzel-Hebel von "Slide" zu "Film".
3. **Echtes Material als Basis.** Screen-Capture der UI (`capture-source` aus motion-shorts) + Motion-Graphics *darüber*. Für abstrakte Momente optional generative B-Roll (Veo/Sora), die Hyperframes nur kompositiert.
4. **Beat-Sync.** Schnitte auf Musik-Beats legen (`tempo.beat_sync`). Der Unterschied zwischen "hat Musik" und "sitzt".

```
Katalog-Szenen           ← rohes Material (motion-shorts/scenes + hyperframes/catalog)
  + seam-layer            ← Szenen fließen ineinander (motion-doctrine)
  + master-timeline       ← ein Fluss (motion-shorts _shell)
  + capture / b-roll      ← Substanz statt nur Grafik (motion-shorts + Veo/Sora)
  + beat-synced audio     ← Schnitte auf Musik
  = cinematic
```

---

## 5. Der Wächter — QA-Loop, der Flachheit ablehnt

Läuft es automatisch in CI, schaut niemand jeden Render an → der QA-Loop ist Pflicht, nicht Kür.

- **Funktionaler Pass** (`quality-check` aus pitchkit): echte Frames aus dem MP4 ziehen, gegen abgeschnittenen Text / kaputtes Layout / Clipping prüfen. Vertraut *nie* dem "render succeeded".
- **Ästhetischer Pass**: scored auf Typo, Farbe, Komposition, Hierarchie, **Motion/Fluss**, Konsistenz, Distinctiveness. Du setzt die Schwelle **härter** als pitchkit — flache "Slide-Reihen" fallen durch.
- **Critique → Auto-Patch → Re-Render** (Bauteil aus agentic-video-maker): bei Fail Root-Cause finden, fixen, neu rendern, bis es die Schwelle knackt.

> Merksatz: **Generieren ist nicht Fertigstellen.**

---

## 6. Trigger & Distribution (phasiert — nicht alles auf einmal)

**Trigger** (`.github/workflows/reel.yml`): `release: published` oder `pull_request: closed(merged)`. FFmpeg-Setup 1:1 aus den hyperframes-Workflows abschreiben (auch Windows). Event → `collect.mjs` (gh CLI → Daten) → Spec → Render.

**Distribution — bewusst zwei Stufen:**
- **Stufe 1 (sofort):** MP4 als CI-Artifact + Slack-Post. Manuell posten. → Schon voll nutzbar.
- **Stufe 2 (später):** `distribute/` pro Plattform. Jede API ist gated: IG = Business-Account + Graph API; YouTube = Data API v3; TikTok = Content Posting API + App-Review. Deshalb *nicht* zuerst — sonst verbrennst du Zeit an Freigaben statt an Videos. `generate-distribution-copy` (motion-shorts) erzeugt schon mal Titel/Beschreibung/Tags je Plattform.

---

## 7. Die Lego-Kiste — welches Bauteil aus welchem Repo

| Bauteil | Funktion | Quelle | Lizenz |
|---|---|---|---|
| `brands/<slug>/brand.json` + `_shell/` | Multi-Brand + Watermark/Outro | **motion-shorts** | MIT |
| typed `scene-spec` + `assemble` | Daten→HTML, deterministisch | **motion-shorts** | MIT |
| `capture-source` | Screen-Capture der UI | **motion-shorts** | MIT |
| `extract-brand-pack` | Figma/Website → brand.json | **motion-shorts** | MIT |
| `generate-distribution-copy` | Plattform-Copys | **motion-shorts** | MIT |
| `beats.json` + `intent.md` + `script-lock` | Archetypen als Daten | **pitchkit** | MIT |
| `quality-check` + ästhetischer Score | QA-Pässe | **pitchkit** | MIT |
| TTS/Musik-Fallback-Ketten, `voice.md` | Ton, keyless→key | **pitchkit** | MIT |
| `changelog-video` (tokens+skeleton) | Fix/Release-Reel-Start | **hyperframes** | Apache-2.0 |
| `align-captions.mjs` | Untertitel-Sync | **hyperframes** | Apache-2.0 |
| `seam-gate` / `motion-doctrine` | erzwungene Übergänge | **hyperframes** | Apache-2.0 |
| Scene-Types (nur nötige) | Bausteine | **hyperframes/catalog** + **motion-shorts** | Apache/MIT |
| CI-Workflows (FFmpeg-Setup) | Render in CI | **hyperframes/.github** | Apache-2.0 |
| `SKILL.md`-Muster + Symlink-Discovery | Skill-Struktur | **brag** | MIT |
| Critique→Patch→Re-Render | Selbst-Korrektur | **agentic-video-maker** | (prüfen) |
| Event→Video→Auslieferung | Trigger-Verdrahtung | **hermes-ai-tester** | (prüfen) |
| Server-Render (Fallback zu CI) | Vercel/CF Rendering | **hyperframes-*-template** | MIT |

> **Wichtig:** Jedes Bauteil wird *adaptiert*, bis es auf `reel-spec.json` passt — nicht copy-paste. Zwei fremde Schemas (pitchkit `beats` vs. motion-shorts `scene-spec`) passen nie direkt; die Grundplatte (§1) ist der Übersetzer. Vor Übernahme jeweils die Lizenz der kleineren/neueren Repos prüfen.

---

## 8. Ziel-Struktur deines Repos

```
reel-bot/
├─ reel-spec.schema.json         ★ die Grundplatte (§1) — zuerst bauen
├─ channel.json                  ★ Ebene A: dein Kanal-Brand
├─ brands/
│  ├─ projekt-a/{brand.json, voice.md}
│  └─ projekt-b/{brand.json, voice.md}
├─ archetypes/
│  ├─ promo-reel/   {intent.md, beats.json, prompts/}
│  ├─ release-reel/ {intent.md, beats.json, prompts/}
│  └─ bugfix-reel/  {intent.md, beats.json, prompts/}
├─ templates/
│  ├─ _shell/                    ← Master-Timeline + Watermark + Outro + Seams
│  └─ scenes/<type>/v1/          ← nur die Scene-Types, die du brauchst
├─ engine/
│  ├─ resolve-spec.mjs           ← channel+brand+voice+archetype → reel-spec.json
│  ├─ assemble.mjs               ← reel-spec.json → index.html (deterministisch)
│  ├─ collect.mjs                ← gh CLI → source-daten → tokens
│  ├─ capture.mjs                ← Screen-Capture (falls UI)
│  ├─ align-captions.mjs         ← Untertitel-Sync
│  ├─ render.mjs                 ← Wrapper: hyperframes render --preset …
│  ├─ quality-check.mjs          ← QA-Pässe + Critique-Loop
│  └─ broll.mjs                  ← optional: Veo/Sora-Clips holen
├─ skills/
│  ├─ make-reel/SKILL.md         ← dein Haupt-Skill (Anweisung, kein Code)
│  └─ bugfix-reel/SKILL.md
├─ distribute/                   ← STUFE 2 (IG/YT/TikTok)
├─ .github/workflows/reel.yml    ← Trigger + FFmpeg-Setup
├─ hyperframes.json
└─ .claude/ .agents/ .opencode/  ← Symlink-Discovery (brag-Muster)
```

---

## 9. Datenfluss (ein Bugfix-Reel, end-to-end)

```
PR merged
 → reel.yml triggert
 → collect.mjs:   gh api → {titel, labels, diffstat, autor} → tokens
 → resolve-spec:  channel.json + brands/projekt-a + archetypes/bugfix-reel
                  + tempo → reel-spec.json   (Merge-Regel §1)
 → capture.mjs:   (falls UI) Screen-Capture als Basis-Footage
 → broll.mjs:     (optional) Veo/Sora-Clip für den Hook
 → assemble.mjs:  reel-spec + _shell → EIN index.html (Master-Timeline, Seams)
 → align-captions:TTS (voice.md-Ton) + wort-genaue Untertitel
 → render.mjs:    hyperframes render --preset portrait → reel.mp4 (1080×1920)
 → quality-check: Frames prüfen + auf "Fluss" scoren
                  Fail → Root-Cause → Patch → Re-Render (loop)
 → Stufe 1:       MP4 als Artifact + Slack-Notify
 → Stufe 2:       distribute/ → IG/YT/TikTok + generate-distribution-copy
```

---

## 10. Bau-Roadmap (in Reifegrad-Reihenfolge)

**Phase 0 — Fundament**
- [ ] `reel-spec.schema.json` entwerfen (die Grundplatte). *Alles hängt hieran.*
- [ ] `channel.json` mit deinem echten IG-Layout füllen.
- [ ] `brands/projekt-a/{brand.json, voice.md}` für **ein** Projekt.

**Phase 1 — Ein Render, lokal**
- [ ] `_shell/` + 4–5 Scene-Types (hyperframes/catalog + motion-shorts adaptieren).
- [ ] hardcoded `reel-spec.json` → `assemble.mjs` → `render.mjs` → 1 MP4.
- [ ] Beweist: Brand-Schicht + 9:16 + Grundplatte funktionieren.

**Phase 2 — Aus echten Daten**
- [ ] `collect.mjs` (gh CLI) + `bugfix-reel`-Archetyp.
- [ ] `resolve-spec.mjs` (der Merge). → aus PR-Daten ein Reel.

**Phase 3 — Cinematic**
- [x] Master-Timeline + `seam-gate` einhängen (Fluss statt Kacheln). *(Phase 3a)*
- [x] `capture.mjs` für UI-Projekte. *(Phase 3b — real scroll-capture of a merged PR's
      GitHub page; not yet wired into `assemble.mjs`'s beat rendering)*
- [ ] `align-captions` + Beat-Sync. *(Phase 3c — blocked on a TTS/audio pipeline that
      doesn't exist yet; tracked as a follow-up issue, needs a provider decision)*

**Phase 4 — Wächter**
- [x] `quality-check.mjs` (funktional + ästhetisch). *(Funktional: lint + Frame-Extraktion
      + Frozen-Frame-Hashing + ffprobe, voll automatisiert. Ästhetisch: Scorecard-Gerüst,
      gescored von wem auch immer baut (Agent/Mensch) über `--scores`, da kein Vision-Model
      im Repo verdrahtet ist — Critique-Loop ist dadurch aktuell agent-driven, kein
      eigenständiges Auto-Patch-Script.)*
- [x] Schwelle hart auf "fließend" stellen. *(avg ≥ 4.0, jede der 7 Dimensionen ≥ 3 —
      am echten `build/reel.mp4` geprüft: avg 2.57, durchgefallen — Gate fängt echte
      Flachheit ab statt "render succeeded" zu glauben. Patch-Pass ist Folgearbeit.)*

**Phase 5 — CI + Multi-Brand**
- [ ] `reel.yml` (Trigger + FFmpeg), MP4 als Artifact + Slack. **→ nutzbar.**
- [ ] Zweites Projekt = nur neuer `brands/`-Ordner. Beweist Skalierung.

**Phase 6 — Distribution (optional, später)**
- [ ] `distribute/` pro Plattform, jede API einzeln (gated).

**Phase 7 — B-Roll (optional, für Film-Look)**
- [ ] `broll.mjs`: Veo/Sora-Clips als komponierbare Zutat.

---

## 11. Voraussetzungen & Risiken

**Setup:** Node ≥ 22, FFmpeg auf PATH, `npx hyperframes doctor` grün. Optional ElevenLabs-Key (sonst Edge-TTS frei), Veo/Sora-Key nur für Phase 7.

**Risiken, ehrlich:**
- *Schema-Reibung* ist die eigentliche Arbeit (§7). Unterschätze §1 nicht.
- *Cinematic ≠ gratis.* HTML-Motion hat ein Ceiling; echter Film-Look kostet B-Roll-Compute (Phase 7).
- *Distribution-APIs* sind der Zeitfresser → bewusst ans Ende.
- *Ökosystem ist jung.* Die kleinen Repos (agentic-video-maker, hermes) sind Blaupausen, keine Produkte — als Ideen übernehmen, nicht als Abhängigkeit.

---

## 12. Was das am Ende ist

Ein Repo, das **du besitzt** — zusammengesteckt aus geliehenen, adaptierten Bauteilen, die alle auf **eine Grundplatte** einrasten. Es macht Videos **beliebiger Länge und Layout**, in **deinem Kanal-Brand + je Projekt eigener Optik/Ton/Tempo**, mit einem **Cinematic-Layer** (Fluss, Seams, Capture, Beat-Sync) und einem **QA-Wächter**, der Flachheit ablehnt. Kein bestehendes Repo macht das zusammen — das ist die Lücke, die dieser Plan füllt.
