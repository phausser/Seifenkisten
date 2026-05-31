# Seifenkisten Rennen

Ein 2D-Top-Down-Seifenkisten-Rennspiel, gebaut mit HTML5 Canvas, TypeScript und Vite.

## Spielidee

Steuere deine Seifenkiste einen Hang hinunter, drifte durch Kurven, weiche Heuballen und Reifen aus und erreiche das Ziel so schnell wie möglich. Kollisionen kosten Zeit. Bestzeiten werden online oder lokal gespeichert.

## Installation

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm run dev       # → http://localhost:5173
npm run build     # Produktions-Build nach dist/
npm run preview   # lokalen Produktions-Build testen
```

## Optionale Online-Bestenliste

Ohne Konfiguration nutzt das Spiel nur lokale Highscores. Für LootLocker eine `.env.local` anlegen:

```
VITE_LOOTLOCKER_API_KEY=dein_api_key
VITE_LOOTLOCKER_LEADERBOARD_KEY=dein_leaderboard_key
# optional:
VITE_LOOTLOCKER_API_BASE=https://api.lootlocker.io/game
VITE_LOOTLOCKER_GAME_VERSION=0.1.0
```

## Steuerung

| Taste | Aktion |
|-------|--------|
| ← / A | Lenken links |
| → / D | Lenken rechts |
| ↓ / S | Bremsen |
| Space / Enter | Bestätigen |
| ESC | Zurück zum Menü |

Touch: unten links/rechts lenken, unten mittig bremsen. Im Menü lassen sich Setup-Slider und Farbauswahl per Pointer/Touch bedienen.

## Entwicklung

- Rendering läuft komplett über Canvas 2D; es gibt keine externen Game- oder Physics-Engines.
- Logische Höhe ist 720 px, die Breite passt sich dem Viewport an.
- Der Build ist für GitHub Pages vorbereitet: In CI wird der Vite-`base`-Pfad aus `GITHUB_REPOSITORY` abgeleitet.

## Lizenz

MIT License

Copyright (c) 2025 phausser

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
