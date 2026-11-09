import * as THREE from 'three';
import type { Color } from '../../domain/types';
import { CASTER_HAND, Gear, SHIELD_ARM, WEAPON_ARM, type GearSpec, type PoseTable } from './gear';
import { TEAM_GLOW, type PieceMaterials } from './materials';
import type { Point } from './profiles';

export type FigureType = 'b' | 'q' | 'k';

export function isFigureType(type: string): type is FigureType {
  return type === 'b' || type === 'q' || type === 'k';
}

/** Figures stand a little taller than the pieces so the royals look majestic. */
const FIGURE_SCALE: Record<FigureType, number> = { b: 1.15, q: 1.2, k: 1.2 };
const FIGURE_HEIGHT: Record<FigureType, number> = { b: 1.42, q: 1.45, k: 1.5 };

/** The queen holds her great staff upright and points or raises it to cast. */
const STAFF_ARM: PoseTable = {
  rest: { s: -0.2, e: -0.55, w: -2.35 },
  raise: { s: -2.75, e: -0.2, w: -0.15 },
  thrust: { s: -1.45, e: -0.1, w: -0.05 },
  strike: { s: -0.6, e: -0.05, w: 0.05 },
  guard: { s: -0.9, e: -0.8, w: -1.3 },
  lift: { s: -2.95, e: -0.15, w: -0.05 },
};

/** The king's sword hand rests on the hilt at his hip until he draws. */
const SWORD_ARM: PoseTable = {
  rest: { s: 0.12, e: -0.35, w: -0.2 },
  raise: { s: -2.9, e: -0.5, w: -0.5 },
  strike: { s: -1.0, e: -0.15, w: -0.45 },
  draw: { s: -0.3, e: -1.9, w: 0.6 },
  thrust: { s: -1.55, e: -0.05, w: 0.05 },
  guard: { s: -0.75, e: -0.9, w: -1.2 },
  lift: { s: -3.0, e: -0.1, w: -0.05 },
};

/** The king's free hand rests on his belt, or comes forward en garde. */
const FREE_ARM: PoseTable = {
  rest: { s: 0.1, e: -0.5, w: 0 },
  guard: { s: -0.6, e: -1.0, w: 0 },
  raise: { s: -0.4, e: -0.9, w: 0 },
  lift: { s: -0.3, e: -0.8, w: 0 },
};

const QUEEN_ARMS: GearSpec = {
  shoulderY: 1.07, shoulderX: 0.12, upper: 0.17, fore: 0.16, thickness: 0.022, splay: 0.25,
  right: { table: STAFF_ARM, item: 'greatstaff' },
  left: { table: CASTER_HAND, item: 'none' },
};

/** At rest the soldier shoulders arms: hand low at his side, blade upright beside him. */
const SHOULDER_ARMS: PoseTable = { ...WEAPON_ARM, rest: { s: 0.05, e: -0.55, w: -2.45 } };

/** The tin soldier: great sword in the right hand, kite shield on the left arm. */
const SOLDIER_ARMS: GearSpec = {
  shoulderY: 0.98, shoulderX: 0.16, upper: 0.18, fore: 0.17, thickness: 0.03, splay: 0.3,
  right: { table: SHOULDER_ARMS, item: 'greatsword' },
  left: { table: SHIELD_ARM, item: 'kite' },
};

/** Painted-tin colours per side: coat, trousers and plume. */
const UNIFORM: Record<Color, { coat: number; trousers: number; plume: number }> = {
  w: { coat: 0xc41e2a, trousers: 0xf3efe4, plume: 0xffffff },
  b: { coat: 0x1d2c6e, trousers: 0x17161d, plume: 0xc41e2a },
};

const KING_ARMS: GearSpec = {
  shoulderY: 1.11, shoulderX: 0.16, upper: 0.2, fore: 0.19, thickness: 0.03, splay: 0.3,
  right: { table: SWORD_ARM, item: 'longsword' },
  left: { table: FREE_ARM, item: 'none' },
};

