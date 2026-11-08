import * as THREE from 'three';
import type { Square } from '../domain/types';
import { squareToXZ, xzToSquare } from './coords';
import { boardTexture, frameTexture, glowSprite, runeCircleTexture, stoneTexture } from './textures';

export type MarkerKind = 'selected' | 'move' | 'capture' | 'last' | 'check' | 'hover';

const MARKER_STYLE: Record<MarkerKind, { color: number; opacity: number; shape: 'disc' | 'ring' | 'tile' }> = {
  selected: { color: 0x4fd1ff, opacity: 0.55, shape: 'tile' },
  hover: { color: 0xffffff, opacity: 0.12, shape: 'tile' },
  move: { color: 0x7dffb0, opacity: 0.8, shape: 'disc' },
  capture: { color: 0xff3b3b, opacity: 0.9, shape: 'ring' },
  last: { color: 0xffc04d, opacity: 0.22, shape: 'tile' },
  check: { color: 0xff1a1a, opacity: 0.75, shape: 'tile' },
};

interface Brazier {
  light: THREE.PointLight | null;
  flame: THREE.Mesh;
  base: number;
  phase: number;
}

/** The board, its frame and the surrounding ritual arena. */
export class Board {
  readonly group = new THREE.Group();
  private readonly pickPlane: THREE.Mesh;
  private readonly markers = new Map<MarkerKind, THREE.Mesh[]>();
  private readonly markerGeo: Record<'disc' | 'ring' | 'tile', THREE.BufferGeometry>;
  private readonly braziers: Brazier[] = [];
  private readonly embers: THREE.Points;
  private readonly runeMaterial: THREE.MeshStandardMaterial;
  private time = 0;

