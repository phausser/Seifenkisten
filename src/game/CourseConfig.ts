export interface CourseConfig {
  id: string;
  name: string;
  description: string;
  seed: number;
  numSegs: number;
  yStep: number;
  halfWidth: number;
  xLimit: number;
  curveStep: number;
  obstacleSeed: number;
  birdSeed: number;
  flowerSeed: number;
  roadLight: string;
  roadDark: string;
  grassLight: string;
  grassDark: string;
}

export const COURSES: readonly CourseConfig[] = [
  {
    id: 'time-drift',
    name: 'Time Drift',
    description: 'Ausgewogen',
    seed: 1337,
    numSegs: 15,
    yStep: 560,
    halfWidth: 140,
    xLimit: 520,
    curveStep: 300,
    obstacleSeed: 0xA5C3,
    birdSeed: 0xB1D5,
    flowerSeed: 0xD4F2,
    roadLight: '#b4b2b0',
    roadDark: '#a9a7a5',
    grassLight: '#427b3f',
    grassDark: '#386e35',
  },
  {
    id: 'serpentinen',
    name: 'Serpentinen',
    description: 'Eng und technisch',
    seed: 2027,
    numSegs: 17,
    yStep: 500,
    halfWidth: 125,
    xLimit: 620,
    curveStep: 390,
    obstacleSeed: 0x51A1,
    birdSeed: 0x711D,
    flowerSeed: 0xF102,
    roadLight: '#aaa8a6',
    roadDark: '#9f9d9b',
    grassLight: '#3e7a45',
    grassDark: '#326b3c',
  },
  {
    id: 'sprint',
    name: 'Sprintstrecke',
    description: 'Breit und schnell',
    seed: 9041,
    numSegs: 13,
    yStep: 620,
    halfWidth: 160,
    xLimit: 440,
    curveStep: 220,
    obstacleSeed: 0x90A7,
    birdSeed: 0xC0DE,
    flowerSeed: 0xBEEF,
    roadLight: '#b8b6b2',
    roadDark: '#adaba7',
    grassLight: '#467a3f',
    grassDark: '#3a6d36',
  },
];

export const DEFAULT_COURSE = COURSES[0];
