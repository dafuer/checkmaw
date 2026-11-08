import * as THREE from 'three';
import type { Color, PieceType } from '../../domain/types';
import { createMaterials, TEAM_GLOW, type PieceMaterials } from './materials';
import { radiusAt, SHAPES, splitProfile, type MonsterTraits, type Point } from './profiles';

const LATHE_SEGMENTS = 48;

function lathe(points: Point[]): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    LATHE_SEGMENTS,
  );
}

function shadowed<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}

interface Leg {
  hip: THREE.Group;
  knee: THREE.Group;
  thigh: THREE.Mesh;
  shin: THREE.Mesh;
  angle: number;
  phase: number;
}

interface Chain {
  root: THREE.Group;
  joints: THREE.Group[];
  phase: number;
}

/**
 * A chess piece that can split along its "mouth" line and grow into a monster:
 * jaw hinge, teeth, glowing eyes, spider legs, tongue, horns and tentacles.
 * Every monster feature is driven by a 0..1 parameter so the battle director
 * can choreograph it with tweens.
 */
export class PieceView {
  readonly root = new THREE.Group();
  /** Lifted by the legs; carries the whole piece. */
  readonly body = new THREE.Group();
  readonly traits: MonsterTraits;
  readonly height: number;
  readonly mouthY: number;
  readonly mats: PieceMaterials;

  private readonly lower = new THREE.Group();
  private readonly hinge = new THREE.Group();
  private readonly upper = new THREE.Group();
  private readonly teeth = new THREE.Group();
  private readonly upperTeeth = new THREE.Group();
  private readonly eyes: THREE.Mesh[] = [];
  private readonly legs: Leg[] = [];
  private readonly tentacles: Chain[] = [];
  private readonly horns: THREE.Group[] = [];
  private tongue: Chain | null = null;
  private readonly gulletLight: THREE.PointLight;
  private readonly mouthRadius: number;

  monster = 0;
  mouth = 0;
  tongueOut = 0;
  tentacleReach = 0;
  /** 0..1 walking gait blend. */
  gait = 0;
  gaitPhase = 0;
  /** Extra vertical offset (jumps); legs stop grounding while airborne. */
  hop = 0;
  airborne = false;
  private blink = 0;
  private nextBlink = 2 + Math.random() * 4;
  private time = Math.random() * 10;

  constructor(
    readonly id: string,
    public type: PieceType,
    readonly color: Color,
  ) {
    const shape = SHAPES[type];
    this.traits = shape.traits;
    this.height = shape.height;
    this.mouthY = shape.mouthY;
    this.mats = createMaterials(color);
    this.mouthRadius = type === 'n' ? 0.12 : radiusAt(shape.profile, shape.mouthY);

    this.root.add(this.body);
    this.body.add(this.lower, this.hinge);
    this.hinge.position.set(0, this.mouthY, -this.mouthRadius * 0.95);
    this.upper.position.set(0, -this.mouthY, this.mouthRadius * 0.95);
    this.hinge.add(this.upper);

    if (type === 'n') this.buildKnight();
    else this.buildLathePiece(shape.profile);

    this.buildTeeth();
    this.buildEyes();
    this.buildLegs();
    if (this.traits.tentacles > 0) this.buildTentacles();
    if (this.traits.horns > 0) this.buildHorns();
    if (this.traits.tongue > 0) this.buildTongue();

    this.gulletLight = new THREE.PointLight(this.mats.flesh.emissive.getHex(), 0, 1.4, 2);
    this.gulletLight.position.set(0, this.mouthY + 0.05, 0.05);
    this.body.add(this.gulletLight);

    shadowed(this.root);
    this.root.userData.pieceId = id;
    this.root.traverse((o) => (o.userData.pieceId = id));
    this.apply();
  }

  /** Faces the piece toward a world-space point (Y ignored). */
  faceTowards(x: number, z: number): number {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    return Math.atan2(dx, dz);
  }

  get restFacing(): number {
    return this.color === 'w' ? Math.PI : 0;
  }

  /** World position of the mouth centre. */
  mouthWorld(target = new THREE.Vector3()): THREE.Vector3 {
    return this.body.localToWorld(target.set(0, this.mouthY + 0.05, this.mouthRadius * 0.6));
  }

