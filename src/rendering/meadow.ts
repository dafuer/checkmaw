import * as THREE from 'three';

/** Deterministic pseudo-random numbers so the landscape is the same every visit. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const GROUND_Y = -0.75;

/**
 * A sunny mountain meadow around the board: sky dome, snowy peaks, rolling
 * grass, pines and round trees, flowers, slow clouds and a few butterflies.
 * Built from primitives in code, like everything else.
 */
export class Meadow {
  readonly group = new THREE.Group();
  private readonly clouds: THREE.Group[] = [];
  private readonly butterflies: Array<{ mesh: THREE.Group; phase: number; radius: number; height: number; speed: number }> = [];
  private time = 0;

  constructor() {
    const rand = seeded(7);
    this.group.add(this.sky());
    this.group.add(this.ground(rand));
    this.group.add(this.pedestal());
    this.group.add(this.mountains(rand));
    this.group.add(this.trees(rand));
    this.group.add(this.flowers(rand));
    this.buildClouds(rand);
    this.buildButterflies(rand);
  }

  update(dt: number): void {
    this.time += dt;
    for (const cloud of this.clouds) {
      cloud.position.x += dt * (cloud.userData.speed as number);
      if (cloud.position.x > 110) cloud.position.x = -110;
    }
    for (const b of this.butterflies) {
      const t = this.time * b.speed + b.phase;
      b.mesh.position.set(Math.cos(t) * b.radius, b.height + Math.sin(t * 3.1) * 0.4, Math.sin(t) * b.radius);
      b.mesh.rotation.y = -t;
      const flap = Math.sin(this.time * 18 + b.phase) * 0.9;
      b.mesh.children[0].rotation.z = flap;
      b.mesh.children[1].rotation.z = -flap;
    }
  }

