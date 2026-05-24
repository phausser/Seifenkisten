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
- [x] State Machine: `menu | race | crash | finish | highscores`
- [x] Menu Screen (Titel + Neon-Glow, Start-Hint)
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
- [x] Rand-Markierungen (Heuballen, zufällig platziert)
- [x] Start- und Ziellinie (farbige Streifen + Label)
- [x] `getEdgesAt(worldY)` für Kollisionserkennung (Phase 4)

## Phase 4: Hindernisse & Kollisionen ✅

- [x] Hindernis-Objekte (Strohballen + Reifen, auf der Fahrbahn platziert)
- [x] Kollisionserkennung (Kreis-Kreis, Car-Radius 18)
- [x] Kollisions-Response: lateralOffset bounce + 0.45s Freeze
- [x] Screen-Flash (roter Overlay) + „−3s" Popup bei Crash
- [x] Border-Kollision (Streckenrand, bereit für Phase 2 Physik)
- [x] Schatten auf allen 3D-Objekten (Heuballen, Reifen, Auto), keine Outlines

## Phase 5: Rendering & Effekte ✅

- [x] Pseudo-3D Straßenperspektive (Trapez-Segmente)  — perspScale 0.65→1.35, alternating stripes + center dashes
- [x] Objekt-Scaling nach Y-Position                  — alle Hindernisse + Heuballen perspScale'd
- [x] Chronal-Partikeltrail hinter Auto               — ParticleSystem, cyan/blau, Glow
- [x] Geschwindigkeitslinien (Speed Lines)            — radial ab 160 u/s
- [x] Horizont mit Parallax                           — Sky-Gradient + 2 Hügelebenen (20 % / 45 % parallax)

## Phase 6: Game Systems

- [ ] Timer (großes Display oben links)
- [ ] Fortschrittsanzeige / Mini-Map (unten)
- [ ] Renn-Zustände vollständig (Start-Countdown, Finish)
- [ ] Highscore System mit LocalStorage (Top 10)
- [ ] Name-Eingabe bei neuem Highscore

## Phase 7: Polish

- [ ] Sound Effekte (Web Audio API)
- [ ] Vollständiges Menü mit Highscore-Screen
- [ ] Time-Ripple-Effekt bei Kollision
- [ ] Mobile Touch Support (optional)
- [ ] Performance Optimierungen

---

**Aktueller Status:** Phase 2 + 5 abgeschlossen. Als nächstes: Phase 6 (Timer, Highscore).
