import type { PieceType } from '../../domain/types';

export type Point = [radius: number, y: number];

function arc(cy: number, r: number, from: number, to: number, steps = 10, rx = r): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    pts.push([Math.max(0, rx * Math.cos(a)), cy + r * Math.sin(a)]);
  }
  return pts;
}

const BASE: Point[] = [
  [0, 0],
  [0.36, 0],
  [0.37, 0.035],
  [0.36, 0.075],
  [0.31, 0.095],
  [0.31, 0.135],
  [0.26, 0.17],
];

export interface MonsterTraits {
  legs: number;
  legLength: number;
  lift: number;
  teeth: number;
  toothSize: number;
  eyeSize: number;
  horns: number;
  tentacles: number;
  tongue: number;
  /** How far the jaw can open, in radians. */
  gape: number;
  /** Leg girth multiplier (1 = spindly spider legs). */
  legThickness?: number;
  /** Overall size multiplier of the monster form. */
  bulk?: number;
  name: string;
}

export interface PieceShape {
  /** Lathe profile from bottom to top. */
  profile: Point[];
  /** Height where the piece splits into lower/upper jaw. */
  mouthY: number;
  height: number;
  traits: MonsterTraits;
}

export const SHAPES: Record<PieceType, PieceShape> = {
  p: {
    profile: [
      ...BASE,
      [0.2, 0.21],
      [0.15, 0.29],
      [0.12, 0.4],
      [0.115, 0.455],
      [0.2, 0.475],
      [0.205, 0.505],
      [0.12, 0.525],
      ...arc(0.65, 0.155, -0.95, Math.PI / 2, 14),
    ],
    mouthY: 0.63,
    height: 0.81,
    traits: { legs: 4, legLength: 0.72, lift: 0.37, teeth: 9, toothSize: 0.06, eyeSize: 0.045, horns: 0, tentacles: 0, tongue: 0.4, gape: 1.35, name: 'Gnasher' },
  },
  r: {
    profile: [
      ...BASE,
      [0.23, 0.22],
      [0.2, 0.3],
      [0.19, 0.52],
      [0.21, 0.6],
      [0.27, 0.635],
      [0.275, 0.675],
      [0.25, 0.695],
      [0.25, 0.86],
      [0.19, 0.86],
      [0.19, 0.8],
      [0, 0.8],
    ],
    mouthY: 0.66,
    height: 0.96,
    traits: { legs: 2, legLength: 0.95, lift: 0.5, teeth: 12, toothSize: 0.085, eyeSize: 0.05, horns: 0, tentacles: 0, tongue: 0.9, gape: 1.75, legThickness: 2.0, bulk: 1.35, name: 'Tower Brute' },
  },
  n: {
    profile: [...BASE, [0.22, 0.22], [0.24, 0.27], [0.2, 0.29], [0, 0.29]],
    mouthY: 0.56,
    height: 1.0,
    traits: { legs: 4, legLength: 0.9, lift: 0.51, teeth: 8, toothSize: 0.05, eyeSize: 0.04, horns: 2, tentacles: 0, tongue: 0.5, gape: 0.9, name: 'Night Mare' },
  },
  b: {
    profile: [
      ...BASE,
      [0.18, 0.25],
      [0.13, 0.5],
      [0.12, 0.6],
      [0.22, 0.625],
      [0.22, 0.66],
      [0.12, 0.68],
      [0.11, 0.7],
      [0.135, 0.73],
      ...arc(0.86, 0.19, -0.75, Math.PI / 2 - 0.35, 12, 0.18),
      [0.04, 1.05],
      [0.055, 1.08],
      [0.06, 1.11],
      [0.04, 1.14],
      [0, 1.15],
    ],
    mouthY: 0.84,
    height: 1.15,
    traits: { legs: 4, legLength: 0.87, lift: 0.48, teeth: 10, toothSize: 0.05, eyeSize: 0.04, horns: 0, tentacles: 3, tongue: 1.6, gape: 1.2, name: 'Grave Paladin' },
  },
  q: {
    profile: [
      ...BASE,
      [0.19, 0.27],
      [0.13, 0.6],
      [0.12, 0.78],
      [0.24, 0.815],
      [0.24, 0.85],
      [0.14, 0.88],
      [0.15, 0.95],
      [0.21, 1.12],
      [0.235, 1.18],
      [0.18, 1.185],
      [0.12, 1.16],
      [0.08, 1.2],
      [0.07, 1.24],
      ...arc(1.29, 0.06, -1.2, Math.PI / 2, 8),
    ],
    mouthY: 1.0,
    height: 1.35,
    traits: { legs: 6, legLength: 1.04, lift: 0.61, teeth: 14, toothSize: 0.06, eyeSize: 0.045, horns: 0, tentacles: 6, tongue: 0.9, gape: 1.3, name: 'Hydra Regina' },
  },
  k: {
    profile: [
      ...BASE,
      [0.2, 0.27],
      [0.14, 0.6],
      [0.13, 0.82],
      [0.25, 0.855],
      [0.25, 0.89],
      [0.15, 0.92],
      [0.16, 0.99],
      [0.22, 1.18],
      [0.22, 1.24],
      [0.12, 1.27],
      [0.06, 1.3],
      [0, 1.3],
    ],
    mouthY: 1.05,
    height: 1.58,
    traits: { legs: 8, legLength: 1.16, lift: 0.68, teeth: 16, toothSize: 0.07, eyeSize: 0.05, horns: 2, tentacles: 0, tongue: 1.1, gape: 1.4, name: 'Abyss King' },
  },
};

/** Radius of a profile at height y (linear interpolation along the outline). */
export function radiusAt(profile: Point[], y: number): number {
  for (let i = 1; i < profile.length; i++) {
    const [r0, y0] = profile[i - 1];
    const [r1, y1] = profile[i];
    if ((y0 <= y && y <= y1) || (y1 <= y && y <= y0)) {
      if (y1 === y0) return Math.max(r0, r1);
      return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
  }
  return 0;
}

/** Splits a profile at y, returning lower and upper outlines that both include the cut point. */
export function splitProfile(profile: Point[], y: number): { lower: Point[]; upper: Point[] } {
  const r = radiusAt(profile, y);
  const lower: Point[] = profile.filter(([, py]) => py < y);
  lower.push([r, y]);
  const upper: Point[] = [[r, y], ...profile.filter(([, py]) => py > y)];
  return { lower, upper };
}
