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
}
