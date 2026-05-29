# Seifenkisten Rennen: Time Drift

Ein 2D Top-Down Seifenkisten-Rennspiel mit Zeit-Reise-Thema — gebaut mit HTML5 Canvas und TypeScript.

## Spielprinzip
Steure deine Seifenkiste einen prozedural generierten Hang hinunter, weiche Hindernissen aus und erreiche das Ziel so schnell wie möglich. Kollisionen kosten 3 Sekunden. Bestzeiten werden über LootLocker synchronisiert und lokal zwischengespeichert.

## Quickstart

```bash
npm install
npm run dev
# → http://localhost:5173
```

Optional kann LootLocker über eine `.env.local` konfiguriert werden:

```bash
VITE_LOOTLOCKER_API_KEY=dein_api_key
VITE_LOOTLOCKER_LEADERBOARD_KEY=dein_leaderboard_key
# optional:
# VITE_LOOTLOCKER_API_BASE=https://api.lootlocker.io/game
# VITE_LOOTLOCKER_GAME_VERSION=0.1.0
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
| ↓ / S | Bremsen |
| SPACE / ENTER | Menü bestätigen |
| ESC | Zurück zum Menü |

## Projektstruktur

```
src/
  main.ts              # Einstiegspunkt
  game/
    Game.ts            # Game Loop + State Machine
    Car.ts             # Fahrzeugphysik + Fahrzeug-Rendering
    Track.ts           # Prozedurale Strecke + Rand-Heuballen
    Obstacle.ts        # Hindernisse (Phase 4)
    ParticleSystem.ts  # Staubpartikel
    AudioSystem.ts     # Web-Audio-Soundeffekte
  ui/                  # Menü, HUD, Highscores (Phase 6–7)
  utils/
    InputHandler.ts    # Keyboard State
```

## Entwicklungsstand

| Phase | Status | Inhalt |
|-------|--------|--------|
| 0 – Setup | ✅ | Projektdateien, Specs |
| 1 – Grundgerüst | ✅ | Vite, Canvas, Game Loop, Input, State Machine |
| 2 – Physik | ✅ | Car, Gravity, Lenkung, Trägheit |
| 3 – Strecke | ✅ | Catmull-Rom Spline, Heuballen, Start/Ziel, Kamera |
| 4 – Kollisionen | ✅ | Hindernisse, Kollision, Flash, Zeitstrafe, Schatten |
| 5 – Rendering | ✅ | Top-down Road, Heuballen-Polish, Staub, Speed Lines |
| 6 – Game Systems | ✅ | Timer, Progress, Countdown, Highscores |
| 7 – Polish | ✅ | Sound, UI, Mobile, Ripple, Performance |

## Aktueller Look

- Sattes Rasengruen (`#2fb51d`)
- Feste Top-down-Strasse ohne Randlinien und ohne Object-Scaling
- Quadratische Heuballen mit abgerundeten Ecken, Heumuster und unregelmaessiger Rotation
- Rand-Heuballen stehen dicht am Fahrbahnrand und folgen der Strassenkante
- Dunkle, weichgezeichnete Schatten per Canvas-Filter
- Schlanke rote Seifenkiste mit roten Achsen und schwarzen Reifen
- Sparsame staubfarbene Partikel hinter dem Auto
- Start-Countdown, Race-Timer, Fortschrittsleiste und LootLocker-Bestzeiten mit LocalStorage-Fallback
- Web-Audio-Soundeffekte, Crash-Ripple und Touch-Steuerung

## Tech Stack
- **TypeScript** (strict mode)
- **HTML5 Canvas** (2D context, kein Game-Engine)
- **Vite 5** (Dev-Server + Build)
- Keine externen Runtime-Dependencies

## Ziel
~800–1500 LOC, 60 FPS, süchtig machender „noch eine Runde"-Faktor.
