import * as THREE from 'three';
import type { Color } from '../domain/types';
import type { CameraPose } from './stage';

/**
 * How the camera behaves between battles:
 * - auto: flies to the side of the player to move after every turn;
 * - free: stays wherever the players leave it;
 * - top: straight down over the board (zenithal);
 * - side: across the board from the side, both armies in profile;
 * - corner: a high diagonal three-quarter view;
 * - orbit: circles the board slowly, a showcase view.
 * Every mode still lets the players drag to orbit and scroll to zoom.
 */
export const CAMERA_MODES = ['auto', 'free', 'top', 'side', 'corner', 'orbit'] as const;
export type CameraMode = (typeof CAMERA_MODES)[number];

/** Angular speed of the orbit mode, in radians per second. */
export const ORBIT_SPEED = 0.07;

const pose = (x: number, y: number, z: number, tz = 0): CameraPose => ({
  position: new THREE.Vector3(x, y, z),
  target: new THREE.Vector3(0, 0, tz),
});

/** The pose a mode flies to for the given side to move, or null to keep the camera where it is. */
export function cameraPose(mode: CameraMode, turn: Color): CameraPose | null {
  switch (mode) {
    case 'auto':
      return turn === 'w' ? pose(0, 11.2, 8.4, 0.5) : pose(0, 11.2, -8.4, -0.5);
    case 'top':
      // A hair toward white so white sits at the bottom of the screen.
      return pose(0, 15.5, 0.01);
    case 'side':
      return pose(12.5, 5.2, 0);
    case 'corner':
      return pose(8.6, 9.4, 8.6);
    case 'orbit':
      return pose(0, 7.5, 12.5);
    case 'free':
      return null;
  }
}

/** Whether the camera follows the side to move after every turn. */
export function followsTurn(mode: CameraMode): boolean {
  return mode === 'auto';
}

export function nextCameraMode(mode: CameraMode): CameraMode {
  return CAMERA_MODES[(CAMERA_MODES.indexOf(mode) + 1) % CAMERA_MODES.length];
}

/** A saved mode name, or auto when it is missing or unknown. */
export function readCameraMode(saved: string | null): CameraMode {
  return (CAMERA_MODES as readonly string[]).includes(saved ?? '') ? (saved as CameraMode) : 'auto';
}
