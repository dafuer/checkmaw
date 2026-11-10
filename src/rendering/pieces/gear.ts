import * as THREE from 'three';
import type { Color, PieceType } from '../../domain/types';
import { TEAM_GLOW, type PieceMaterials } from './materials';

/**
 * Arm angles in radians, all in the piece's forward/up plane:
 * shoulder (s), elbow (e) and wrist (w) bend around the local X axis.
 * The held item points along (0, -cos(s+e+w), -sin(s+e+w)): 0 is down,
 * -PI/2 is forward and -PI is straight up.
 */
interface ArmAngles {
  s: number;
  e: number;
  w: number;
}

/** Named poses the battle and march directors blend with 0..1 weights. */
export interface GearPose {
  /** Weapon cocked overhead (wind-up). */
  raise: number;
  /** Downward blow, ends with the weapon forward. */
  strike: number;
  /** Hand pulled back with the point forward (before a thrust). */
  draw: number;
  /** Arm fully extended forward (stab, staff pointing, punch). */
  thrust: number;
  /** Shield held in front. */
  guard: number;
  /** Both arms reaching forward (grabbing). */
  grab: number;
  /** Both arms overhead (lifting something). */
  lift: number;
}

export type PoseTable = { rest: ArmAngles } & Partial<Record<keyof GearPose, ArmAngles>>;

export const WEAPON_ARM: PoseTable = {
  rest: { s: -0.25, e: -1.1, w: -1.5 },
  raise: { s: -2.9, e: -0.5, w: -0.5 },
  strike: { s: -1.0, e: -0.15, w: -0.45 },
  draw: { s: -0.3, e: -1.9, w: 0.6 },
  thrust: { s: -1.55, e: -0.05, w: 0.05 },
  grab: { s: -1.35, e: -0.35, w: -0.2 },
  lift: { s: -2.9, e: -0.3, w: 0 },
};

export const SHIELD_ARM: PoseTable = {
  rest: { s: -0.4, e: -1.0, w: 0 },
  guard: { s: -1.25, e: -0.35, w: 0 },
  raise: { s: -0.9, e: -0.8, w: 0 },
  grab: { s: -1.35, e: -0.35, w: 0 },
  lift: { s: -2.9, e: -0.3, w: 0 },
};

const BRUTE_ARM: PoseTable = {
  rest: { s: -0.15, e: -0.35, w: 0 },
  raise: { s: -3.0, e: -0.4, w: 0 },
  strike: { s: -0.95, e: -0.1, w: 0 },
  draw: { s: 0.4, e: -1.6, w: 0 },
  thrust: { s: -1.55, e: 0, w: 0 },
  grab: { s: -1.3, e: -0.4, w: 0 },
  lift: { s: -2.95, e: -0.25, w: 0 },
};

export const CASTER_HAND: PoseTable = {
  rest: { s: -0.3, e: -1.2, w: 0 },
  raise: { s: -2.6, e: -0.3, w: 0 },
  thrust: { s: -1.5, e: -0.1, w: 0 },
  grab: { s: -1.35, e: -0.35, w: 0 },
  lift: { s: -2.9, e: -0.3, w: 0 },
  guard: { s: -1.2, e: -0.6, w: 0 },
};

export type Item = 'shortsword' | 'buckler' | 'greatsword' | 'kite' | 'greatstaff' | 'longsword' | 'fist' | 'none';

export interface ArmSpec {
  table: PoseTable;
  item: Item;
}

export interface GearSpec {
  shoulderY: number;
  shoulderX: number;
  upper: number;
  fore: number;
  thickness: number;
  splay: number;
  right: ArmSpec;
  left: ArmSpec;
}

/**
 * Arms for the monster forms. The knight fights mounted (see mount.ts); the
 * bishop, queen and king become figures with their own arms (see figure.ts).
 */
const GEAR: Partial<Record<PieceType, GearSpec>> = {
  p: {
    shoulderY: 0.49, shoulderX: 0.2, upper: 0.15, fore: 0.14, thickness: 0.026, splay: 0.3,
    right: { table: WEAPON_ARM, item: 'shortsword' },
    left: { table: SHIELD_ARM, item: 'buckler' },
  },
  r: {
    shoulderY: 0.6, shoulderX: 0.27, upper: 0.3, fore: 0.3, thickness: 0.065, splay: 0.4,
    right: { table: BRUTE_ARM, item: 'fist' },
    left: { table: BRUTE_ARM, item: 'fist' },
  },
};

const POSE_KEYS: Array<keyof GearPose> = ['raise', 'strike', 'draw', 'thrust', 'guard', 'grab', 'lift'];

interface Arm {
  shoulder: THREE.Group;
  elbow: THREE.Group;
  wrist: THREE.Group;
  table: PoseTable;
  side: number;
  item: THREE.Group;
}