  private sky(): THREE.Mesh {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x3d8fe0) },
        horizon: { value: new THREE.Color(0xcfe9ff) },
        sun: { value: new THREE.Vector3(0.45, 0.55, -0.7).normalize() },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 sun;
        varying vec3 vDir;
        void main() {
          float h = max(vDir.y, 0.0);
          vec3 c = mix(horizon, top, pow(h, 0.55));
          float glow = pow(max(dot(vDir, sun), 0.0), 64.0);
          c += vec3(1.0, 0.92, 0.7) * glow * 0.6;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 16), material);
    sky.renderOrder = -1;
    return sky;
  }

  private ground(rand: () => number): THREE.Mesh {
    const geo = new THREE.CircleGeometry(150, 96, 0, Math.PI * 2);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const light = new THREE.Color(0x8cc95a);
    const dark = new THREE.Color(0x4f8f3a);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      // Flat around the board, rolling hills further out.
      const hills = Math.sin(x * 0.09) * Math.cos(z * 0.07) * 1.6 + Math.sin(x * 0.03 + z * 0.05) * 2.5;
      const away = THREE.MathUtils.smoothstep(r, 9, 30);
      pos.setY(i, hills * away + (rand() - 0.5) * 0.15 * away);
      c.copy(dark).lerp(light, 0.5 + Math.sin(x * 0.4) * Math.cos(z * 0.3) * 0.35 + (rand() - 0.5) * 0.2);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
    ground.position.y = GROUND_Y;
    ground.receiveShadow = true;
    return ground;
  }

  /** A low stone dais the board rests on. */
  private pedestal(): THREE.Group {
    const group = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.85 });
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 7.0, 0.32, 40), stone);
    dais.position.y = GROUND_Y + 0.15;
    dais.receiveShadow = true;
    const step = new THREE.Mesh(new THREE.CylinderGeometry(7.3, 7.6, 0.16, 40), stone);
    step.position.y = GROUND_Y + 0.02;
    step.receiveShadow = true;
    group.add(dais, step);
    return group;
  }

  private mountains(rand: () => number): THREE.Group {
    const group = new THREE.Group();
    const rock = new THREE.MeshStandardMaterial({ color: 0x7d8aa3, roughness: 0.9, flatShading: true });
    const snow = new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.6, flatShading: true });
    const count = 16;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand() * 0.3;
      const dist = 70 + rand() * 35;
      const height = 22 + rand() * 26;
      const radius = 16 + rand() * 12;
      const geo = new THREE.ConeGeometry(radius, height, 7, 4);
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < p.count; v++) {
        if (p.getY(v) > height / 2 - 0.01) continue;
        p.setX(v, p.getX(v) * (0.85 + rand() * 0.3));
        p.setZ(v, p.getZ(v) * (0.85 + rand() * 0.3));
      }
      geo.computeVertexNormals();
      const peak = new THREE.Mesh(geo, rock);
      peak.position.set(Math.cos(a) * dist, GROUND_Y + height / 2 - 2, Math.sin(a) * dist);
      peak.rotation.y = rand() * Math.PI;
      // Snow cap: the top part of the same cone, slightly larger.
      const capH = height * 0.32;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.34, capH, 7, 1), snow);
      cap.position.y = height / 2 - capH / 2 + 0.05;
      peak.add(cap);
      group.add(peak);
    }
    return group;
  }

  private trees(rand: () => number): THREE.Group {
    const group = new THREE.Group();
    const trunk = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
    const pine = new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.85, flatShading: true });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x5aa548, roughness: 0.85, flatShading: true });
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2;
      const r = 21 + rand() * 38;
      const tree = new THREE.Group();
      const s = 0.8 + rand() * 0.9;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6), trunk);
      stem.position.y = 0.7;
      tree.add(stem);
      if (rand() < 0.65) {
        for (let k = 0; k < 3; k++) {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(1.3 - k * 0.3, 1.6, 7), pine);
          cone.position.y = 1.6 + k * 0.85;
          cone.castShadow = true;
          tree.add(cone);
        }
      } else {
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), leaf);
        crown.position.y = 2.1;
        crown.scale.set(1, 0.9, 1);
        crown.castShadow = true;
        tree.add(crown);
      }
      tree.scale.setScalar(s);
      tree.position.set(Math.cos(a) * r, GROUND_Y + this.hillHeight(Math.cos(a) * r, Math.sin(a) * r) - 0.1, Math.sin(a) * r);
      group.add(tree);
    }
    return group;
  }

  /** Same hills as the ground mesh (without its tiny jitter). */
  private hillHeight(x: number, z: number): number {
    const r = Math.hypot(x, z);
    const hills = Math.sin(x * 0.09) * Math.cos(z * 0.07) * 1.6 + Math.sin(x * 0.03 + z * 0.05) * 2.5;
    return hills * THREE.MathUtils.smoothstep(r, 9, 30);
  }

  private flowers(rand: () => number): THREE.InstancedMesh {
    const colors = [0xffffff, 0xffe066, 0xff8fb1, 0xb59cff, 0xff6b6b];
    const count = 500;
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ roughness: 0.7 }), count);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = 8 + rand() * 26;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      m.makeTranslation(x, GROUND_Y + this.hillHeight(x, z) + 0.08, z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHex(colors[Math.floor(rand() * colors.length)]));
    }
    return mesh;
  }

  private buildClouds(rand: () => number): void {
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.25, flatShading: true });
    for (let i = 0; i < 12; i++) {
      const cloud = new THREE.Group();
      for (let k = 0; k < 5; k++) {
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + rand() * 2.5, 1), white);
        puff.position.set(k * 2.6 - 5, rand() * 1.2, (rand() - 0.5) * 2.5);
        cloud.add(puff);
      }
      cloud.position.set(-110 + rand() * 220, 30 + rand() * 18, -100 + rand() * 200);
      cloud.userData.speed = 0.6 + rand() * 0.8;
      this.clouds.push(cloud);
      this.group.add(cloud);
    }
  }

  private buildButterflies(rand: () => number): void {
    const tints = [0xffd23f, 0xff7eb6, 0x7ec8ff];
    for (let i = 0; i < 6; i++) {
      const wing = new THREE.MeshStandardMaterial({ color: tints[i % tints.length], side: THREE.DoubleSide, roughness: 0.6 });
      const mesh = new THREE.Group();
      for (const side of [-1, 1]) {
        const pivot = new THREE.Group();
        const w = new THREE.Mesh(new THREE.CircleGeometry(0.12, 8), wing);
        w.rotation.x = -Math.PI / 2;
        w.position.x = side * 0.11;
        pivot.add(w);
        mesh.add(pivot);
      }
      this.butterflies.push({ mesh, phase: rand() * 10, radius: 7 + rand() * 5, height: 0.6 + rand() * 1.5, speed: 0.15 + rand() * 0.15 });
      this.group.add(mesh);
    }
  }
}
