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

## Phase 2: Physik der Seifenkiste (Priority: Critical)

- [ ] `Car`-Klasse mit Position, Velocity, Angle
- [ ] Beschleunigung durch "Gravity" (bergab)
- [ ] Lenkung mit Trägheit (angular velocity)
- [ ] Geschwindigkeitsabhängige Lenkempfindlichkeit
- [ ] Reibung / Drag (Straße vs. Gras)
- [ ] Rotation Damping
- [ ] Feintuning des Fahrgefühls

## Phase 3: Prozedurale Strecke

- [ ] Track Generation System (Bezier/Spline, immer bergab)
- [ ] Feste + variable Straßenbreite
- [ ] Rand-Markierungen (Heuballen als Barrieren)
- [ ] Start- und Ziellinie
- [ ] Kollisionserkennung mit Streckenrändern

## Phase 4: Hindernisse & Kollisionen

- [ ] Hindernis-Objekte (Strohballen, Reifen)
- [ ] Kollisionserkennung (Circle-Rect / Polygon)
- [ ] Kollisions-Response: Zurück in Mitte + 3s Zeitstrafe
- [ ] Screen-Flash + kurzes Freeze bei Crash

## Phase 5: Rendering & Effekte

- [ ] Pseudo-3D Straßenperspektive (Trapez-Segmente)
- [ ] Objekt-Scaling nach Y-Position
- [ ] Chronal-Partikeltrail hinter Auto
- [ ] Geschwindigkeitslinien (Speed Lines)
- [ ] Horizont mit Parallax

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

**Aktueller Status:** Phase 1 abgeschlossen. Bereit für Phase 2.
