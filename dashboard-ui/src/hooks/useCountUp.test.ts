import { afterEach, describe, expect, it } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';

import {
  MAX_STAGGER_CARDS,
  MOTION_COUNT_UP,
  MOTION_MICRO,
  MOTION_PAGE,
  STAGGER_CARD,
  cardStaggerDelay,
  cardStaggerStyle,
  motionEase,
  prefersReducedMotion,
} from '../lib/motion';
import {
  createCountUpAnimator,
  formatCountValue,
  startCountUp,
  useCountUp,
  type UseCountUpOptions,
} from './useCountUp';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function stubWindow(matches: boolean): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      matchMedia: (query: string) => ({
        matches,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    },
  });
}

function clearWindow(): void {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else delete (globalThis as { window?: unknown }).window;
}

/** Deterministic rAF harness: frames only run when `advance` is called. */
function createFrameHarness() {
  let time = 0;
  let nextHandle = 1;
  let requests = 0;
  const pending = new Map<number, (timestamp: number) => void>();

  return {
    now: () => time,
    requestFrame: (callback: (timestamp: number) => void) => {
      requests += 1;
      const handle = nextHandle;
      nextHandle += 1;
      pending.set(handle, callback);
      return handle;
    },
    cancelFrame: (handle: number) => {
      pending.delete(handle);
    },
    advance(milliseconds: number) {
      time += milliseconds;
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback(time);
    },
    pendingCount: () => pending.size,
    requestCount: () => requests,
  };
}

function Probe({ target, options }: { target: number; options?: UseCountUpOptions }) {
  return React.createElement('span', null, useCountUp(target, options));
}

afterEach(() => {
  clearWindow();
});

describe('useCountUp', () => {
  it('animates to the new target value over 600ms', () => {
    const frames = createFrameHarness();
    const values: number[] = [];
    const animator = createCountUpAnimator({
      from: 0,
      to: 100,
      onFrame: (value) => values.push(value),
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: frames.now,
    });

    expect(MOTION_COUNT_UP).toBe(600);
    expect(animator.done).toBe(false);
    expect(values).toHaveLength(0);

    frames.advance(300);
    expect(values.length).toBeGreaterThan(0);
    expect(values[values.length - 1]).toBeGreaterThan(0);
    expect(values[values.length - 1]).toBeLessThan(100);

    frames.advance(300);
    expect(values[values.length - 1]).toBe(100);
    expect(animator.done).toBe(true);
    expect(frames.pendingCount()).toBe(0);
  });

  it('settles immediately when prefers-reduced-motion is true', () => {
    stubWindow(true);
    expect(prefersReducedMotion()).toBe(true);

    const frames = createFrameHarness();
    const values: number[] = [];
    const animator = startCountUp({
      from: 0,
      to: 42,
      onFrame: (value) => values.push(value),
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: frames.now,
    });

    expect(animator).toBeNull();
    expect(values).toEqual([42]);
    expect(frames.requestCount()).toBe(0);
  });

  it('renders the formatted target immediately under reduced motion', () => {
    stubWindow(true);
    const html = renderToString(React.createElement(Probe, { target: 1234.5, options: { decimals: 2 } }));
    expect(html).toContain('1,234.50');
  });

  it('starts from zero on mount when motion is allowed (effect runs later)', () => {
    stubWindow(false);
    const html = renderToString(React.createElement(Probe, { target: 1234 }));
    expect(html).toBe('<span>0</span>');
  });

  it('cancels the animation loop on unmount', () => {
    const frames = createFrameHarness();
    const values: number[] = [];
    const animator = createCountUpAnimator({
      from: 0,
      to: 100,
      onFrame: (value) => values.push(value),
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: frames.now,
    });

    frames.advance(120);
    const seen = values.length;
    expect(seen).toBeGreaterThan(0);
    expect(frames.pendingCount()).toBe(1);

    // This is what the hook's effect cleanup does on unmount/target change.
    animator.cancel();

    expect(animator.cancelled).toBe(true);
    expect(frames.pendingCount()).toBe(0);
    frames.advance(1000);
    expect(values).toHaveLength(seen);
    expect(values[values.length - 1]).toBeLessThan(100);
  });

  it('cancels a loop that was already replaced by a new target', () => {
    const frames = createFrameHarness();
    const firstValues: number[] = [];
    const secondValues: number[] = [];

    const first = createCountUpAnimator({
      from: 0,
      to: 100,
      onFrame: (value) => firstValues.push(value),
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: frames.now,
    });
    frames.advance(100);
    first.cancel();

    const second = createCountUpAnimator({
      from: firstValues[firstValues.length - 1],
      to: 250,
      onFrame: (value) => secondValues.push(value),
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      now: frames.now,
    });

    frames.advance(300);
    frames.advance(400);

    expect(second.done).toBe(true);
    expect(secondValues[secondValues.length - 1]).toBe(250);
    // The cancelled loop never emitted again.
    expect(firstValues[firstValues.length - 1]).toBeLessThan(100);
  });
});

describe('count-up formatting', () => {
  it('uses Indian grouping for whole numbers', () => {
    expect(formatCountValue(1234567)).toBe('12,34,567');
  });

  it('keeps fractional values clean with fixed decimals', () => {
    expect(formatCountValue(1234.5)).toBe('1,234.50');
    expect(formatCountValue(1234.567, { decimals: 1 })).toBe('1,234.6');
  });

  it('formats currencies with the en-IN locale', () => {
    const formatted = formatCountValue(1234, { currency: 'INR', decimals: 0 });
    expect(formatted).toContain('1,234');
    expect(formatted).toContain('\u20b9');
  });

  it('supports prefix and suffix text', () => {
    expect(formatCountValue(12.5, { decimals: 1, suffix: '%' })).toBe('12.5%');
    expect(formatCountValue(99, { prefix: '~' })).toBe('~99');
  });
});

describe('motion tokens and helpers', () => {
  it('exposes the spec durations', () => {
    expect(MOTION_MICRO).toBe(120);
    expect(MOTION_PAGE).toBe(240);
    expect(MOTION_COUNT_UP).toBe(600);
    expect(STAGGER_CARD).toBe(40);
    expect(MAX_STAGGER_CARDS).toBe(12);
  });

  it('caps the card stagger at 12 cards', () => {
    expect(cardStaggerDelay(0)).toBe(0);
    expect(cardStaggerDelay(3)).toBe(120);
    expect(cardStaggerDelay(12)).toBe(480);
    expect(cardStaggerDelay(50)).toBe(480);
    expect(cardStaggerDelay(-4)).toBe(0);
    expect(cardStaggerStyle(2)).toEqual({ animationDelay: '80ms' });
  });

  it('eases from 0 to 1 monotonically', () => {
    expect(motionEase(0)).toBe(0);
    expect(motionEase(1)).toBe(1);
    let previous = 0;
    for (let step = 1; step <= 20; step += 1) {
      const value = motionEase(step / 20);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('detects prefers-reduced-motion defensively', () => {
    stubWindow(false);
    expect(prefersReducedMotion()).toBe(false);
    stubWindow(true);
    expect(prefersReducedMotion()).toBe(true);
    clearWindow();
    expect(prefersReducedMotion()).toBe(false);
  });
});
