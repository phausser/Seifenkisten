/** All physics tuning values used by Car. */
export interface CarConfig {
  gravity:          number;
  roadDrag:         number;
  grassDrag:        number;
  lateralGrip:      number;
  driftSpeedFactor: number;
  grassLateralGrip: number;
  steerAccel:       number;
  steerSpeedFactor: number;
  angDamp:          number;
  brakeForce:       number;
  maxSpeed:         number;
  initSpeed:        number;
  color:            string;
}

/** User-facing setup: 3 continuous sliders [0..1] plus a color choice. */
export interface CarSetup {
  /** 0 = leicht, 1 = schwer */
  weight:     number;
  /** 0 = träge (stabil), 1 = direkt (agil) */
  steering:   number;
  /** 0 = hochaufbau (bremst gut), 1 = flach (hoher Topspeed) */
  aero:       number;
  colorIndex: number;
}

export const CAR_COLORS: ReadonlyArray<{ readonly label: string; readonly hex: string }> = [
  { label: 'ROT',     hex: '#e63030' },
  { label: 'SCHWARZ', hex: '#1a1a1a' },
  { label: 'GELB',    hex: '#f5c800' },
  { label: 'BLAU',    hex: '#1a6de6' },
  { label: 'WEISS',   hex: '#f0ece0' },
];

export const DEFAULT_SETUP: CarSetup = {
  weight:     0.5,
  steering:   0.5,
  aero:       0.5,
  colorIndex: 0,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Maps a CarSetup to concrete physics constants.
 *
 * ⚖️  Gewicht  — schwer = mehr Hangbeschleunigung, weniger Grip, schwächere Bremsen
 * 🔧  Lenkung  — direkt = schnelleres Einlenken, aber übersteuert leichter
 * 💨  Aero     — flach  = weniger Luftwiderstand → höherer Topspeed, kaum nat. Bremswirkung
 */
export function buildCarConfig(setup: CarSetup): CarConfig {
  return {
    gravity:          lerp(180, 310, setup.weight),
    lateralGrip:      lerp(11.0, 5.0, setup.weight),
    driftSpeedFactor: lerp(0.006, 0.014, setup.weight),
    brakeForce:       lerp(680, 340, setup.weight),
    initSpeed:        lerp(70, 110, setup.weight),

    steerAccel:       lerp(7.0, 16.0, setup.steering),
    angDamp:          lerp(14.0, 6.5, setup.steering),
    steerSpeedFactor: 0.0017,

    roadDrag:         lerp(0.90, 0.38, setup.aero),

    grassDrag:        3.2,
    grassLateralGrip: 1.2,
    maxSpeed:         500,

    color: CAR_COLORS[setup.colorIndex]?.hex ?? '#e63030',
  };
}
