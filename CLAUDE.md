# CLAUDE.md — Arbeitsanweisung für den Reel-Bot-Bau

`PLAN.md` und `reel-bot-teardown.md` sind verbindlicher Kontext. Lies beide zuerst.
Arbeite `PLAN.md` **Phase für Phase** ab, beginnend mit Phase 0.

## Modell-Strategie (wichtig)

- **Phase 0 und 1** — die Hauptsession läuft auf **Opus 4.8** (`claude-opus-4-8`).
  Das sind Schema-Design und Architektur (die Grundplatte `reel-spec.json`, das
  `_shell`, die Merge-Regel). Diese Entscheidungen prägen alles Weitere — hier
  wird gedacht, nicht getippt. **Keine Subagents in Phase 0–1.**

- **Ab Phase 2** — die Hauptsession bleibt Opus 4.8 als *Koordinator*, aber die
  eigentliche Umsetzungsarbeit (weitere Scene-Types, Archetypen, Boilerplate,
  Tests) wird an **Subagents auf Sonnet 5** (`claude-sonnet-5`) delegiert.
  Opus plant und prüft, Sonnet 5 baut. So: teuer denken wo es zählt, günstig
  ausführen wo es Routine ist.
  - Die Subagent-Definitionen liegen in `.claude/agents/` und setzen `model`
    explizit auf `claude-sonnet-5`.
  - Alternativ global erzwingbar: `export CLAUDE_CODE_SUBAGENT_MODEL="claude-sonnet-5"`.
  - Sweet Spot: 3–5 Subagents parallel, nicht mehr.

## Loop-Disziplin — "arbeite bis fertig, aber beweise es"

- Führe die Checkboxen aus `PLAN.md` als Todo-Liste und hake Erledigtes ab.
- Nach **jedem** Schritt verifizierst du dich selbst: Tests / Render /
  `quality-check` laufen lassen. **Behaupte nie "fertig" ohne Beleg — zeig das
  grüne Ergebnis.** Kein "sollte jetzt funktionieren" ohne Ausführung.
- Schlägt ein Check fehl: Ursache finden, fixen, erneut prüfen. Wiederholen,
  bis grün. Der Abbruch kommt aus dem *bestandenen Test*, nicht aus einem Gefühl.
- Wenn du einen Bau-Subagent losschickst, gib ihm eine klare **Definition of
  Done** (welcher Test grün sein muss) mit. Er liefert erst zurück, wenn sie
  erfüllt ist.

## Verhalten

- Committe lokal nach jedem grünen Schritt (kleine, klar benannte Commits).
  **Pushe nie selbst** — das mache ich.
- Frag mich nur bei echten Architektur-Weggabelungen. Kleine Entscheidungen
  triffst du selbst und notierst sie einzeilig in `DECISIONS.md`.
- Am Ende jeder Phase: anhalten, Zwei-Zeilen-Zusammenfassung, dann weiter.

## Frische-Check

Die Repo-Strukturen im Teardown sind vom Juli 2026. Bevor du ein Bauteil aus
einem fremden Repo übernimmst, prüf per `gh` oder Websuche, ob sich das Repo
geändert hat. Übernimm nichts blind aus dem Teardown-Dokument.
