import * as THREE from 'three';
import type { Color } from '../../domain/types';
import { TEAM_GLOW, type PieceMaterials } from './materials';

interface HorseLeg {
  hip: THREE.Group;
  knee: THREE.Group;
  /** Phase offset in the gallop cycle. */
  phase: number;
  front: boolean;
}

/** Back hooves: the horse rears up around this point. */
export const REAR_PIVOT_Z = -0.34;

/**
 * The knight's war horse and its armoured rider. The knight piece itself
 * becomes the horse's head (PieceView moves its body to the front of the
 * barrel); this class adds the barrel, four articulated legs, a tail and the
 * rider with lance and shield.
 */
export class Mount {
  readonly group = new THREE.Group();
  /** 0..1 how much of the horse and rider exist. */
  amount = 0;
  /** 0..1 gallop blend and its cycle phase. */
  gallop = 0;
  gallopPhase = 0;
  /** 0..1 lance lowered for the charge. */
  couch = 0;
  /** 0..1 rider pulls back the lance arm (wind-up) */
  windup = 0;
  private readonly legs: HorseLeg[] = [];
  private readonly tail: THREE.Group[] = [];
  private readonly barrel = new THREE.Group();
  private readonly lanceArm = new THREE.Group();
  private readonly rider = new THREE.Group();
  private readonly lanceTip = new THREE.Object3D();
  private readonly ownMaterials: THREE.Material[] = [];

  constructor(color: Color, private readonly mats: PieceMaterials) {
    this.group.add(this.barrel);
    this.buildBody(color);
    this.buildLegs();
    this.buildTail();
    this.buildRider(color);
  }

  lanceTipWorld(target = new THREE.Vector3()): THREE.Vector3 {
    return this.lanceTip.getWorldPosition(target);
  }

  /** Vertical offset of the horse's chest, so the head (piece body) can ride along. */
  get bob(): number {
    return Math.abs(Math.sin(this.gallopPhase)) * 0.06 * this.gallop;
  }

