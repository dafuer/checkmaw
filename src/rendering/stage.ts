import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Animator, ease, lerp } from './animation/animator';
import type { Look } from './scenery';

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** Renderer, camera, lights, post-processing and the frame loop. */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  readonly animator = new Animator();
  readonly keyLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly rimLight: THREE.DirectionalLight;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly clock = new THREE.Clock();
  private shake = 0;
  private flightToken = 0;
  private readonly frameListeners = new Set<(dt: number) => void>();

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x07060c);
    this.scene.fog = new THREE.FogExp2(0x0a0812, 0.035);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 0.1, 200);
    this.camera.position.set(0, 11.2, 8.4);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 22;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.enablePan = false;

    this.hemiLight = new THREE.HemisphereLight(0x8a7cff, 0x1a0c08, 0.35);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xffe2c4, 2.1);
    this.keyLight.position.set(6, 14, 7);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.left = -8;
    this.keyLight.shadow.camera.right = 8;
    this.keyLight.shadow.camera.top = 8;
    this.keyLight.shadow.camera.bottom = -8;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x6a5cff, 1.4);
    this.rimLight.position.set(-8, 6, -9);
    this.scene.add(this.rimLight);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.75, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize(container));
  }

  start(): void {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  onFrame(listener: (dt: number) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** Background, fog, lights, exposure and bloom of a scene (see scenery.ts). */
  applyLook(look: Look): void {
    this.scene.background = look.background;
    this.scene.fog = look.fog;
    this.scene.environmentIntensity = look.environment;
    this.renderer.toneMappingExposure = look.exposure;
    this.hemiLight.color.setHex(look.hemisphere.sky);
    this.hemiLight.groundColor.setHex(look.hemisphere.ground);
    this.hemiLight.intensity = look.hemisphere.intensity;
    this.keyLight.color.setHex(look.key.color);
    this.keyLight.intensity = look.key.intensity;
    this.rimLight.color.setHex(look.rim.color);
    this.rimLight.intensity = look.rim.intensity;
    this.bloom.strength = look.bloom;
  }

  setBloom(strength: number): void {
    this.bloom.strength = strength;
  }

  get bloomStrength(): number {
    return this.bloom.strength;
  }

  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  pose(): CameraPose {
    return { position: this.camera.position.clone(), target: this.controls.target.clone() };
  }

  async flyTo(pose: CameraPose, duration: number, easing = ease.inOutCubic): Promise<void> {
    const from = this.pose();
    // A newer flight always wins over an older one still in progress.
    const token = ++this.flightToken;
    await this.animator.tween(
      duration,
      (t) => {
        if (token !== this.flightToken) return;
        this.camera.position.lerpVectors(from.position, pose.position, t);
        this.controls.target.lerpVectors(from.target, pose.target, t);
      },
      easing,
    );
  }

  /** Smoothly blends the bloom strength, for dramatic beats. */
  async pulseBloom(peak: number, duration: number): Promise<void> {
    const base = this.bloom.strength;
    await this.animator.tween(duration, (t) => {
      this.bloom.strength = lerp(base, peak, Math.sin(t * Math.PI));
    }, ease.linear);
    this.bloom.strength = base;
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.animator.update(dt);
    for (const listener of this.frameListeners) listener(dt * this.animator.speed);
    // OrbitControls clamps the camera distance even when disabled, which would
    // fight scripted cinematics; while disabled we only aim the camera.
    if (this.controls.enabled) this.controls.update();
    else this.camera.lookAt(this.controls.target);

    if (this.shake > 0.001) {
      const s = this.shake * 0.12;
      const offset = new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      this.camera.position.add(offset);
      this.composer.render();
      this.camera.position.sub(offset);
      this.shake *= Math.exp(-dt * 7);
    } else {
      this.composer.render();
    }
  }

  private resize(container: HTMLElement): void {
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }
}
