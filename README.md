# Seifenkisten Rennen: Time Drift 🏎️⏱️

Ein 2D Top-Down Seifenkisten-Rennspiel mit Zeit-Reise-Thema — gebaut mit HTML5 Canvas und TypeScript.

## Spielprinzip
Steure deine Seifenkiste einen prozedural generierten Hang hinunter, weiche Hindernissen aus und erreiche das Ziel so schnell wie möglich. Kollisionen kosten 3 Sekunden. Bestzeiten werden lokal gespeichert.

## Quickstart

```bash
npm install
npm run dev
# → http://localhost:5173
```

```bash
npm run build    # Produktions-Build nach dist/
npm run preview  # Build lokal testen
```

## Steuerung

| Taste | Aktion |
|-------|--------|
| ← / A | Lenken links |
| → / D | Lenken rechts |
| SPACE / ENTER | Menü bestätigen |
| ESC | Zurück zum Menü |

## Projektstruktur

```
src/
  main.ts              # Einstiegspunkt
  game/
    Game.ts            # Game Loop + State Machine
    Car.ts             # Fahrzeugphysik (Phase 2)
    Track.ts           # Prozedurale Strecke (Phase 3)
    Obstacle.ts        # Hindernisse (Phase 4)
    Physics.ts         # Kollisionen (Phase 4)
    ParticleSystem.ts  # Partikeleffekte (Phase 5)
  ui/                  # Menü, HUD, Highscores (Phase 6–7)
  utils/
    InputHandler.ts    # Keyboard State
```

## Entwicklungsstand

| Phase | Status | Inhalt |
|-------|--------|--------|
| 0 – Setup | ✅ | Projektdateien, Specs |
| 1 – Grundgerüst | ✅ | Vite, Canvas, Game Loop, Input, State Machine |
| 2 – Physik | 🔲 | Car, Gravity, Lenkung, Trägheit |
| 3 – Strecke | 🔲 | Prozedurale Track-Generierung |
| 4 – Kollisionen | 🔲 | Hindernisse, Zeitstrafe |
| 5 – Rendering | 🔲 | Pseudo-3D, Partikel |
| 6 – Game Systems | 🔲 | Timer, Highscores |
| 7 – Polish | 🔲 | Sound, UI, Mobile |

## Tech Stack
- **TypeScript** (strict mode)
- **HTML5 Canvas** (2D context, kein Game-Engine)
- **Vite 5** (Dev-Server + Build)
- Keine externen Runtime-Dependencies

## Ziel
~800–1500 LOC, 60 FPS, süchtig machender „noch eine Runde"-Faktor.