  constructor() {
    const tex = boardTexture();
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshPhysicalMaterial({
        map: tex.map,
        roughnessMap: tex.roughness,
        roughness: 1,
        metalness: 0,
        clearcoat: 0.55,
        clearcoatRoughness: 0.32,
      }),
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.002;
    top.receiveShadow = true;
    this.group.add(top);
    this.pickPlane = top;

    const frameMat = new THREE.MeshPhysicalMaterial({ map: frameTexture(), roughness: 0.45, metalness: 0.2, clearcoat: 0.5 });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x15111c, roughness: 0.6, metalness: 0.3 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.4, 9.2), [sideMat, sideMat, frameMat, sideMat, sideMat, sideMat]);
    frame.position.y = -0.2;
    frame.receiveShadow = true;
    frame.castShadow = true;
    this.group.add(frame);

    const trim = new THREE.Mesh(
      new THREE.BoxGeometry(9.5, 0.08, 9.5),
      new THREE.MeshStandardMaterial({ color: 0xc89b45, metalness: 1, roughness: 0.3 }),
    );
    trim.position.y = -0.42;
    this.group.add(trim);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(6.2, 7.4, 1.6, 8, 1),
      new THREE.MeshStandardMaterial({ map: stoneTexture(3, '#1d1922', '#5d5468'), roughness: 0.9 }),
    );
    plinth.rotation.y = Math.PI / 8;
    plinth.position.y = -1.26;
    plinth.receiveShadow = true;
    this.group.add(plinth);

    // Arena floor with the glowing rune circle.
    const floorTex = stoneTexture(11, '#0f0c13', '#3a3142');
    floorTex.repeat.set(6, 6);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(40, 64),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.05;
    floor.receiveShadow = true;
    this.group.add(floor);

    this.runeMaterial = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xff5a1f,
      emissiveMap: runeCircleTexture(),
      emissiveIntensity: 1.6,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const runes = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), this.runeMaterial);
    runes.rotation.x = -Math.PI / 2;
    runes.position.y = -2.03;
    this.group.add(runes);

    this.buildPillars();
    this.embers = this.buildEmbers();
    this.group.add(this.embers);

    this.markerGeo = {
      disc: new THREE.CircleGeometry(0.16, 32),
      ring: new THREE.RingGeometry(0.38, 0.48, 48),
      tile: new THREE.PlaneGeometry(0.98, 0.98),
    };
  }

  /** Square under a ray, using the board surface. */
  pick(raycaster: THREE.Raycaster): Square | null {
    const hit = raycaster.intersectObject(this.pickPlane, false)[0];
    return hit ? xzToSquare(hit.point.x, hit.point.z) : null;
  }

  setMarkers(kind: MarkerKind, squares: Square[]): void {
    const style = MARKER_STYLE[kind];
    const pool = this.markers.get(kind) ?? [];
    while (pool.length < squares.length) {
      const mesh = new THREE.Mesh(
        this.markerGeo[style.shape],
        new THREE.MeshBasicMaterial({
          color: style.color,
          transparent: true,
          opacity: style.opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      pool.push(mesh);
    }
    this.markers.set(kind, pool);
    pool.forEach((mesh, i) => {
      const sq = squares[i];
      mesh.visible = sq !== undefined;
      if (!sq) return;
      const { x, z } = squareToXZ(sq);
      const layer = ['last', 'check', 'hover', 'selected', 'capture', 'move'].indexOf(kind);
      mesh.position.set(x, 0.006 + layer * 0.002, z);
    });
  }

  clearMarkers(...kinds: MarkerKind[]): void {
    for (const kind of kinds) this.setMarkers(kind, []);
  }

  update(dt: number): void {
    this.time += dt;
    for (const b of this.braziers) {
      const flicker = Math.sin(this.time * 9 + b.phase) * 0.25 + Math.sin(this.time * 23 + b.phase * 2) * 0.15 + (Math.random() - 0.5) * 0.2;
      if (b.light) b.light.intensity = b.base * (1 + flicker * 0.5);
      b.flame.scale.set(1 + flicker * 0.15, 1 + flicker * 0.4, 1 + flicker * 0.15);
      b.flame.rotation.y += dt * 2;
    }
    this.runeMaterial.emissiveIntensity = 1.2 + Math.sin(this.time * 1.3) * 0.4;

    // Pulse each marker group softly.
    const pulse = 0.85 + Math.sin(this.time * 5) * 0.15;
    for (const [kind, pool] of this.markers) {
      const base = MARKER_STYLE[kind].opacity;
      for (const m of pool) (m.material as THREE.MeshBasicMaterial).opacity = base * (kind === 'last' ? 1 : pulse);
    }

    const pos = this.embers.geometry.attributes.position as THREE.BufferAttribute;
    const speeds = this.embers.userData.speeds as Float32Array;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + speeds[i] * dt;
      let x = pos.getX(i) + Math.sin(this.time * 0.8 + i) * dt * 0.15;
      if (y > 9) {
        y = -2;
        const a = Math.random() * Math.PI * 2;
        const r = 7 + Math.random() * 10;
        x = Math.cos(a) * r;
        pos.setZ(i, Math.sin(a) * r);
      }
      pos.setXY(i, x, y);
    }
    pos.needsUpdate = true;
  }

  private buildPillars(): void {
    const stone = new THREE.MeshStandardMaterial({ map: stoneTexture(5, '#221d28', '#6b6175'), roughness: 0.85 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xb8893a, metalness: 1, roughness: 0.35 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
    const count = 8;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.PI / 8;
      const r = 11;
      const pillar = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 6, 12), stone);
      shaft.position.y = 1;
      shaft.castShadow = true;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.5, 0.4, 12), gold);
      cap.position.y = 4.2;
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), gold);
      bowl.position.y = 4.65;
      bowl.rotation.x = Math.PI;
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.3, 10, 1, true), flameMat);
      flame.position.y = 5.1;
      pillar.add(shaft, cap, bowl, flame);
      pillar.position.set(Math.cos(a) * r, -2.05, Math.sin(a) * r);
      this.group.add(pillar);
      // Only every other brazier carries a real light: each light costs on every material.
      let light: THREE.PointLight | null = null;
      if (i % 2 === 0) {
        light = new THREE.PointLight(0xff6a2a, 30, 20, 1.6);
        light.position.y = 5.4;
        pillar.add(light);
      }
      this.braziers.push({ light, flame, base: 30, phase: i * 1.7 });
    }
  }

  private buildEmbers(): THREE.Points {
    const n = 420;
    const positions = new Float32Array(n * 3);
    const speeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6.5 + Math.random() * 12;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = -2 + Math.random() * 11;
      positions[i * 3 + 2] = Math.sin(a) * r;
      speeds[i] = 0.3 + Math.random() * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.12,
        map: glowSprite(),
        color: 0xff8a3a,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    points.userData.speeds = speeds;
    return points;
  }
}
