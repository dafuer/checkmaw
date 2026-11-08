import * as THREE from 'three';
import type { Color } from '../../domain/types';

export const TEAM_GLOW: Record<Color, number> = { w: 0x47e6ff, b: 0xff2a5c };

export interface PieceMaterials {
  body: THREE.MeshPhysicalMaterial;
  accent: THREE.MeshStandardMaterial;
  flesh: THREE.MeshStandardMaterial;
  tooth: THREE.MeshStandardMaterial;
  eye: THREE.MeshBasicMaterial;
  carapace: THREE.MeshStandardMaterial;
}

/** Each piece owns its materials so its glow can animate independently. */
export function createMaterials(color: Color): PieceMaterials {
  const white = color === 'w';
  return {
    body: new THREE.MeshPhysicalMaterial({
      color: white ? 0xe6dac4 : 0x1a1622,
      roughness: white ? 0.28 : 0.18,
      metalness: white ? 0 : 0.25,
      clearcoat: 1,
      clearcoatRoughness: white ? 0.12 : 0.06,
      sheen: white ? 0.4 : 0.6,
      sheenColor: new THREE.Color(white ? 0xfff1d6 : 0x6a3cff),
      emissive: new THREE.Color(TEAM_GLOW[color]),
      emissiveIntensity: 0,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: white ? 0xd8a640 : 0x8c1430,
      metalness: 1,
      roughness: 0.28,
      emissive: new THREE.Color(white ? 0x2a1800 : 0x300008),
    }),
    flesh: new THREE.MeshStandardMaterial({
      color: 0x3a0612,
      roughness: 0.5,
      emissive: new THREE.Color(white ? 0xff7a1a : 0xff1a3a),
      emissiveIntensity: 2.2,
      side: THREE.DoubleSide,
    }),
    tooth: new THREE.MeshStandardMaterial({ color: 0xf5f0e1, roughness: 0.35, metalness: 0.05 }),
    eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM_GLOW[color]).multiplyScalar(4) }),
    carapace: new THREE.MeshStandardMaterial({
      color: white ? 0x9c8f7a : 0x221c2c,
      roughness: 0.35,
      metalness: white ? 0.1 : 0.4,
      emissive: new THREE.Color(TEAM_GLOW[color]),
      emissiveIntensity: 0.08,
    }),
  };
}
