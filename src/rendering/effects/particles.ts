import * as THREE from 'three';
import { glowSprite } from '../textures';

interface Shard {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  scale: number;
  life: number;
  maxLife: number;
}

interface Spark {
  life: number;
  maxLife: number;
  vel: THREE.Vector3;
  gravity: number;
  drag: number;
}

export interface SparkOptions {
  count: number;
  color: THREE.ColorRepresentation;
  speed: number;
  life?: number;
  gravity?: number;
  drag?: number;
  spread?: THREE.Vector3;
  direction?: THREE.Vector3;
  cone?: number;
}

const FLOOR_Y = 0.02;

/** Pooled shards (solid fragments) and sparks (additive glowing points). */
export class Particles {
  readonly group = new THREE.Group();
  private readonly shardMesh: THREE.InstancedMesh;
  private readonly shards: Shard[] = [];
  private readonly sparkPoints: THREE.Points;
  private readonly sparks: Spark[] = [];
  private sparkCursor = 0;
  private shardCursor = 0;
  private readonly tmp = new THREE.Object3D();

  constructor(maxShards = 700, maxSparks = 2400) {
    const shardGeo = new THREE.TetrahedronGeometry(0.07, 0);
    const shardMat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1 });
    this.shardMesh = new THREE.InstancedMesh(shardGeo, shardMat, maxShards);
    this.shardMesh.castShadow = true;
    this.shardMesh.frustumCulled = false;
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < maxShards; i++) {
      this.shards.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        scale: 1,
        life: 0,
        maxLife: 1,
      });
      this.tmp.scale.setScalar(0);
      this.tmp.updateMatrix();
      this.shardMesh.setMatrixAt(i, this.tmp.matrix);
      this.shardMesh.setColorAt(i, new THREE.Color(0xffffff));
    }
    this.group.add(this.shardMesh);

    const positions = new Float32Array(maxSparks * 3).fill(-999);
    const colors = new Float32Array(maxSparks * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkPoints = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.14,
        map: glowSprite(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.sparkPoints.frustumCulled = false;
    for (let i = 0; i < maxSparks; i++) {
      this.sparks.push({ life: 0, maxLife: 1, vel: new THREE.Vector3(), gravity: 0, drag: 0 });
    }
    this.group.add(this.sparkPoints);
  }

  /** Breaks something into solid fragments flying outward. */
  shatter(origin: THREE.Vector3, color: THREE.ColorRepresentation, count: number, power = 2.5, height = 0.6): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const idx = this.shardCursor++ % this.shards.length;
      const s = this.shards[idx];
      s.alive = true;
      s.pos.set(origin.x + (Math.random() - 0.5) * 0.3, origin.y + Math.random() * height, origin.z + (Math.random() - 0.5) * 0.3);
      const a = Math.random() * Math.PI * 2;
      const up = 0.6 + Math.random() * 1.4;
      s.vel.set(Math.cos(a) * power * Math.random(), up * power * 0.8, Math.sin(a) * power * Math.random());
      s.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.spin.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
      s.scale = 0.5 + Math.random() * 1.1;
      s.maxLife = 2.2 + Math.random() * 1.2;
      s.life = s.maxLife;
      this.shardMesh.setColorAt(idx, c.clone().multiplyScalar(0.75 + Math.random() * 0.4));
    }
    if (this.shardMesh.instanceColor) this.shardMesh.instanceColor.needsUpdate = true;
  }

  sparksAt(origin: THREE.Vector3, opts: SparkOptions): void {
    const pos = this.sparkPoints.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.sparkPoints.geometry.attributes.color as THREE.BufferAttribute;
    const c = new THREE.Color(opts.color);
    const dir = opts.direction?.clone().normalize();
    for (let i = 0; i < opts.count; i++) {
      const idx = this.sparkCursor++ % this.sparks.length;
      const s = this.sparks[idx];
      const spread = opts.spread;
      pos.setXYZ(
        idx,
        origin.x + (spread ? (Math.random() - 0.5) * spread.x : 0),
        origin.y + (spread ? (Math.random() - 0.5) * spread.y : 0),
        origin.z + (spread ? (Math.random() - 0.5) * spread.z : 0),
      );
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      if (dir) v.multiplyScalar(opts.cone ?? 0.5).add(dir).normalize();
      s.vel.copy(v.multiplyScalar(opts.speed * (0.4 + Math.random() * 0.8)));
      s.maxLife = (opts.life ?? 1) * (0.6 + Math.random() * 0.6);
      s.life = s.maxLife;
      s.gravity = opts.gravity ?? 0;
      s.drag = opts.drag ?? 1.5;
      const tint = c.clone().offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.15);
      col.setXYZ(idx, tint.r, tint.g, tint.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  update(dt: number): void {
    let shardsDirty = false;
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i];
      if (!s.alive) continue;
      shardsDirty = true;
      s.life -= dt;
      s.vel.y -= 9.8 * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y < FLOOR_Y) {
        s.pos.y = FLOOR_Y;
        s.vel.y *= -0.35;
        s.vel.x *= 0.7;
        s.vel.z *= 0.7;
        s.spin.multiplyScalar(0.6);
      }
      s.rot.x += s.spin.x * dt;
      s.rot.y += s.spin.y * dt;
      s.rot.z += s.spin.z * dt;
      const fade = Math.min(1, s.life / 0.6);
      this.tmp.position.copy(s.pos);
      this.tmp.rotation.copy(s.rot);
      this.tmp.scale.setScalar(Math.max(0, s.scale * fade));
      this.tmp.updateMatrix();
      this.shardMesh.setMatrixAt(i, this.tmp.matrix);
      if (s.life <= 0) s.alive = false;
    }
    if (shardsDirty) this.shardMesh.instanceMatrix.needsUpdate = true;

    const pos = this.sparkPoints.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.sparkPoints.geometry.attributes.color as THREE.BufferAttribute;
    let sparksDirty = false;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (s.life <= 0) continue;
      sparksDirty = true;
      s.life -= dt;
      s.vel.y -= s.gravity * dt;
      s.vel.multiplyScalar(Math.exp(-s.drag * dt));
      pos.setXYZ(i, pos.getX(i) + s.vel.x * dt, pos.getY(i) + s.vel.y * dt, pos.getZ(i) + s.vel.z * dt);
      if (s.life <= 0) {
        pos.setXYZ(i, 0, -999, 0);
      } else if (s.life < 0.3) {
        const k = 1 - dt / Math.max(0.05, s.life);
        col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
      }
    }
    if (sparksDirty) {
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }
  }
}
