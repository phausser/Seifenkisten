# TODO.md - Seifenkisten Rennen: Time Attack

## Phase 0: Projekt Setup ✅
- [x] SPEC.md erstellt
- [x] TODO.md erstellt
- [x] AGENTS.md erstellt
- [x] README.md erstellt

## Phase 1: Grundgerüst ✅
- [x] Projekt mit Vite + TypeScript initialisieren
- [x] `index.html` mit Canvas (1280×720, letterboxed)
- [x] Game Loop (requestAnimationFrame, fixed timestep 60 Hz, dt cap)
- [x] Input Handling (`InputHandler`: held, wasPressed, wasReleased, steerAxis)
- [x] State Machine: `menu | countdown | race | crash | finish | highscores`
- [x] Menu Screen (Titel + Start-Hint)
- [x] Race Placeholder (Gras, Straße, Platzhalter-Auto)
- [x] FPS-Counter (Dev-Overlay)
- [x] Responsive Canvas Scaling

## Phase 2: Physik der Seifenkiste ✅

- [x] `Car`-Klasse mit Position, Velocity, Angle  (vx/vy + angle + angularVel)
- [x] Beschleunigung durch "Gravity" (bergab)  — entlang Track-Tangente
- [x] Lenkung mit Trägheit (angular velocity)  — inkl. Damping
- [x] Geschwindigkeitsabhängige Lenkempfindlichkeit
- [x] Reibung / Drag (Straße vs. Gras)  — separates drag + lateral grip
- [x] Rotation Damping
- [x] Feintuning des Fahrgefühls  — Rolling start, bounce collision response

## Phase 3: Prozedurale Strecke ✅

- [x] Track Generation System (Catmull-Rom Spline, immer bergab)
- [x] Feste Straßenbreite (variable Breite → Phase 5 Polish)
- [x] Rand-Heuballen: dicht am Rand, unregelmäßige Abstände, parallel zur Straßenkante mit ±5° Jitter
- [x] Start- und Ziellinie (farbige Streifen + Label)
- [x] `getEdgesAt(worldY)` für Kollisionserkennung (Phase 4)

## Phase 4: Hindernisse & Kollisionen ✅

- [x] Hindernis-Objekte (Strohballen + Reifen, auf der Fahrbahn platziert)
- [x] Kollisionserkennung (Kreis-Kreis, Car-Radius 18)
- [x] Kollisions-Response: lateralOffset bounce + 0.45s Freeze
- [x] Screen-Flash (roter Overlay) + „+3s" Popup bei Crash
- [x] Border-Kollision (Streckenrand, bereit für Phase 2 Physik)
- [x] Weichgezeichnete dunkle Schatten auf Heuballen, Reifen und Auto, keine Outlines

## Phase 5: Rendering & Effekte

- [x] Top-down Road Rendering                         — feste Breite, alternating stripes + center dashes, keine Randlinien
- [x] Object-Scaling entfernt                         — Hindernisse/Heuballen bleiben feste Größe
- [x] Staub-Partikel hinter Auto                      — sparsam, braun/tan, kein Glow
- [x] Geschwindigkeitslinien (Speed Lines)            — radial ab 160 u/s
- [ ] Horizont mit Parallax                           — aktuell nicht umgesetzt

## Phase 6: Game Systems ✅

- [x] Timer / Race Time Anzeige
- [x] Fortschrittsanzeige unten
- [x] Renn-Zustände vollständig (Start-Countdown, Finish)
- [x] Highscore System mit LocalStorage (Top 10)
- [x] Name-Eingabe bei neuem Highscore

## Phase 7: Polish

- [ ] Sound Effekte (Web Audio API)
- [x] Vollständiges Menü mit Highscore-Screen
- [ ] Time-Ripple-Effekt bei Kollision
- [ ] Mobile Touch Support (optional)
- [ ] Performance Optimierungen

---

**Aktueller Status:** Phase 2–6 abgeschlossen. Als nächstes: Phase 7 Polish.
