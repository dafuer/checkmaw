import { describe, expect, it } from 'vitest';
import { Animator, ease } from '../../src/rendering/animation/animator';

describe('Animator', () => {
  it('drives a tween to completion and resolves', async () => {
    const animator = new Animator();
    const values: number[] = [];
    let done = false;
    const p = animator.tween(1, (t) => values.push(t), ease.linear).then(() => (done = true));
    animator.update(0.5);
    animator.update(0.6);
    await p;
    expect(done).toBe(true);
    expect(values[0]).toBe(0);
    expect(values[1]).toBeCloseTo(0.5);
    expect(values.at(-1)).toBe(1);
  });

  it('scales time with speed', async () => {
    const animator = new Animator();
    animator.speed = 4;
    let last = 0;
    const p = animator.tween(2, (t) => (last = t), ease.linear);
    animator.update(0.5);
    await p;
    expect(last).toBe(1);
  });

  it('runs tickers until they return true', () => {
    const animator = new Animator();
    let calls = 0;
    animator.every(() => ++calls >= 2);
    animator.update(0.1);
    animator.update(0.1);
    animator.update(0.1);
    expect(calls).toBe(2);
  });

  it('keeps easing endpoints fixed', () => {
    for (const fn of Object.values(ease)) {
      expect(fn(0)).toBeCloseTo(0);
      expect(fn(1)).toBeCloseTo(1);
    }
  });
});

describe('Animator time warp', () => {
  it('slows every tween for a stretch of real time, then returns to normal', () => {
    const animator = new Animator();
    let value = 0;
    void animator.tween(1, (t) => (value = t), ease.linear);
    animator.warpTime(0.1, 0.2);
    expect(animator.scale).toBeCloseTo(0.1);
    animator.update(0.1);
    expect(value).toBeCloseTo(0.01);
    animator.update(0.1);
    expect(value).toBeCloseTo(0.02);
    expect(animator.scale).toBe(1);
    animator.update(0.1);
    expect(value).toBeCloseTo(0.12);
  });

  it('ends a warp sooner while the player fast-forwards', () => {
    const animator = new Animator();
    animator.speed = 4;
    animator.warpTime(0.5, 0.4);
    expect(animator.scale).toBe(2);
    animator.update(0.1);
    expect(animator.scale).toBe(4);
  });

  it('reports what is still running', async () => {
    const animator = new Animator();
    const done = animator.tween(0.1, () => {});
    const stop = animator.every(() => false);
    expect(animator.pending).toEqual({ tweens: 1, tickers: 1 });
    animator.update(0.2);
    await done;
    stop();
    expect(animator.pending).toEqual({ tweens: 0, tickers: 0 });
  });
});
