import * as THREE from 'three';
import type { Color, PieceType } from '../../domain/types';
import { Figure } from './figure';
import { Gear, gearSpec, hasGear } from './gear';
import { createMaterials, TEAM_GLOW, type PieceMaterials } from './materials';
import { Mount, REAR_PIVOT_Z } from './mount';
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

/** Two-bone leg of the rook brute, solved so the foot stays on the floor. */
interface BipedLeg {
  hip: THREE.Group;
  knee: THREE.Group;
  ankle: THREE.Group;
  side: number;
}

const BIPED_THIGH = 0.3;
const BIPED_SHIN = 0.3;

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
  /** Pivot between root and body, used to rear the knight's horse. */
  private readonly rig = new THREE.Group();
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
  private readonly bipedLegs: BipedLeg[] = [];
  private readonly tentacles: Chain[] = [];
  private readonly horns: THREE.Group[] = [];
  private tongue: Chain | null = null;
  /** Borrowed from a shared pool only while fighting (lights are costly per shader). */
  private gulletLight: THREE.PointLight | null = null;
  private readonly mouthRadius: number;
  /** Arms and weapons: the monster's (pawn, bishop, rook) or the figure's (queen, king). */
  readonly gear: Gear | null = null;
  /** The queen and king come alive as a lady and a lord instead of monsters. */
  readonly figure: Figure | null = null;
  /** The knight's horse and rider. */
  readonly mount: Mount | null = null;
  private readonly knightBase: THREE.Object3D[] = [];
  /** 0..1 knight's horse rears up on its hind legs. */
  rear = 0;

  monster = 0;
  mouth = 0;
  tongueOut = 0;
  /** Tongue length multiplier needed to reach the aimed target. */
  private tongueReach = 1;
  tentacleReach = 0;
  /** 0..1 arms and weapons grown out. */
  get armed(): number {
    return this.gear?.out ?? 0;
  }

  set armed(v: number) {
    if (this.gear) this.gear.out = v;
  }

  /** 0..1 queen or king transformed into a living figure. */
  get avatar(): number {
    return this.figure?.amount ?? 0;
  }

  set avatar(v: number) {
    if (this.figure) this.figure.amount = v;
  }

  /** 0..1 knight transformed into a mounted rider. */
  get mounted(): number {
    return this.mount?.amount ?? 0;
  }

  set mounted(v: number) {
    if (this.mount) this.mount.amount = v;
  }

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

    this.root.add(this.rig);
    this.rig.add(this.body);
    this.body.add(this.lower, this.hinge);
    this.hinge.position.set(0, this.mouthY, -this.mouthRadius * 0.95);
    this.upper.position.set(0, -this.mouthY, this.mouthRadius * 0.95);
    this.hinge.add(this.upper);

    if (type === 'n') this.buildKnight();
    else this.buildLathePiece(shape.profile);

    this.buildTeeth();
    this.buildEyes();
    if (this.traits.biped) this.buildBipedLegs();
    else this.buildLegs();
    if (this.traits.tentacles > 0) this.buildTentacles();
    if (this.traits.horns > 0) this.buildHorns();
    if (this.traits.tongue > 0) this.buildTongue();
    if (hasGear(type)) {
      this.gear = new Gear(gearSpec(type), color, this.mats);
      this.lower.add(this.gear.group);
    }
    if (type === 'q' || type === 'k') {
      this.figure = new Figure(type, color, this.mats);
      this.gear = this.figure.gear;
      this.rig.add(this.figure.group);
    }
    if (type === 'n') {
      this.mount = new Mount(color, this.mats);
      this.rig.add(this.mount.group);
    }

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

  /** Points the tongue at a world position and sets how far it must stretch. */
  aimTongue(world: THREE.Vector3): void {
    if (!this.tongue) return;
    const root = this.tongue.root;
    const local = this.lower.worldToLocal(world.clone()).sub(root.position);
    root.rotation.order = 'YXZ';
    root.rotation.y = Math.atan2(local.x, local.z);
    root.rotation.x = Math.atan2(-local.y, Math.hypot(local.x, local.z));
    this.tongueReach = Math.max(0.3, local.length() / this.traits.tongue);
  }

  /** Attaches a pooled light inside the mouth; pass null to give it back. */
  borrowLight(light: THREE.PointLight | null): void {
    if (this.gulletLight && this.gulletLight !== light) {
      this.gulletLight.intensity = 0;
      this.gulletLight.removeFromParent();
    }
    this.gulletLight = light;
    if (light) {
      light.color.copy(this.mats.flesh.emissive);
      light.position.set(0, this.mouthY + 0.05, 0.05);
      this.body.add(light);
    }
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
    const bulk = 1 + m * ((tr.bulk ?? 1) - 1);
    const lift = tr.lift * m * bulk;
    this.body.position.y = lift + this.hop + Math.max(0, breathe);
    this.body.scale.set((1 + m * 0.08 + breathe) * bulk, (1 + m * 0.12 - breathe) * bulk, (1 + m * 0.08 + breathe) * bulk);
    if (this.mount) this.applyMount(t);
    if (this.figure) {
      // The chess piece shrinks away as the figure rises out of it.
      const a = this.figure.amount;
      this.body.scale.multiplyScalar(Math.max(0.0001, 1 - a));
      this.body.visible = a < 0.98;
    }

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
    if (this.gulletLight) this.gulletLight.intensity = m * this.mouth * 0.35;

    if (this.bipedLegs.length) this.updateBipedLegs(lift);
    else this.updateLegs(lift);
    this.updateChains(t);
    for (const horn of this.horns) horn.scale.setScalar(Math.max(0.0001, m));
    if (this.figure) this.figure.apply(t, this.gait, this.gaitPhase, this.hop);
    else this.gear?.apply(t, this.gait, this.gaitPhase);
  }

  /** The knight piece becomes the horse's head in front of the barrel. */
  private applyMount(t: number): void {
    const mount = this.mount!;
    const a = mount.amount;
    mount.apply(t);
    const headScale = 1 - a * 0.4;
    this.body.position.y += a * (0.4 + mount.bob);
    this.body.position.z = a * 0.3;
    this.body.scale.multiplyScalar(headScale);
    this.body.rotation.x = -a * 0.15 * (1 - this.rear) + Math.sin(mount.gallopPhase) * 0.1 * mount.gallop;
    for (const o of this.knightBase) {
      o.visible = a < 0.5;
      o.scale.setScalar(Math.max(0.0001, 1 - a * 2));
    }
    // Rear up around the hind hooves.
    const angle = -this.rear * 0.75;
    this.rig.rotation.x = angle;
    this.rig.position.set(0, REAR_PIVOT_Z * Math.sin(angle), REAR_PIVOT_Z - REAR_PIVOT_Z * Math.cos(angle));
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const mat of Object.values(this.mats)) (mat as THREE.Material).dispose();
    if (this.figure) this.figure.dispose();
    else this.gear?.dispose();
    this.mount?.dispose();
  }

  /** Back to a plain chess piece: every monster, gear and mount parameter at rest. */
  resetPose(): void {
    this.monster = 0;
    this.mouth = 0;
    this.hop = 0;
    this.airborne = false;
    this.gait = 0;
    this.tongueOut = 0;
    this.tentacleReach = 0;
    this.armed = 0;
    this.mounted = 0;
    this.avatar = 0;
    if (this.figure) this.figure.drawn = 0;
    this.rear = 0;
    if (this.mount) {
      this.mount.gallop = 0;
      this.mount.couch = 0;
      this.mount.windup = 0;
    }
    if (this.gear) for (const k of Object.keys(this.gear.pose) as Array<keyof typeof this.gear.pose>) this.gear.pose[k] = 0;
    this.body.rotation.set(0, 0, 0);
    this.root.scale.setScalar(1);
  }

  /** World position of the weapon tip (lance tip for the knight). */
  weaponTip(target = new THREE.Vector3()): THREE.Vector3 {
    if (this.mount) return this.mount.lanceTipWorld(target);
    if (this.gear) return this.gear.tip(target);
    return this.mouthWorld(target);
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
    const base = new THREE.Mesh(lathe(profile), this.mats.body);
    this.lower.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.335, 0.018, 8, 48), this.mats.accent);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.11;
    this.lower.add(ring);
    this.knightBase.push(base, ring);

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

  /** Thick beast legs: thigh, knee, shin and a clawed foot. */
  private buildBipedLegs(): void {
    const thighGeo = new THREE.CapsuleGeometry(0.075, BIPED_THIGH - 0.1, 4, 12);
    thighGeo.translate(0, -BIPED_THIGH / 2, 0);
    const shinGeo = new THREE.CapsuleGeometry(0.06, BIPED_SHIN - 0.08, 4, 12);
    shinGeo.translate(0, -BIPED_SHIN / 2, 0);
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.27, 0.13, 0);
      hip.rotation.order = 'ZXY';
      hip.rotation.z = side * 0.12;
      hip.add(new THREE.Mesh(thighGeo, this.mats.carapace));
      const knee = new THREE.Group();
      knee.position.y = -BIPED_THIGH;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), this.mats.accent);
      knee.add(cap, new THREE.Mesh(shinGeo, this.mats.carapace));
      const ankle = new THREE.Group();
      ankle.position.y = -BIPED_SHIN;
      ankle.userData.foot = true;
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.carapace);
      foot.scale.set(1, 0.55, 1.35);
      foot.position.z = 0.03;
      ankle.add(foot);
      for (let i = -1; i <= 1; i++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.08, 6), this.mats.tooth);
        claw.rotation.x = Math.PI / 2;
        claw.position.set(i * 0.045, 0.012, 0.15);
        ankle.add(claw);
      }
      knee.add(ankle);
      hip.add(knee);
      this.lower.add(hip);
      this.bipedLegs.push({ hip, knee, ankle, side });
    }
  }

  private buildLegs(): void {
    const { legs: n, legLength } = this.traits;
    const k = this.traits.legThickness ?? 1;
    const thighGeo = new THREE.CylinderGeometry(0.035 * k, 0.05 * k, 1, 8);
    thighGeo.rotateZ(-Math.PI / 2);
    thighGeo.translate(0.5, 0, 0);
    const shinGeo = new THREE.CylinderGeometry(0.045 * k, k > 1.5 ? 0.06 * k : 0.002, 1, 8);
    shinGeo.rotateZ(-Math.PI / 2);
    shinGeo.translate(0.5, 0, 0);
    const jointGeo = new THREE.SphereGeometry(0.05 * Math.sqrt(k), 10, 8);
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

  /** Two-bone IK in the forward/up plane: the foot is planted below the hip and strides with the gait. */
  private updateBipedLegs(lift: number): void {
    const m = this.monster;
    const s = Math.max(0.0001, m);
    const sy = this.body.scale.y;
    for (const leg of this.bipedLegs) {
      leg.hip.scale.setScalar(s);
      leg.hip.visible = m > 0.01;
      const phase = this.gaitPhase + (leg.side > 0 ? Math.PI : 0);
      // Foot target in hip space (local units, before the leg's own scale).
      const reach = BIPED_THIGH + BIPED_SHIN;
      const hipH = (lift + this.hop + 0.13 * sy) / (sy * s);
      const stride = Math.sin(phase) * 0.16 * this.gait;
      const raise = Math.max(0, Math.cos(phase)) * 0.12 * this.gait;
      let z = stride;
      let y = -(this.airborne ? reach * 0.8 : hipH) + raise;
      const d = Math.hypot(z, y);
      const maxD = reach * 0.995;
      if (d > maxD) {
        z *= maxD / d;
        y *= maxD / d;
      }
      const D = Math.min(Math.hypot(z, y), maxD);
      const toFoot = Math.atan2(z, -y);
      const a1 = Math.acos(Math.min(1, (BIPED_THIGH ** 2 + D * D - BIPED_SHIN ** 2) / (2 * BIPED_THIGH * D)));
      const a2 = Math.acos(Math.min(1, (BIPED_SHIN ** 2 + D * D - BIPED_THIGH ** 2) / (2 * BIPED_SHIN * D)));
      // Knee forward like a brawler: thigh swings forward, shin back down to the foot.
      const thigh = toFoot + a1;
      const knee = -(a1 + a2);
      leg.hip.rotation.x = -thigh;
      leg.knee.rotation.x = -knee;
      leg.ankle.rotation.x = thigh + knee;
    }
  }

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
      // Leg lengths in world units (the body may be scaled up as a monster).
      const sy = this.body.scale.y;
      const hipH = lift + this.hop + 0.13 * sy;
      const kneeH = hipH + L1 * sy * Math.sin(thighUp) - raise * 0.08;
      const b = Math.asin(Math.min(1, Math.max(0, kneeH) / Math.max(0.0001, L2 * sy)));
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
      this.tongue.root.scale.set(1, 1, Math.max(0.0001, 0.25 + out * (this.tongueReach - 0.25)));
      this.tongue.joints.forEach((j, i) => {
        if (i === 0) return;
        j.rotation.x = Math.sin(t * 9 + i * 0.8) * 0.15 * (1 - out * 0.6) - 0.04 * out;
        j.rotation.y = Math.sin(t * 6 + i) * 0.12;
      });
    }
  }
}

export { TEAM_GLOW };
