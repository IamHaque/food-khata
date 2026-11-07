// S-025 motion system (D-10).
//
// One source of truth for the dashboard motion tokens plus the helpers that
// page, card, micro-interaction and count-up animation share. UI animation is
// restricted to `transform` and `opacity` so every effect stays on the
// compositor; the matching CSS utilities live in `src/style.css`.

/** Micro-interactions: hover lift, press compression, chip fades. */
export const MOTION_MICRO = 120;

/** Page transitions and card reveals. */
export const MOTION_PAGE = 240;

/** KPI count-up (and chart entry) duration. */
export const MOTION_COUNT_UP = 600;

/** Delay between cards in a reveal group. */
export const STAGGER_CARD = 40;

/** Number of cards that receive a stagger delay; later cards share the cap. */
export const MAX_STAGGER_CARDS = 12;

/** Page crossfade slides content by 8px. */
export const MOTION_PAGE_SHIFT_PX = 8;

/** Hover lift distance in pixels. */
export const MOTION_HOVER_LIFT_PX = 2;

/** Press compression scale. */
export const MOTION_PRESS_SCALE = 0.98;

/** Shared easing curve from the design tokens (D-10). */
export const MOTION_EASE_CSS = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/**
 * CSS class names defined in `src/style.css`. Import these instead of writing
 * the class strings by hand so a rename stays in one place.
 */
export const MOTION = {
  /** Page container: combine with `motion-page-enter` for route changes. */
  page: "motion-page",
  pageEnter: "motion-page-enter",
  pageExit: "motion-page-exit",
  /** Card reveal animation; pair with `cardStaggerStyle(index)`. */
  cardReveal: "motion-card-reveal",
  /** Card hover lift of 2px. */
  lift: "motion-lift",
  /** Button/link press compression. */
  press: "motion-press",
  /** Base chip fade transition. */
  chip: "motion-chip",
  chipIn: "motion-chip-in",
  chipOut: "motion-chip-out",
  /** Shimmer overlay for loading skeletons. */
  skeleton: "motion-skeleton",
  /** Tabular numerals for animated values (no layout shift). */
  count: "motion-count",
} as const;

/**
 * Tailwind equivalents for the same micro-interactions. Useful on components
 * that are already Tailwind-driven. Both forms animate only `transform`.
 */
export const MOTION_TW = {
  hoverLift: "hover:-translate-y-0.5",
  press: "active:scale-[0.98]",
  chipFade: "transition-opacity duration-micro ease-custom",
  count: "tabular-nums",
} as const;

/** Clamp a card index into the stagger window (0..MAX_STAGGER_CARDS). */
export function clampStaggerIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), MAX_STAGGER_CARDS);
}

/**
 * Stagger delay for the card at `index`, in milliseconds.
 * Matches the spec: `min(index, 12) * 40ms`.
 */
export function cardStaggerDelay(index: number): number {
  return clampStaggerIndex(index) * STAGGER_CARD;
}

/** Inline style for a staggered card reveal. Composite-only by design. */
export function cardStaggerStyle(index: number): { animationDelay: string } {
  return { animationDelay: `${cardStaggerDelay(index)}ms` };
}

/**
 * Whether the user asked for reduced motion.
 *
 * SSR-safe: returns false when there is no `window` (the hook renders the
 * final value server-side instead of animating).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  const matchMedia = window.matchMedia;
  if (typeof matchMedia !== "function") return false;
  return matchMedia.call(window, "(prefers-reduced-motion: reduce)").matches;
}

function sampleCurve(a: number, b: number, t: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t * a + 3 * mt * t * t * b + t * t * t;
}

function sampleDerivative(a: number, b: number, t: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * a + 6 * mt * t * (b - a) + 3 * t * t * (1 - b);
}

/**
 * Build a CSS-compatible cubic-bezier easing function.
 *
 * Solves x(t) for the requested progress, then returns y(t). Used by the
 * count-up hook so rAF values follow the same curve as CSS transitions.
 */
export function cubicBezierEasing(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (progress: number) => number {
  const solveT = (x: number): number => {
    let t = x;
    // Newton-Raphson is fast near the middle of the curve.
    for (let i = 0; i < 8; i += 1) {
      const error = sampleCurve(x1, x2, t) - x;
      if (Math.abs(error) < 1e-6) return t;
      const slope = sampleDerivative(x1, x2, t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    // Fall back to bisection for flat or out-of-range slopes.
    let low = 0;
    let high = 1;
    t = Math.min(Math.max(x, 0), 1);
    for (let i = 0; i < 24; i += 1) {
      const value = sampleCurve(x1, x2, t);
      if (Math.abs(value - x) < 1e-6) break;
      if (value < x) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return t;
  };

  return (progress: number): number => {
    if (!Number.isFinite(progress) || progress <= 0) return 0;
    if (progress >= 1) return 1;
    return sampleCurve(y1, y2, solveT(progress));
  };
}

/** The D-10 easing, evaluated in JavaScript for rAF-driven animation. */
export const motionEase = cubicBezierEasing(0.2, 0.8, 0.2, 1);