export function hasGear(type: PieceType): boolean {
  return GEAR[type] !== undefined;
}

export function gearSpec(type: PieceType): GearSpec {
  const spec = GEAR[type];
  if (!spec) throw new Error(`No gear for piece type ${type}`);
  return spec;
}

/**
 * Procedural arms with a per-type loadout (sword and buckler, great sword and
 * kite shield, brute fists, staff, war hammer). Poses are blended from named
 * weights so choreography stays declarative.
 */
export class Gear {
  readonly group = new THREE.Group();
  readonly pose: GearPose = { raise: 0, strike: 0, draw: 0, thrust: 0, guard: 0, grab: 0, lift: 0 };
  /** 0..1, arms grow out of the body. */
  out = 0;
  private readonly arms: Arm[] = [];
  private readonly tipAnchor = new THREE.Object3D();
  private readonly ownMaterials: THREE.Material[] = [];
  readonly spec: GearSpec;

  constructor(spec: GearSpec, color: Color, private readonly mats: PieceMaterials) {
    this.spec = spec;
    this.arms.push(this.buildArm(spec, spec.right, -1, color));
    this.arms.push(this.buildArm(spec, spec.left, 1, color));
  }

  /** The group holding the right (0) or left (1) hand's item, to show or hide it. */
  item(arm: 0 | 1): THREE.Group {
    return this.arms[arm].item;
  }

  /** World position of the weapon tip (or the right hand when unarmed). */
  tip(target = new THREE.Vector3()): THREE.Vector3 {
    return this.tipAnchor.getWorldPosition(target);
  }

  /** World position of the right hand, where the weapon is held. */
  grip(target = new THREE.Vector3()): THREE.Vector3 {
    return this.arms[0].wrist.getWorldPosition(target);
  }

  apply(time: number, gait: number, gaitPhase: number): void {
    const out = this.out;
    this.group.visible = out > 0.01;
    this.group.scale.setScalar(Math.max(0.0001, out));
    const p = this.pose;
    for (const arm of this.arms) {
      const { rest } = arm.table;
      let s = rest.s;
      let e = rest.e;
      let w = rest.w;
      for (const key of POSE_KEYS) {
        const weight = p[key];
        const target = arm.table[key];
        if (!weight || !target) continue;
        s += (target.s - rest.s) * weight;
        e += (target.e - rest.e) * weight;
        w += (target.w - rest.w) * weight;
      }
      // Arms swing opposite to each other while walking; idle sway otherwise.
      s += Math.sin(gaitPhase + (arm.side > 0 ? Math.PI : 0)) * 0.45 * gait;
      s += Math.sin(time * 1.7 + arm.side) * 0.04;
      arm.shoulder.rotation.x = s;
      arm.elbow.rotation.x = e;
      arm.wrist.rotation.x = w;
      const spin = arm.item.userData.spin as THREE.Object3D[] | undefined;
      spin?.forEach((o, i) => (o.rotation.x = time * (i ? 1.3 : -1.7)));
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const m of this.ownMaterials) m.dispose();
  }

  // ---------------------------------------------------------------- building