  setGlow(intensity: number): void {
    this.mats.body.emissiveIntensity = intensity;
  }

  update(dt: number): void {
    this.time += dt;
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 1;
      this.nextBlink = 2 + Math.random() * 5;
    }
    this.blink = Math.max(0, this.blink - dt * 8);
    this.apply();
  }

  /** Pushes every animation parameter into the scene graph. */
  apply(): void {
    const m = this.monster;
    const t = this.time;
    const tr = this.traits;

    // Breathing idle on the board, heavier breathing as a monster.
    const breathe = Math.sin(t * (1.6 + m * 2.5)) * (0.004 + m * 0.02);
    const lift = tr.lift * m;
    this.body.position.y = lift + this.hop + Math.max(0, breathe);
    this.body.scale.set(1 + m * 0.08 + breathe, 1 + m * 0.12 - breathe, 1 + m * 0.08 + breathe);

    // Jaw: idle monsters chatter slightly.
    const chatter = m > 0.5 ? Math.max(0, Math.sin(t * 13)) * 0.05 * m : 0;
    this.hinge.rotation.x = -(this.mouth * tr.gape + chatter);

    const toothScale = Math.max(0.0001, m);
    this.teeth.scale.setScalar(toothScale);
    this.upperTeeth.scale.setScalar(toothScale);

    const eyeOpen = Math.max(0.0001, m * (1 - this.blink * 0.9));
    for (const eye of this.eyes) {
      eye.scale.set(m, eyeOpen * 0.7, m * 0.6);
      eye.visible = m > 0.01;
    }

    this.mats.body.emissiveIntensity = Math.max(this.mats.body.emissiveIntensity * 0.9, m * 0.02);
    this.mats.flesh.emissiveIntensity = 0.5 + this.mouth * 0.9;
    this.gulletLight.intensity = m * this.mouth * 0.9;

    this.updateLegs(lift);
    this.updateChains(t);
    for (const horn of this.horns) horn.scale.setScalar(Math.max(0.0001, m));
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const mat of Object.values(this.mats)) (mat as THREE.Material).dispose();
  }

  // ---------------------------------------------------------------- building

  private buildLathePiece(profile: Point[]): void {
    const { lower, upper } = splitProfile(profile, this.mouthY);
    this.lower.add(new THREE.Mesh(lathe(lower), this.mats.body));
    this.upper.add(new THREE.Mesh(lathe(upper), this.mats.body));

    // Flesh caps seal both halves; they glow when the jaw opens.
    const capGeo = new THREE.CircleGeometry(this.mouthRadius * 0.985, LATHE_SEGMENTS);
    const lowerCap = new THREE.Mesh(capGeo, this.mats.flesh);
    lowerCap.rotation.x = -Math.PI / 2;
    lowerCap.position.y = this.mouthY - 0.004;
    this.lower.add(lowerCap);
    const upperCap = new THREE.Mesh(capGeo, this.mats.flesh);
    upperCap.rotation.x = Math.PI / 2;
    upperCap.position.y = this.mouthY + 0.004;
    this.upper.add(upperCap);

    // Gold accent ring at the base.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.018, 8, 48), this.mats.accent);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.11;
    this.lower.add(ring);

    switch (this.type) {
      case 'r':
        this.buildMerlons();
        break;
      case 'b': {
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.2), this.mats.accent);
        slit.position.set(0, 0.95, 0.09);
        slit.rotation.x = -0.5;
        this.upper.add(slit);
        break;
      }
      case 'q':
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 8), this.mats.accent);
          pearl.position.set(Math.cos(a) * 0.215, 1.2, Math.sin(a) * 0.215);
          this.upper.add(pearl);
        }
        break;
      case 'k': {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.06), this.mats.accent);
        v.position.y = 1.43;
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), this.mats.accent);
        h.position.y = 1.47;
        this.upper.add(v, h);
        break;
      }
      default:
        break;
    }
  }

  private buildMerlons(): void {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.07), this.mats.body);
      merlon.position.set(Math.sin(a) * 0.22, 0.915, Math.cos(a) * 0.22);
      merlon.rotation.y = a;
      this.upper.add(merlon);
    }
  }

  private buildKnight(): void {
    const { profile } = SHAPES.n;
    this.lower.add(new THREE.Mesh(lathe(profile), this.mats.body));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.018, 8, 48), this.mats.accent);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.11;
    this.lower.add(ring);

    const extrude = (pts: Array<[number, number]>) => {
      const s = new THREE.Shape();
      s.moveTo(pts[0][0], pts[0][1]);
      for (const [z, y] of pts.slice(1)) s.lineTo(z, y);
      s.closePath();
      const depth = 0.2;
      const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 4, curveSegments: 4 });
      geo.rotateY(-Math.PI / 2);
      geo.translate(depth / 2, 0, 0);
      geo.computeVertexNormals();
      return geo;
    };
    // Shape coordinates are [z, y]; +z is the snout direction.
    const neck = extrude([
      [-0.18, 0.27],
      [-0.21, 0.42],
      [-0.2, 0.56],
      [0.29, 0.56],
      [0.26, 0.5],
      [0.12, 0.49],
      [0.05, 0.42],
      [0.15, 0.27],
    ]);
    this.lower.add(new THREE.Mesh(neck, this.mats.body));
    const head = extrude([
      [-0.2, 0.56],
      [-0.22, 0.66],
      [-0.15, 0.84],
      [-0.06, 0.97],
      [-0.01, 0.9],
      [0.1, 0.86],
      [0.24, 0.72],
      [0.31, 0.63],
      [0.31, 0.58],
      [0.27, 0.56],
    ]);
    this.upper.add(new THREE.Mesh(head, this.mats.body));

    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.06), this.mats.accent);
    mane.position.set(0, 0.68, -0.2);
    mane.rotation.x = 0.35;
    this.upper.add(mane);

    const fleshGeo = new THREE.PlaneGeometry(0.2, 0.45);
    const lowerFlesh = new THREE.Mesh(fleshGeo, this.mats.flesh);
    lowerFlesh.rotation.x = -Math.PI / 2;
    lowerFlesh.position.set(0, 0.565, 0.05);
    this.lower.add(lowerFlesh);
    const upperFlesh = new THREE.Mesh(fleshGeo, this.mats.flesh);
    upperFlesh.rotation.x = Math.PI / 2;
    upperFlesh.position.set(0, 0.555, 0.05);
    this.upper.add(upperFlesh);
  }

  private buildTeeth(): void {
    const { teeth, toothSize } = this.traits;
    const geo = new THREE.ConeGeometry(toothSize * 0.35, toothSize, 5);
    const knight = this.type === 'n';
    for (let i = 0; i < teeth; i++) {
      const f = teeth === 1 ? 0.5 : i / (teeth - 1);
      let x: number;
      let z: number;
      if (knight) {
        x = (i % 2 === 0 ? -1 : 1) * 0.085;
        z = -0.1 + f * 0.36;
      } else {
        const a = -Math.PI * 0.62 + f * Math.PI * 1.24;
        const r = this.mouthRadius * 0.88;
        x = Math.sin(a) * r;
        z = Math.cos(a) * r;
      }
      const size = 0.75 + Math.random() * 0.5;
      const low = new THREE.Mesh(geo, this.mats.tooth);
      low.position.set(x, this.mouthY + (toothSize * size) / 2 - 0.004, z);
      low.scale.setScalar(size);
      this.teeth.add(low);
      const up = new THREE.Mesh(geo, this.mats.tooth);
      up.position.set(x * 0.97, this.mouthY - (toothSize * size) / 2 + 0.004, z * 0.97);
      up.rotation.x = Math.PI;
      up.scale.setScalar(size * 1.1);
      this.upperTeeth.add(up);
    }
    // Scale teeth around the mouth plane so they grow out of the gums.
    this.teeth.position.y = this.mouthY;
    this.teeth.children.forEach((c) => (c.position.y -= this.mouthY));
    this.upperTeeth.position.y = this.mouthY;
    this.upperTeeth.children.forEach((c) => (c.position.y -= this.mouthY));
    this.lower.add(this.teeth);
    this.upper.add(this.upperTeeth);
  }

  private buildEyes(): void {
    const s = this.traits.eyeSize;
    const geo = new THREE.SphereGeometry(s, 16, 10);
    const knight = this.type === 'n';
    const eyeY = knight ? 0.74 : this.mouthY + Math.min(0.12, (this.height - this.mouthY) * 0.4);
    const profileR = knight ? 0.11 : radiusAt(SHAPES[this.type].profile, eyeY);
    const pairs = this.type === 'k' || this.type === 'q' ? 2 : 1;
    for (let p = 0; p < pairs; p++) {
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(geo, this.mats.eye);
        const spread = knight ? 0.12 : Math.max(0.06, profileR * 0.5) + p * 0.05;
        const y = eyeY + p * 0.07;
        const r = knight ? 0.1 : radiusAt(SHAPES[this.type].profile, y);
        eye.position.set(side * spread, y, knight ? 0.12 : Math.sqrt(Math.max(0.0001, r * r - spread * spread)) + 0.005);
        eye.rotation.z = side * -0.35;
        if (knight) eye.rotation.y = side * 1.2;
        eye.castShadow = false;
        this.eyes.push(eye);
        this.upper.add(eye);
      }
    }
  }

  private buildLegs(): void {
    const { legs: n, legLength } = this.traits;
    const thighGeo = new THREE.CylinderGeometry(0.035, 0.05, 1, 8);
    thighGeo.rotateZ(-Math.PI / 2);
    thighGeo.translate(0.5, 0, 0);
    const shinGeo = new THREE.ConeGeometry(0.04, 1, 8);
    shinGeo.rotateZ(-Math.PI / 2);
    shinGeo.translate(0.5, 0, 0);
    const jointGeo = new THREE.SphereGeometry(0.05, 10, 8);
    for (let i = 0; i < n; i++) {
      const angle = ((i + 0.5) / n) * Math.PI * 2;
      const hip = new THREE.Group();
      hip.position.set(Math.sin(angle) * 0.24, 0.13, Math.cos(angle) * 0.24);
      hip.rotation.y = angle - Math.PI / 2;
      const thigh = new THREE.Mesh(thighGeo, this.mats.carapace);
      thigh.scale.set(legLength * 0.55, 1, 1);
      const knee = new THREE.Group();
      knee.position.x = legLength * 0.55;
      const joint = new THREE.Mesh(jointGeo, this.mats.accent);
      const shin = new THREE.Mesh(shinGeo, this.mats.carapace);
      shin.scale.set(legLength * 0.75, 1, 1);
      knee.add(joint, shin);
      hip.add(thigh, knee);
      this.lower.add(hip);
      this.legs.push({ hip, knee, thigh, shin, angle, phase: (i % 2) * Math.PI + i * 0.3 });
    }
  }

  private buildChain(segments: number, length: number, radius: number, material: THREE.Material, axis: 'y' | 'z'): Chain {
    const root = new THREE.Group();
    const joints: THREE.Group[] = [];
    let parent: THREE.Object3D = root;
    const segLen = length / segments;
    for (let i = 0; i < segments; i++) {
      const joint = new THREE.Group();
      if (i > 0) joint.position[axis] = segLen;
      const r = radius * (1 - (i / segments) * 0.75);
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r, segLen * 0.8, 3, 8), material);
      if (axis === 'z') seg.rotation.x = Math.PI / 2;
      seg.position[axis] = segLen / 2;
      joint.add(seg);
      parent.add(joint);
      joints.push(joint);
      parent = joint;
    }
    return { root, joints, phase: Math.random() * 10 };
  }

  private buildTentacles(): void {
    const n = this.traits.tentacles;
    const baseY = this.type === 'q' ? 1.12 : 0.97;
    const r = this.type === 'q' ? 0.17 : 0.12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      const chain = this.buildChain(8, this.type === 'q' ? 0.9 : 0.7, 0.04, this.mats.carapace, 'y');
      chain.root.position.set(Math.sin(a) * r, baseY, Math.cos(a) * r);
      chain.root.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9);
      chain.root.userData.baseRotation = chain.root.rotation.clone();
      this.upper.add(chain.root);
      this.tentacles.push(chain);
    }
  }

  private buildHorns(): void {
    const top = this.type === 'n' ? 0.88 : 1.22;
    for (const side of [-1, 1]) {
      const horn = new THREE.Group();
      horn.position.set(side * (this.type === 'n' ? 0.08 : 0.17), top, this.type === 'n' ? -0.02 : 0);
      let parent: THREE.Object3D = horn;
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Group();
        if (i > 0) seg.position.y = 0.07;
        seg.rotation.z = side * -0.28;
        seg.rotation.x = -0.12;
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * (1 - i / 5) + 0.004, 0.035 * (1 - (i - 1) / 5) + 0.004, 0.08, 8), this.mats.accent);
        cone.position.y = 0.04;
        seg.add(cone);
        parent.add(seg);
        parent = seg;
      }
      this.horns.push(horn);
      this.upper.add(horn);
    }
  }

  private buildTongue(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0xb0123a, roughness: 0.3, emissive: 0x4a0010, emissiveIntensity: 0.6 });
    this.tongue = this.buildChain(10, this.traits.tongue, 0.045, mat, 'z');
    this.tongue.root.position.set(0, this.mouthY + 0.02, -this.mouthRadius * 0.4);
    this.lower.add(this.tongue.root);
  }

  // --------------------------------------------------------------- animation

  private updateLegs(lift: number): void {
    const m = this.monster;
    const { legLength } = this.traits;
    for (const leg of this.legs) {
      const s = Math.max(0.0001, m);
      leg.hip.scale.setScalar(s);
      leg.hip.visible = m > 0.01;
      const L1 = legLength * 0.55 * s;
      const L2 = legLength * 0.75 * s;
      const swing = Math.sin(this.gaitPhase + leg.phase);
      const raise = Math.max(0, Math.cos(this.gaitPhase + leg.phase)) * this.gait;
      const thighUp = 0.75 + raise * 0.5;
      leg.hip.rotation.z = thighUp;
      leg.hip.rotation.y = leg.angle - Math.PI / 2 + swing * 0.35 * this.gait;
      if (this.airborne) {
        leg.knee.rotation.z = -1.2 - Math.sin(this.time * 18 + leg.phase) * 0.4;
        continue;
      }
      const hipH = lift + this.hop + 0.13 * this.body.scale.y;
      const kneeH = hipH + L1 * Math.sin(thighUp) - raise * 0.08;
      const b = Math.asin(Math.min(1, Math.max(0, kneeH) / Math.max(0.0001, L2)));
      leg.knee.rotation.z = -(thighUp + b);
    }
  }

  private updateChains(t: number): void {
    const m = this.monster;
    for (const chain of this.tentacles) {
      chain.root.scale.setScalar(Math.max(0.0001, m * (1 + this.tentacleReach * 1.6)));
      chain.root.visible = m > 0.01;
      const reach = this.tentacleReach;
      const base = chain.root.userData.baseRotation as THREE.Euler;
      // Reaching tentacles swing forward (toward +Z).
      chain.root.rotation.x = base.x * (1 - reach) + reach * 1.35;
      chain.root.rotation.z = base.z * (1 - reach);
      chain.joints.forEach((j, i) => {
        if (i === 0) return;
        const wave = Math.sin(t * 3.2 + chain.phase + i * 0.7) * 0.35 * (1 - reach * 0.7);
        j.rotation.x = wave + 0.12 * (1 - reach);
        j.rotation.z = Math.cos(t * 2.4 + chain.phase + i * 0.5) * 0.25 * (1 - reach);
      });
    }
    if (this.tongue) {
      const out = this.tongueOut;
      this.tongue.root.visible = m > 0.05 && (out > 0.01 || this.mouth > 0.2);
      this.tongue.root.scale.set(1, 1, Math.max(0.0001, 0.25 + out * 1.4));
      this.tongue.joints.forEach((j, i) => {
        if (i === 0) return;
        j.rotation.x = Math.sin(t * 9 + i * 0.8) * 0.15 * (1 - out * 0.6) - 0.04 * out;
        j.rotation.y = Math.sin(t * 6 + i) * 0.12;
      });
    }
  }
}

export { TEAM_GLOW };