function lathe(points: Point[], segments = 32): THREE.LatheGeometry {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/**
 * The bishop, queen and king do not become spiders: they come alive as people.
 * The bishop is a wind-up tin soldier with a shako, a painted coat, a great
 * sword and a kite shield, marching stiff-legged with its key turning.
 * The queen is a radiant lady in a gown with a tiara, flowing hair and a great
 * staff; the king is a lord with crown, cape and a sword at his belt that he
 * draws only to fight. Both are carved from the piece's own ivory or obsidian.
 */
export class Figure {
  readonly group = new THREE.Group();
  readonly gear: Gear;
  /** 0..1 the figure has replaced the chess piece. */
  amount = 0;
  /** 0..1 the king's sword is out of its scabbard (hand) instead of sheathed (belt). */
  drawn = 0;
  private readonly legs: THREE.Group[] = [];
  private readonly sparkles: THREE.Mesh[] = [];
  private readonly ownMaterials: THREE.Material[] = [];
  private readonly ownGeometries: THREE.BufferGeometry[] = [];
  private cape: THREE.Mesh | null = null;
  private capeRest: Float32Array | null = null;
  private skirt: THREE.Group | null = null;
  private sheathed: THREE.Group | null = null;
  /** The tin soldier's wind-up key, turning on its back. */
  private key: THREE.Group | null = null;
  /** Extra turns of the key while it is being wound (radians per second). */
  winding = 0;
  /** Stiff legs swing from the hip without bending the knee. */
  private stiff = false;

  constructor(readonly type: FigureType, color: Color, private readonly mats: PieceMaterials) {
    this.gear = new Gear(type === 'q' ? QUEEN_ARMS : type === 'k' ? KING_ARMS : SOLDIER_ARMS, color, mats);
    this.group.add(this.gear.group);
    if (type === 'q') this.buildQueen(color);
    else if (type === 'k') this.buildKing(color);
    else this.buildSoldier(color);
  }

  get height(): number {
    return FIGURE_HEIGHT[this.type] * FIGURE_SCALE[this.type];
  }

  /** Only the king carries his sword sheathed and draws it to fight. */
  get sheathable(): boolean {
    return this.sheathed !== null;
  }

  apply(time: number, gait: number, gaitPhase: number, hop = 0): void {
    const a = this.amount;
    this.group.visible = a > 0.01;
    // Rise out of the piece: grow from a squashed glow into full height.
    const k = FIGURE_SCALE[this.type];
    this.group.scale.set(Math.max(0.0001, a * k), Math.max(0.0001, a * a * k), Math.max(0.0001, a * k));
    // The arms are part of the figure, which already scales as a whole.
    this.gear.out = a > 0.01 ? 1 : 0;
    this.gear.apply(time, gait, gaitPhase);

    // Both hands' items: the sheathed sword shows on the belt until drawn.
    if (this.sheathed) {
      const out = this.drawn > 0.5;
      this.gear.item(0).visible = out;
      this.sheathed.visible = !out;
    }

    for (let i = 0; i < this.legs.length; i++) {
      const swing = Math.sin(gaitPhase + i * Math.PI) * (this.stiff ? 0.5 : 0.55) * gait;
      this.legs[i].rotation.x = swing;
      const knee = this.legs[i].children.find((c) => c.userData.knee) as THREE.Group | undefined;
      if (knee) knee.rotation.x = this.stiff ? 0 : Math.max(0, -Math.sin(gaitPhase + i * Math.PI + 0.6)) * 0.7 * gait;
    }
    // Stiff legs lift the whole toy as they swing past each other.
    const bob = this.stiff ? (1 - Math.cos(Math.sin(gaitPhase) * 0.5 * gait)) * 0.3 : Math.abs(Math.sin(gaitPhase)) * 0.025 * gait;
    this.group.position.y = hop + (this.legs.length ? bob : 0);
    if (this.stiff) this.group.rotation.z = Math.sin(gaitPhase) * 0.05 * gait;
    if (this.key) this.key.rotation.y = time * (1.2 + gait * 2 + this.winding);

    if (this.skirt) {
      // The gown sways as she glides.
      this.skirt.rotation.z = Math.sin(time * 2.1) * 0.02 + Math.sin(gaitPhase) * 0.04 * gait;
      this.skirt.rotation.x = -0.06 * gait;
      const flare = 1 + Math.sin(time * 3) * 0.015;
      this.skirt.scale.set(flare, 1, flare);
    }

    this.sparkles.forEach((s, i) => {
      const t = time * (0.8 + i * 0.13) + i * 1.7;
      const r = 0.32 + Math.sin(t * 1.3) * 0.06;
      s.position.set(Math.cos(t) * r, 0.25 + ((i * 0.23 + time * 0.12) % 1) * 1.2, Math.sin(t) * r);
      s.scale.setScalar(0.4 + Math.abs(Math.sin(time * 6 + i)) * 0.9);
    });

    if (this.cape && this.capeRest) {
      const pos = this.cape.geometry.attributes.position as THREE.BufferAttribute;
      const rest = this.capeRest;
      for (let i = 0; i < pos.count; i++) {
        const x = rest[i * 3];
        const y = rest[i * 3 + 1];
        const down = (1.12 - y) / 0.95; // 0 at the shoulders, 1 at the hem
        const wave = Math.sin(time * 2.4 + x * 6 + y * 3) * 0.02 + Math.sin(gaitPhase * 2 + x * 4) * 0.035 * gait;
        pos.setZ(i, rest[i * 3 + 2] - down * down * (0.08 + gait * 0.18) + wave * down);
      }
      pos.needsUpdate = true;
    }
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const g of this.ownGeometries) g.dispose();
    for (const m of this.ownMaterials) m.dispose();
    this.gear.dispose();
  }

  // ---------------------------------------------------------------- building

  private material(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial(params);
    this.ownMaterials.push(m);
    return m;
  }

  private glow(color: Color, boost = 2.4): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM_GLOW[color]).multiplyScalar(boost) });
    this.ownMaterials.push(m);
    return m;
  }

  private head(y: number, r: number, color: Color, skin: THREE.Material = this.mats.body, eyes?: THREE.Material): THREE.Group {
    const head = new THREE.Group();
    head.position.y = y;
    head.add(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), skin));
    const eyeMat = eyes ?? this.glow(color, 2.2);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 8, 6), eyeMat);
      eye.scale.set(1.3, 0.6, 0.6);
      eye.position.set(side * r * 0.36, r * 0.12, r * 0.9);
      head.add(eye);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.38, r * 0.45, r * 1.2, 12), skin);
    neck.position.y = -r * 1.05;
    head.add(neck);
    this.group.add(head);
    return head;
  }

  private buildQueen(color: Color): void {
    const white = color === 'w';
    // Gown: a wide bell skirt with a gold hem and a glowing trim.
    this.skirt = new THREE.Group();
    this.skirt.add(new THREE.Mesh(lathe([[0, 0], [0.36, 0], [0.35, 0.04], [0.3, 0.2], [0.23, 0.42], [0.16, 0.62], [0.115, 0.76], [0, 0.76]], 40), this.mats.body));
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.355, 0.016, 8, 48), this.mats.accent);
    hem.rotation.x = Math.PI / 2;
    hem.position.y = 0.03;
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.008, 6, 48), this.glow(color, 2));
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.18;
    this.skirt.add(hem, trim);
    // Overskirt panels in the accent colour.
    const stripe = this.glow(color, 1.6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.62, 0.012), stripe);
      panel.position.set(Math.sin(a) * 0.245, 0.36, Math.cos(a) * 0.245);
      panel.rotation.set(Math.cos(a) * 0.36, 0, -Math.sin(a) * 0.36);
      this.skirt.add(panel);
    }
    this.group.add(this.skirt);

    // Bodice and waist.
    const bodice = new THREE.Mesh(lathe([[0, 0.74], [0.11, 0.75], [0.1, 0.86], [0.125, 0.98], [0.135, 1.05], [0.09, 1.1], [0, 1.1]]), this.mats.body);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.013, 8, 32), this.mats.accent);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.77;
    const necklace = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 6, 24), this.mats.accent);
    necklace.rotation.x = Math.PI / 2 - 0.35;
    necklace.position.set(0, 1.09, 0.02);
    const pendant = new THREE.Mesh(new THREE.OctahedronGeometry(0.018), this.glow(color, 3));
    pendant.position.set(0, 1.04, 0.085);
    // High standing collar behind the head.
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.14, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8), this.mats.accent);
    (collar.material as THREE.Material).side = THREE.DoubleSide;
    collar.position.y = 1.16;
    this.group.add(bodice, belt, necklace, pendant, collar);

    // Head, flowing hair and tiara.
    const head = this.head(1.24, 0.08, color);
    const hairMat = this.material({ color: white ? 0xe8b84a : 0x6a0f2a, roughness: 0.35, metalness: 0.4, emissive: white ? 0x3a2400 : 0x1a0008 });
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.087, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    crown.rotation.x = -0.25;
    crown.position.set(0, 0.008, -0.008);
    const fall = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.32, 6, 12), hairMat);
    fall.scale.set(1.15, 1, 0.6);
    fall.position.set(0, -0.17, -0.06);
    fall.rotation.x = 0.12;
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), hairMat);
    bun.position.set(0, 0.06, -0.075);
    head.add(crown, fall, bun);
    const tiara = new THREE.Group();
    tiara.position.y = 0.06;
    tiara.rotation.x = -0.2;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.009, 6, 32), this.mats.accent);
    band.rotation.x = Math.PI / 2;
    tiara.add(band);
    const gem = this.glow(color, 3);
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.42;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.01, i === 0 ? 0.075 : 0.045, 5), this.mats.accent);
      spike.position.set(Math.sin(a) * 0.078, i === 0 ? 0.035 : 0.022, Math.cos(a) * 0.078);
      const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(i === 0 ? 0.016 : 0.009), gem);
      jewel.position.set(Math.sin(a) * 0.082, i === 0 ? 0.08 : 0.05, Math.cos(a) * 0.082);
      tiara.add(spike, jewel);
    }
    head.add(tiara);

    // Dazzle: tiny lights orbiting her.
    const sparkleMat = this.glow(color, 3);
    const sparkleGeo = new THREE.OctahedronGeometry(0.012);
    this.ownGeometries.push(sparkleGeo);
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(sparkleGeo, sparkleMat);
      s.castShadow = false;
      this.sparkles.push(s);
      this.group.add(s);
    }
  }

  private buildSoldier(color: Color): void {
    const uniform = UNIFORM[color];
    // Painted tin: glossy, a little metallic.
    const paint = (c: number) => this.material({ color: c, roughness: 0.32, metalness: 0.45 });
    const coat = paint(uniform.coat);
    const trousers = paint(uniform.trousers);
    const black = paint(0x101014);
    const white = paint(0xf6f3ea);
    const gold = this.material({ color: 0xe0b040, roughness: 0.25, metalness: 0.9 });
    const skin = paint(0xf0c4a0);
    this.stiff = true;

    // Stand: the little base every toy soldier is cast on.
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.04, 28), this.mats.body);
    stand.position.y = 0.02;
    this.group.add(stand);

    // Straight legs with a side stripe and tall black boots.
    const legGeo = new THREE.CylinderGeometry(0.042, 0.038, 0.5, 10);
    legGeo.translate(0, -0.25, 0);
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.07, 0.56, 0);
      hip.userData.hip = true;
      hip.add(new THREE.Mesh(legGeo, trousers));
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.32, 0.012), coat);
      stripe.position.set(side * 0.042, -0.2, 0);
      hip.add(stripe);
      const knee = new THREE.Group();
      knee.position.y = -0.3;
      knee.userData.knee = true;
      const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.22, 10), black);
      boot.position.y = -0.11;
      const toe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.14), black);
      toe.position.set(0, -0.2, 0.03);
      knee.add(boot, toe);
      hip.add(knee);
      this.group.add(hip);
      this.legs.push(hip);
    }

    // Coat with tails, white cross belts and a row of gold buttons.
    const jacket = new THREE.Mesh(lathe([[0, 0.5], [0.13, 0.5], [0.135, 0.6], [0.125, 0.7], [0.14, 0.85], [0.15, 0.97], [0.12, 1.03], [0.05, 1.06], [0, 1.06]]), coat);
    const tails = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.02), coat);
    tails.position.set(0, 0.46, -0.12);
    tails.rotation.x = 0.15;
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.016, 8, 32), white);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.62;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.015), gold);
    buckle.position.set(0, 0.62, 0.14);
    this.group.add(jacket, tails, belt, buckle);
    for (const side of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.012), white);
      strap.position.set(0, 0.82, 0.135);
      strap.rotation.z = side * 0.62;
      this.group.add(strap);
      // Gold epaulettes with a fringe.
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.02, 14), gold);
      pad.position.set(side * 0.15, 1.0, 0);
      const fringe = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.04, 14, 1, true), gold);
      fringe.position.set(side * 0.15, 0.975, 0);
      this.group.add(pad, fringe);
    }
    for (let i = 0; i < 4; i++) {
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), gold);
      const y = 0.68 + i * 0.08;
      button.position.set(0, y, 0.128 + (y > 0.85 ? 0.012 : 0));
      this.group.add(button);
    }
    // High collar.
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 16), coat);
    collar.position.y = 1.07;
    this.group.add(collar);

    // Head: rosy cheeks, dot eyes, a black moustache and a tall shako.
    const head = this.head(1.17, 0.085, color, skin, black);
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), paint(0xe2606a));
      cheek.position.set(side * 0.05, -0.01, 0.065);
      cheek.scale.set(1, 0.7, 0.4);
      const tash = new THREE.Mesh(new THREE.CapsuleGeometry(0.01, 0.04, 3, 6), black);
      tash.rotation.z = Math.PI / 2 + side * 0.35;
      tash.position.set(side * 0.022, -0.035, 0.08);
      head.add(cheek, tash);
    }
    const shako = new THREE.Group();
    shako.position.y = 0.05;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.2, 20), black);
    drum.position.y = 0.1;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.087, 0.087, 0.025, 20), gold);
    band.position.y = 0.015;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.103, 0.1, 0.02, 20), gold);
    top.position.y = 0.2;
    const plate = new THREE.Mesh(new THREE.CircleGeometry(0.035, 6), gold);
    plate.position.set(0, 0.09, 0.094);
    plate.rotation.x = -0.08;
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.01, 20, 1, false, -Math.PI / 2, Math.PI), black);
    visor.position.set(0, 0.0, 0.025);
    visor.rotation.x = 0.25;
    const plume = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.08, 4, 10), paint(uniform.plume));
    plume.position.y = 0.27;
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.006, 6, 24, Math.PI), gold);
    strap.rotation.set(0, Math.PI / 2, Math.PI);
    strap.position.y = 0.0;
    shako.add(drum, band, top, plate, visor, plume, strap);
    head.add(shako);

    // Wind-up key in its back.
    this.key = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), gold);
    shaft.position.y = 0.045;
    const bow = new THREE.Group();
    bow.position.y = 0.1;
    for (const side of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 8, 18), gold);
      loop.position.x = side * 0.04;
      bow.add(loop);
    }
    this.key.add(shaft, bow);
    // The key turns around its shaft, which points backward out of the coat.
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.85, -0.12);
    pivot.rotation.x = -Math.PI / 2;
    pivot.add(this.key);
    this.group.add(pivot);
  }

  private buildKing(color: Color): void {
    const white = color === 'w';
    // Legs with boots.
    const thighGeo = new THREE.CapsuleGeometry(0.045, 0.22, 4, 10);
    thighGeo.translate(0, -0.14, 0);
    const shinGeo = new THREE.CapsuleGeometry(0.04, 0.22, 4, 10);
    shinGeo.translate(0, -0.14, 0);
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.075, 0.6, 0);
      hip.userData.hip = true;
      hip.add(new THREE.Mesh(thighGeo, this.mats.carapace));
      const knee = new THREE.Group();
      knee.position.y = -0.29;
      knee.userData.knee = true;
      knee.add(new THREE.Mesh(shinGeo, this.mats.carapace));
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.15), this.mats.accent);
      boot.position.set(0, -0.28, 0.025);
      knee.add(boot);
      hip.add(knee);
      this.group.add(hip);
      this.legs.push(hip);
    }

    // Tunic and chest.
    const tunic = new THREE.Mesh(lathe([[0, 0.4], [0.17, 0.4], [0.16, 0.55], [0.14, 0.66], [0.155, 0.85], [0.175, 1.02], [0.15, 1.11], [0.06, 1.15], [0, 1.15]]), this.mats.body);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.143, 0.018, 8, 32), this.mats.accent);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.66;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.02), this.glow(color, 2));
    buckle.position.set(0, 0.66, 0.155);
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.42, 0.01), this.mats.accent);
    sash.position.set(0.02, 0.88, 0.165);
    sash.rotation.set(-0.08, 0, 0.55);
    this.group.add(tunic, belt, buckle, sash);

    // Scabbard on the right hip with the sheathed sword's hilt showing.
    const scabbardGroup = new THREE.Group();
    scabbardGroup.position.set(-0.165, 0.66, 0.02);
    scabbardGroup.rotation.set(-0.55, 0, -0.18);
    const scabbard = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.014, 0.46, 10), this.mats.accent);
    scabbard.position.y = -0.24;
    scabbardGroup.add(scabbard);
    this.sheathed = new THREE.Group();
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), this.mats.carapace);
    grip.position.y = 0.06;
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.025), this.mats.accent);
    cross.position.y = 0.01;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), this.glow(color, 2));
    pommel.position.y = 0.115;
    this.sheathed.add(grip, cross, pommel);
    scabbardGroup.add(this.sheathed);
    this.group.add(scabbardGroup);

    // Royal cape hanging from the shoulders, with an ermine collar.
    const capeMat = this.material({
      color: white ? 0x7a0f1e : 0x2a0b4a,
      roughness: 0.75,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(TEAM_GLOW[color]),
      emissiveIntensity: 0.04,
    });
    const capeGeo = new THREE.PlaneGeometry(0.44, 0.95, 6, 10);
    capeGeo.translate(0, 1.12 - 0.475, -0.17);
    // Curve it around the back.
    const p = capeGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const widen = 1 + (1.12 - y) * 0.45;
      p.setX(i, x * widen);
      p.setZ(i, p.getZ(i) + (x * x) * 1.2);
    }
    capeGeo.computeVertexNormals();
    this.cape = new THREE.Mesh(capeGeo, capeMat);
    this.capeRest = Float32Array.from(p.array as Float32Array);
    const ermine = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.035, 8, 24), this.material({ color: 0xf4f1ea, roughness: 0.9 }));
    ermine.rotation.x = Math.PI / 2;
    ermine.position.y = 1.12;
    ermine.scale.set(1, 0.85, 1);
    this.group.add(this.cape, ermine);

    // Head: short hair, a noble beard and a crown.
    const head = this.head(1.27, 0.088, color);
    const hairMat = this.material({ color: white ? 0xc9a24a : 0x14101c, roughness: 0.6, metalness: 0.2 });
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.094, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
    hair.rotation.x = -0.35;
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 12), hairMat);
    beard.rotation.x = Math.PI;
    beard.position.set(0, -0.08, 0.04);
    beard.scale.set(1, 1, 0.7);
    head.add(hair, beard);
    const crown = new THREE.Group();
    crown.position.y = 0.065;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.085, 0.055, 24, 1, true), this.mats.accent);
    (ring.material as THREE.Material).side = THREE.DoubleSide;
    crown.add(ring);
    const gem = this.glow(color, 3);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const point = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 4), this.mats.accent);
      point.position.set(Math.sin(a) * 0.088, 0.055, Math.cos(a) * 0.088);
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), gem);
      jewel.position.set(Math.sin(a) * 0.092, 0.005, Math.cos(a) * 0.092);
      crown.add(point, jewel);
    }
    const orbCross = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.06, 0.014), this.mats.accent);
    orbCross.position.y = 0.1;
    const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.014), this.mats.accent);
    crossBar.position.y = 0.11;
    crown.add(orbCross, crossBar);
    head.add(crown);
    // Pauldrons.
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.accent);
      pad.position.set(side * 0.16, 1.1, 0);
      this.group.add(pad);
    }
  }
}