  private buildArm(spec: GearSpec, armSpec: ArmSpec, side: number, color: Color): Arm {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * spec.shoulderX, spec.shoulderY, 0);
    shoulder.rotation.order = 'ZXY';
    shoulder.rotation.z = side * spec.splay * 0.5;
    const pad = new THREE.Mesh(new THREE.SphereGeometry(spec.thickness * 1.9, 12, 8), this.mats.accent);
    pad.scale.set(1, 0.8, 1);
    shoulder.add(pad);

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(spec.thickness, spec.upper, 4, 8), this.mats.carapace);
    upper.position.y = -spec.upper / 2;
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.y = -spec.upper;
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(spec.thickness * 0.85, spec.fore, 4, 8), this.mats.carapace);
    fore.position.y = -spec.fore / 2;
    elbow.add(fore);
    shoulder.add(elbow);

    const wrist = new THREE.Group();
    wrist.position.y = -spec.fore;
    elbow.add(wrist);
    // Correct the splay so held items stay in the vertical plane.
    wrist.rotation.z = -side * spec.splay * 0.5;
    const fist = new THREE.Mesh(new THREE.SphereGeometry(spec.thickness * 1.25, 10, 8), this.mats.carapace);
    wrist.add(fist);
    const item = new THREE.Group();
    wrist.add(item);
    this.buildItem(armSpec.item, item, fist, color, side);

    this.group.add(shoulder);
    return { shoulder, elbow, wrist, table: armSpec.table, side, item };
  }

  private glowMaterial(color: Color, intensity: number): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: new THREE.Color(TEAM_GLOW[color]),
      emissiveIntensity: intensity,
      roughness: 0.4,
    });
    this.ownMaterials.push(mat);
    return mat;
  }

  private steelMaterial(): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9dee8, metalness: 1, roughness: 0.22 });
    this.ownMaterials.push(mat);
    return mat;
  }

  private buildItem(item: Item, hand: THREE.Group, fist: THREE.Mesh, color: Color, side: number): void {
    switch (item) {
      case 'shortsword':
        this.buildBlade(hand, color, 0.3, 0.032, 0.1, false);
        break;
      case 'greatsword':
        this.buildBlade(hand, color, 0.72, 0.055, 0.2, true);
        break;
      case 'buckler': {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 24), this.mats.accent);
        disc.position.y = -0.03;
        const boss = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), this.steelMaterial());
        boss.position.y = -0.045;
        hand.add(disc, boss);
        break;
      }
      case 'kite': {
        const s = new THREE.Shape();
        s.moveTo(0, 0.15);
        s.quadraticCurveTo(0.13, 0.14, 0.12, 0.02);
        s.quadraticCurveTo(0.1, -0.12, 0, -0.22);
        s.quadraticCurveTo(-0.1, -0.12, -0.12, 0.02);
        s.quadraticCurveTo(-0.13, 0.14, 0, 0.15);
        const geo = new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2 });
        // Plate lies across the forearm so it faces forward when the arm points ahead.
        geo.rotateX(Math.PI / 2);
        const plate = new THREE.Mesh(geo, this.mats.body);
        plate.position.y = -0.03;
        const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.26), this.glowMaterial(color, 2.2));
        crossV.position.set(0, -0.06, -0.03);
        const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.03), this.glowMaterial(color, 2.2));
        crossH.position.set(0, -0.06, 0.03);
        hand.add(plate, crossV, crossH);
        break;
      }
      case 'greatstaff': {
        // A tall sceptre-staff: crystal star on top, gold rings and ribbons.
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.25, 10), this.mats.accent);
        rod.position.y = -0.3;
        const crystalMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: new THREE.Color(TEAM_GLOW[color]),
          emissiveIntensity: 3,
          roughness: 0.1,
          metalness: 0.2,
        });
        this.ownMaterials.push(crystalMat);
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), crystalMat);
        crystal.scale.set(0.8, 1.5, 0.8);
        crystal.position.y = -1.02;
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.01, 6, 28), this.mats.accent);
        halo.position.y = -1.02;
        const halo2 = halo.clone();
        halo2.rotation.y = Math.PI / 2;
        const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.014, 6, 20, Math.PI), this.mats.accent);
        crescent.position.y = -0.9;
        crescent.rotation.z = Math.PI;
        const foot = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 8), this.mats.accent);
        foot.position.y = 0.36;
        hand.add(rod, crystal, halo, halo2, crescent, foot);
        hand.userData.spin = [halo, halo2];
        this.tipAnchor.position.y = -1.02;
        hand.add(this.tipAnchor);
        break;
      }
      case 'longsword':
        this.buildBlade(hand, color, 0.6, 0.04, 0.16, true);
        break;
      case 'fist': {
        fist.scale.setScalar(1.5);
        const steel = this.steelMaterial();
        for (let i = 0; i < 4; i++) {
          const stud = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 5), steel);
          stud.position.set((i - 1.5) * 0.04, -0.07, 0.035);
          stud.rotation.x = Math.PI;
          hand.add(stud);
        }
        if (side < 0) {
          this.tipAnchor.position.y = -0.06;
          hand.add(this.tipAnchor);
        }
        break;
      }
      case 'none':
        break;
    }
  }

  private buildBlade(hand: THREE.Group, color: Color, length: number, width: number, guard: number, runes: boolean): void {
    const steel = this.steelMaterial();
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, guard * 0.6 + 0.05, 8), this.mats.carapace);
    grip.position.y = 0.02;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), this.mats.accent);
    pommel.position.y = 0.05 + guard * 0.3;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(guard, 0.025, 0.035), this.mats.accent);
    cross.position.y = -0.04;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(width, length, width * 0.22), steel);
    blade.position.y = -0.05 - length / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(width * 0.72, width * 1.6, 4), steel);
    tip.rotation.x = Math.PI;
    tip.rotation.y = Math.PI / 4;
    tip.scale.set(1, 1, 0.3);
    tip.position.y = -0.05 - length - width * 0.8;
    hand.add(grip, pommel, cross, blade, tip);
    if (runes) {
      const fuller = new THREE.Mesh(new THREE.BoxGeometry(width * 0.3, length * 0.8, width * 0.25), this.glowMaterial(color, 2.6));
      fuller.position.y = -0.05 - length * 0.45;
      hand.add(fuller);
    }
    this.tipAnchor.position.y = -0.05 - length;
    hand.add(this.tipAnchor);
  }
}
