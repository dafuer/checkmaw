import * as THREE from 'three';

/** Deterministic PRNG so textures look identical on every load. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function drawVeins(ctx: CanvasRenderingContext2D, size: number, rand: () => number, color: string, count: number, width: number): void {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    let x = rand() * size;
    let y = rand() * size;
    let angle = rand() * Math.PI * 2;
    ctx.lineWidth = width * (0.3 + rand());
    ctx.globalAlpha = 0.15 + rand() * 0.35;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 30 + Math.floor(rand() * 60);
    for (let s = 0; s < steps; s++) {
      angle += (rand() - 0.5) * 0.7;
      x += Math.cos(angle) * size * 0.012;
      y += Math.sin(angle) * size * 0.012;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Whole-board texture: veined ivory marble and obsidian squares in one map. */
export function boardTexture(): { map: THREE.CanvasTexture; roughness: THREE.CanvasTexture } {
  const size = 2048;
  const cell = size / 8;
  const [c, ctx] = canvas(size);
  const [rc, rctx] = canvas(size);
  const rand = rng(1337);
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const light = (f + r) % 2 === 0;
      const x = f * cell;
      const y = r * cell;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cell, cell);
      ctx.clip();
      const g = ctx.createLinearGradient(x, y, x + cell, y + cell);
      if (light) {
        g.addColorStop(0, '#e9dfcc');
        g.addColorStop(1, '#cfc1a6');
      } else {
        g.addColorStop(0, '#1c1824');
        g.addColorStop(1, '#0d0b12');
      }
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cell, cell);
      ctx.translate(x, y);
      drawVeins(ctx, cell, rand, light ? '#8a7a66' : '#6b4cff', 7, cell * 0.012);
      drawVeins(ctx, cell, rand, light ? '#fff8ec' : '#2c2540', 5, cell * 0.02);
      ctx.restore();
      rctx.fillStyle = light ? '#555' : '#3a3a3a';
      rctx.fillRect(x, y, cell, cell);
    }
  }
  // Fine bevel lines between squares.
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  return { map: toTexture(c), roughness: toTexture(rc, false) };
}

/** Dark frame with gold coordinates (a–h, 1–8). */
export function frameTexture(): THREE.CanvasTexture {
  const size = 2048;
  const [c, ctx] = canvas(size);
  const rand = rng(7);
  ctx.fillStyle = '#120f17';
  ctx.fillRect(0, 0, size, size);
  drawVeins(ctx, size, rand, '#3b2a55', 60, 4);
  const border = size * (0.6 / 9.2);
  const inner = size - border * 2;
  const cell = inner / 8;
  ctx.fillStyle = '#d6a64a';
  ctx.font = `600 ${Math.round(border * 0.5)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const files = 'abcdefgh';
  for (let i = 0; i < 8; i++) {
    const p = border + cell * (i + 0.5);
    ctx.fillText(files[i], p, size - border / 2);
    ctx.fillText(String(8 - i), border / 2, p);
    ctx.save();
    ctx.translate(p, border / 2);
    ctx.rotate(Math.PI);
    ctx.fillText(files[i], 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(size - border / 2, p);
    ctx.rotate(Math.PI);
    ctx.fillText(String(8 - i), 0, 0);
    ctx.restore();
  }
  ctx.strokeStyle = '#d6a64a';
  ctx.lineWidth = 6;
  ctx.strokeRect(border - 10, border - 10, inner + 20, inner + 20);
  ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, size - 28, size - 28);
  return toTexture(c);
}

/** Glowing rune circle used as an emissive map on the arena floor. */
export function runeCircleTexture(): THREE.CanvasTexture {
  const size = 2048;
  const [c, ctx] = canvas(size);
  const rand = rng(99);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = '#ff5a1f';
  ctx.fillStyle = '#ff5a1f';
  const rings = [0.92, 0.86, 0.62];
  for (const r of rings) {
    ctx.lineWidth = r === 0.86 ? 4 : 8;
    ctx.beginPath();
    ctx.arc(0, 0, (size / 2) * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  const glyphs = 72;
  for (let i = 0; i < glyphs; i++) {
    ctx.save();
    ctx.rotate((i / glyphs) * Math.PI * 2);
    ctx.translate(0, -(size / 2) * 0.89);
    ctx.lineWidth = 5;
    ctx.beginPath();
    const strokes = 2 + Math.floor(rand() * 3);
    for (let s = 0; s < strokes; s++) {
      ctx.moveTo((rand() - 0.5) * 30, (rand() - 0.5) * 30);
      ctx.lineTo((rand() - 0.5) * 30, (rand() - 0.5) * 30);
    }
    ctx.stroke();
    ctx.restore();
  }
  // Pentagram-like star between the rings.
  ctx.lineWidth = 5;
  ctx.beginPath();
  const R = (size / 2) * 0.62;
  for (let i = 0; i <= 7; i++) {
    const a = (i * 3 * Math.PI * 2) / 7 - Math.PI / 2;
    const x = Math.cos(a) * R;
    const y = Math.sin(a) * R;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  return toTexture(c);
}

/** Rough stone floor colour map. */
export function stoneTexture(seed: number, base: string, speck: string): THREE.CanvasTexture {
  const size = 1024;
  const [c, ctx] = canvas(size);
  const rand = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = speck;
    ctx.globalAlpha = rand() * 0.25;
    const s = rand() * 6;
    ctx.fillRect(rand() * size, rand() * size, s, s);
  }
  ctx.globalAlpha = 1;
  drawVeins(ctx, size, rand, '#000', 40, 3);
  const tex = toTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Soft round sprite for particles and glows. */
export function glowSprite(): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTexture(c);
}
