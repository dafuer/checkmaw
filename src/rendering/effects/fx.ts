import * as THREE from 'three';
import { ease, type Animator } from '../animation/animator';

/** Short-lived, self-disposing battle effects: bolts, shockwaves, slash arcs, portals and cut halves. */
export class Fx {
  constructor(
    private readonly scene: THREE.Scene,
    private readonly anim: Animator,
  ) {}

  /** A jagged glowing bolt from `from` to `to`. */
  async lightning(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, duration = 0.22): Promise<void> {
    const points: THREE.Vector3[] = [];
    const steps = 9;
    const side = new THREE.Vector3();
    for (let i = 0; i <= steps; i++) {
      const p = from.clone().lerp(to, i / steps);
      if (i > 0 && i < steps) {
        side.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.28);
        p.add(side);
      }
      points.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.1);
    const geo = new THREE.TubeGeometry(curve, 40, 0.022, 5, false);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(geo, mat);
    this.scene.add(core);
    await this.anim.tween(duration, (t) => {
      mat.opacity = t < 0.5 ? 1 : 1 - (t - 0.5) * 2;
      core.scale.setScalar(1 + Math.sin(t * 40) * 0.02);
    }, ease.linear);
    this.scene.remove(core);
    geo.dispose();
    mat.dispose();
  }

  /** A flat ring that races outward along the floor. */
  async shockwave(at: THREE.Vector3, color: THREE.ColorRepresentation, radius = 2, duration = 0.6): Promise<void> {
    const geo = new THREE.RingGeometry(0.8, 1, 48);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(at).setY(0.03);
    this.scene.add(ring);
    await this.anim.tween(duration, (t) => {
      ring.scale.setScalar(0.1 + t * radius);
      mat.opacity = 1 - t;
    }, ease.outCubic);
    this.scene.remove(ring);
    geo.dispose();
    mat.dispose();
  }

  /** A bright crescent left in the air by a blade swing; `facing` is the swing's yaw. */
  async slashArc(at: THREE.Vector3, facing: number, color: THREE.ColorRepresentation, vertical = true, size = 0.5): Promise<void> {
    const geo = new THREE.TorusGeometry(size, 0.014, 6, 32, Math.PI * 0.9);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const arc = new THREE.Mesh(geo, mat);
    arc.position.copy(at);
    arc.rotation.order = 'YXZ';
    arc.rotation.y = facing + (vertical ? Math.PI / 2 : 0);
    if (!vertical) arc.rotation.x = Math.PI / 2;
    arc.rotation.z = vertical ? -Math.PI * 0.05 : 0;
    this.scene.add(arc);
    await this.anim.tween(0.25, (t) => {
      mat.opacity = 1 - t;
      arc.scale.setScalar(1 + t * 0.35);
    }, ease.outQuad);
    this.scene.remove(arc);
    geo.dispose();
    mat.dispose();
  }

  /**
   * Cuts an object in two along a plane given in its local space (normal and
   * distance from its origin): returns two clipped copies that can be animated
   * independently, the first on the normal's side. The source should be hidden
   * by the caller.
   */
  split(
    source: THREE.Object3D,
    normal = new THREE.Vector3(1, 0, 0),
    offset = 0,
  ): { halves: [THREE.Object3D, THREE.Object3D]; burn: (color: THREE.ColorRepresentation, intensity: number) => void; dispose: () => void } {
    source.updateMatrixWorld(true);
    const materials: THREE.Material[] = [];
    const ticker: Array<() => void> = [];
    const makeHalf = (side: number): THREE.Object3D => {
      const half = source.clone(true);
      half.visible = true;
      const local = new THREE.Plane(normal.clone().multiplyScalar(side), -offset * side);
      const world = new THREE.Plane();
      half.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if ((o as THREE.Light).isLight) o.visible = false;
        if (!mesh.isMesh) return;
        const mat = (mesh.material as THREE.Material).clone();
        mat.clippingPlanes = [world];
        mat.clipShadows = true;
        mat.side = THREE.DoubleSide;
        materials.push(mat);
        mesh.material = mat;
      });
      half.userData.updatePlane = () => {
        half.updateMatrixWorld(true);
        world.copy(local).applyMatrix4(half.matrixWorld);
      };
      ticker.push(half.userData.updatePlane as () => void);
      this.scene.add(half);
      return half;
    };
    const halves: [THREE.Object3D, THREE.Object3D] = [makeHalf(1), makeHalf(-1)];
    const stop = this.anim.every(() => {
      for (const f of ticker) f();
      return false;
    });
    for (const f of ticker) f();
    return {
      halves,
      /** Makes both halves glow (the hot edge of the cut), e.g. fading out over time. */
      burn: (color, intensity) => {
        for (const m of materials) {
          const lit = m as THREE.MeshStandardMaterial;
          if (!lit.emissive) continue;
          lit.emissive.set(color);
          lit.emissiveIntensity = intensity;
        }
      },
      dispose: () => {
        stop();
        for (const h of halves) this.scene.remove(h);
        for (const m of materials) m.dispose();
      },
    };
  }

  // ------------------------------------------------------------ glow helpers

  private glowMaterial(color: THREE.ColorRepresentation, boost = 2): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(boost),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  /** Adds a self-lit additive mesh; the caller animates it and calls `dispose` when done. */
  glow(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, boost = 2): GlowHandle {
    const material = this.glowMaterial(color, boost);
    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);
    return {
      mesh,
      material,
      dispose: () => {
        this.scene.remove(mesh);
        geometry.dispose();
        material.dispose();
      },
    };
  }

  /**
   * A ribbon of light that follows a weapon from grip to tip. Samples fade by
   * age in animation time, so the trail lingers in slow motion. Call the
   * returned function to let it fade out and clean itself up.
   */
  trail(tip: (out: THREE.Vector3) => THREE.Vector3, grip: (out: THREE.Vector3) => THREE.Vector3, color: THREE.ColorRepresentation, life = 0.16): () => void {
    const MAX = 28;
    const positions = new Float32Array(MAX * 2 * 3);
    const colors = new Float32Array(MAX * 2 * 3);
    const index: number[] = [];
    for (let i = 0; i < MAX - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(index);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const ribbon = new THREE.Mesh(geo, mat);
    ribbon.frustumCulled = false;
    this.scene.add(ribbon);

    const base = new THREE.Color(color).multiplyScalar(1.8);
    const samples: Array<{ tip: THREE.Vector3; grip: THREE.Vector3; age: number }> = [];
    let feeding = true;
    const stop = this.anim.every((dt) => {
      for (const s of samples) s.age += dt;
      while (samples.length && samples[samples.length - 1].age > life) samples.pop();
      if (feeding) {
        samples.unshift({ tip: tip(new THREE.Vector3()), grip: grip(new THREE.Vector3()), age: 0 });
        if (samples.length > MAX) samples.length = MAX;
      }
      for (let i = 0; i < MAX; i++) {
        const s = samples[Math.min(i, samples.length - 1)];
        const k = s && i < samples.length ? Math.max(0, 1 - s.age / life) : 0;
        if (s) {
          positions.set([s.tip.x, s.tip.y, s.tip.z, s.grip.x, s.grip.y, s.grip.z], i * 6);
        }
        // Bright at the tip edge, dim toward the grip.
        colors.set([base.r * k, base.g * k, base.b * k, base.r * k * 0.15, base.g * k * 0.15, base.b * k * 0.15], i * 6);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      if (!feeding && samples.length === 0) {
        this.scene.remove(ribbon);
        geo.dispose();
        mat.dispose();
        return true;
      }
      return false;
    });
    void stop;
    return () => {
      feeding = false;
    };
  }

  /** A column of light that flares and thins out. */
  async pillar(at: THREE.Vector3, color: THREE.ColorRepresentation, height = 5, radius = 0.35, duration = 0.6): Promise<void> {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
    geo.translate(0, 0.5, 0);
    // Kept dim: it is additive, drawn twice (both faces) and then bloomed.
    const { mesh, material, dispose } = this.glow(geo, color, 0.8);
    mesh.position.copy(at).setY(0.02);
    await this.anim.tween(duration, (t) => {
      const r = radius * (t < 0.2 ? t / 0.2 : 1 - (t - 0.2) * 0.9);
      mesh.scale.set(Math.max(0.001, r), height, Math.max(0.001, r));
      material.opacity = 0.4 * (t < 0.2 ? 1 : 1 - (t - 0.2) / 0.8);
    }, ease.linear);
    dispose();
  }

  /** A straight beam between two points that flashes and fades. */
  async beam(from: THREE.Vector3, to: THREE.Vector3, color: THREE.ColorRepresentation, width = 0.05, duration = 0.25): Promise<void> {
    const length = from.distanceTo(to);
    const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
    geo.rotateX(Math.PI / 2);
    const { mesh, material, dispose } = this.glow(geo, color, 2.4);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.lookAt(to);
    await this.anim.tween(duration, (t) => {
      const w = width * (1 - t * 0.7) * (1 + Math.sin(t * 50) * 0.15);
      mesh.scale.set(w, w, length);
      material.opacity = 1 - t * t;
    }, ease.linear);
    dispose();
  }

  /** Jagged scorch cracks that spread across the floor from an impact and fade away. */
  async groundCrack(at: THREE.Vector3, radius = 1, duration = 2.2, color: THREE.ColorRepresentation = 0xff7a2a): Promise<void> {
    const vertices: number[] = [];
    const arms = 7 + Math.floor(Math.random() * 3);
    for (let i = 0; i < arms; i++) {
      let angle = (i / arms) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      let x = 0;
      let z = 0;
      const steps = 4;
      const reach = radius * (0.55 + Math.random() * 0.45);
      for (let j = 0; j < steps; j++) {
        angle += (Math.random() - 0.5) * 0.9;
        const nx = x + Math.cos(angle) * (reach / steps);
        const nz = z + Math.sin(angle) * (reach / steps);
        const w0 = 0.028 * (1 - j / steps);
        const w1 = 0.028 * (1 - (j + 1) / steps);
        const px = -Math.sin(angle);
        const pz = Math.cos(angle);
        vertices.push(
          x + px * w0, 0, z + pz * w0, x - px * w0, 0, z - pz * w0, nx + px * w1, 0, nz + pz * w1,
          x - px * w0, 0, z - pz * w0, nx - px * w1, 0, nz - pz * w1, nx + px * w1, 0, nz + pz * w1,
        );
        x = nx;
        z = nz;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const { mesh, material, dispose } = this.glow(geo, color, 2.2);
    mesh.position.copy(at).setY(0.014);
    await this.anim.tween(duration, (t) => {
      const grow = Math.min(1, t * 8);
      mesh.scale.setScalar(Math.max(0.001, grow));
      material.opacity = t < 0.15 ? 1 : (1 - t) / 0.85;
    }, ease.linear);
    dispose();
  }

  /** Little stars circling a dazed head; `centre` is sampled every frame. */
  async dizzyStars(centre: (out: THREE.Vector3) => THREE.Vector3, color: THREE.ColorRepresentation, duration = 1.2, count = 4): Promise<void> {
    const geo = new THREE.OctahedronGeometry(0.045, 0);
    const material = this.glowMaterial(color, 2.6);
    const group = new THREE.Group();
    for (let i = 0; i < count; i++) group.add(new THREE.Mesh(geo, material));
    this.scene.add(group);
    const at = new THREE.Vector3();
    await this.anim.tween(duration, (t) => {
      centre(at);
      group.position.copy(at);
      const fade = Math.min(1, t * 6, (1 - t) * 4);
      group.children.forEach((star, i) => {
        const a = t * duration * 7 + (i / count) * Math.PI * 2;
        star.position.set(Math.cos(a) * 0.22, Math.sin(a * 2) * 0.03, Math.sin(a) * 0.22);
        star.rotation.y = a * 2;
        star.scale.setScalar(Math.max(0.001, fade));
      });
    }, ease.linear);
    this.scene.remove(group);
    geo.dispose();
    material.dispose();
  }

  /** A glowing copy of an object left behind for a moment (dash and blink trails). */
  async afterimage(source: THREE.Object3D, color: THREE.ColorRepresentation, duration = 0.35): Promise<void> {
    source.updateMatrixWorld(true);
    const ghost = source.clone(true);
    const material = this.glowMaterial(color, 0.9);
    material.side = THREE.FrontSide;
    ghost.traverse((o) => {
      if ((o as THREE.Light).isLight) o.visible = false;
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = material;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    });
    this.scene.add(ghost);
    await this.anim.tween(duration, (t) => (material.opacity = 0.55 * (1 - t)), ease.outQuad);
    this.scene.remove(ghost);
    material.dispose();
  }

  /**
   * Clips an object away along a horizontal plane the caller moves: everything
   * above (or below) `level()` vanishes. Returns a function that removes the
   * clipping again.
   */
  dissolve(root: THREE.Object3D, level: () => number, keep: 'below' | 'above' = 'below'): () => void {
    const plane = new THREE.Plane(new THREE.Vector3(0, keep === 'below' ? -1 : 1, 0), 0);
    const touched = new Set<THREE.Material>();
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.Material;
      if (touched.has(mat)) return;
      touched.add(mat);
      mat.clippingPlanes = [plane];
      mat.clipShadows = true;
      mat.needsUpdate = true;
    });
    const stop = this.anim.every(() => {
      plane.constant = keep === 'below' ? level() : -level();
      return false;
    });
    plane.constant = keep === 'below' ? level() : -level();
    return () => {
      stop();
      for (const mat of touched) {
        mat.clippingPlanes = null;
        mat.needsUpdate = true;
      }
    };
  }
}

export interface GlowHandle {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  dispose: () => void;
}