  apply(time: number): void {
    const a = this.amount;
    this.group.visible = a > 0.01;
    this.group.scale.setScalar(Math.max(0.0001, a));
    const g = this.gallop;
    const ph = this.gallopPhase;
    this.barrel.position.y = this.bob;
    this.barrel.rotation.x = Math.sin(ph) * 0.08 * g;
    for (const leg of this.legs) {
      const c = ph + leg.phase;
      leg.hip.rotation.x = Math.sin(c) * 0.65 * g + Math.sin(time * 1.3 + leg.phase) * 0.02;
      const bend = Math.max(0, Math.sin(c + (leg.front ? 1.2 : -1.2))) * 1.1 * g;
      leg.knee.rotation.x = leg.front ? bend : -bend;
    }
    this.tail.forEach((seg, i) => {
      seg.rotation.x = 0.35 + Math.sin(time * 2.2 + i * 0.6) * 0.12 + g * 0.25 * Math.sin(ph * 2 + i);
    });
    // Rider bounces with the horse and lowers the lance for the charge.
    this.rider.position.y = 0.66 + this.bob * 0.8;
    this.rider.rotation.x = this.couch * 0.25 - this.windup * 0.15;
    this.lanceArm.rotation.x = 0.12 + this.couch * (Math.PI / 2 - 0.2) - this.windup * 0.5;
    this.lanceArm.position.z = -this.windup * 0.12 + this.couch * 0.05;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const m of this.ownMaterials) m.dispose();
  }

  // ---------------------------------------------------------------- building

  private buildBody(color: Color): void {
    const barrel = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.4, 6, 14), this.mats.body);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.52, -0.1);
    barrel.scale.set(1, 1, 1.05);
    // Caparison: a team-coloured cloth with a glowing trim.
    const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.34, 16, 1, true, -Math.PI * 0.85, Math.PI * 1.7), this.mats.accent);
    cloth.rotation.x = Math.PI / 2;
    cloth.rotation.y = Math.PI;
    cloth.position.set(0, 0.52, -0.12);
    (cloth.material as THREE.Material).side = THREE.DoubleSide;
    const trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM_GLOW[color]).multiplyScalar(1.8) });
    this.ownMaterials.push(trimMat);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 6, 32), trimMat);
    trim.position.set(0, 0.52, 0.05);
    const trim2 = trim.clone();
    trim2.position.z = -0.29;
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.2), this.mats.carapace);
    saddle.position.set(0, 0.68, -0.1);
    this.barrel.add(barrel, cloth, trim, trim2, saddle);
  }

  private buildLegs(): void {
    const upperGeo = new THREE.CapsuleGeometry(0.04, 0.2, 4, 8);
    upperGeo.translate(0, -0.12, 0);
    const lowerGeo = new THREE.CapsuleGeometry(0.03, 0.2, 4, 8);
    lowerGeo.translate(0, -0.12, 0);
    const hoofGeo = new THREE.CylinderGeometry(0.035, 0.045, 0.05, 10);
    const spots: Array<[number, number, boolean, number]> = [
      [-0.09, 0.14, true, 0],
      [0.09, 0.14, true, 0.5],
      [-0.09, REAR_PIVOT_Z, false, Math.PI],
      [0.09, REAR_PIVOT_Z, false, Math.PI + 0.5],
    ];
    for (const [x, z, front, phase] of spots) {
      const hip = new THREE.Group();
      hip.position.set(x, 0.5, z);
      hip.add(new THREE.Mesh(upperGeo, this.mats.body));
      const knee = new THREE.Group();
      knee.position.y = -0.24;
      knee.add(new THREE.Mesh(lowerGeo, this.mats.carapace));
      const hoof = new THREE.Mesh(hoofGeo, this.mats.accent);
      hoof.position.y = -0.235;
      knee.add(hoof);
      hip.add(knee);
      this.barrel.add(hip);
      this.legs.push({ hip, knee, phase, front });
    }
  }

  private buildTail(): void {
    let parent: THREE.Object3D = this.barrel;
    const geo = new THREE.CapsuleGeometry(0.022, 0.08, 3, 6);
    geo.translate(0, -0.05, 0);
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      if (i === 0) seg.position.set(0, 0.6, -0.42);
      else seg.position.y = -0.09;
      seg.add(new THREE.Mesh(geo, this.mats.accent));
      parent.add(seg);
      this.tail.push(seg);
      parent = seg;
    }
  }

  private buildRider(color: Color): void {
    const r = this.rider;
    r.position.set(0, 0.66, -0.12);
    r.scale.setScalar(1.3);
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.14, 4, 10), this.mats.carapace);
    torso.position.y = 0.14;
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), this.mats.accent);
    chest.scale.set(1, 0.8, 0.7);
    chest.position.set(0, 0.17, 0.03);
    const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.11, 12), this.mats.body);
    helm.position.y = 0.33;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mats.body);
    dome.position.y = 0.385;
    const visorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM_GLOW[color]).multiplyScalar(2.5) });
    this.ownMaterials.push(visorMat);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.014, 0.02), visorMat);
    visor.position.set(0, 0.34, 0.066);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.2, 8), this.mats.accent);
    plume.position.set(0, 0.47, -0.04);
    plume.rotation.x = -0.6;
    // Legs straddling the horse.
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.14, 3, 8), this.mats.carapace);
      leg.position.set(side * 0.13, -0.02, 0.04);
      leg.rotation.set(0.5, 0, side * 0.35);
      r.add(leg);
    }
    // Shield on the left arm.
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.015, 3), this.mats.accent);
    shield.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    shield.scale.set(1, 1, 1.4);
    shield.position.set(0.11, 0.15, 0.04);
    // Lance arm on the right; the lance points up (+Y) at rest and forward when couched.
    this.lanceArm.position.set(-0.1, 0.18, 0);
    const lance = new THREE.Mesh(new THREE.ConeGeometry(0.03, 1.15, 10), this.mats.accent);
    lance.position.y = 0.45;
    const vamplate = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 12, 1, true), this.mats.carapace);
    vamplate.position.y = 0.02;
    (vamplate.material as THREE.Material).side = THREE.DoubleSide;
    const pennant = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.08), visorMat);
    pennant.position.set(0, 0.85, 0.075);
    pennant.rotation.y = Math.PI / 2;
    this.lanceTip.position.y = 1.02;
    this.lanceArm.add(lance, vamplate, pennant, this.lanceTip);
    r.add(torso, chest, helm, dome, visor, plume, shield, this.lanceArm);
    this.barrel.add(r);
  }
}
