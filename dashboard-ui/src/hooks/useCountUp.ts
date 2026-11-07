import { useEffect, useMemo, useRef, useState } from "react";

import { MOTION_COUNT_UP, motionEase, prefersReducedMotion } from "../lib/motion";

/** Formatting applied to the animated number. */
export interface CountUpFormatOptions {
  /** BCP-47 locale. Defaults to `en-IN` so grouping matches the INR dashboard. */
  locale?: string;
  /** Fixed fraction digits. Defaults to 0 for integers and 2 for fractions. */
  decimals?: number;
  /** ISO 4217 code (e.g. `INR`). Uses `Intl` currency formatting. */
  currency?: string;
  /** Text placed before the number. */
  prefix?: string;
  /** Text placed after the number. */
  suffix?: string;
  /** Full formatting override; wins over the other options. */
  format?: (value: number) => string;
}

export interface UseCountUpOptions extends CountUpFormatOptions {
  /** Animation length in milliseconds. Defaults to the 600ms chart token. */
  duration?: number;
  /** Value to start from on first mount. Defaults to 0. */
  from?: number;
  /** Override the media query (tests and explicit reduced-motion screens). */
  reducedMotion?: boolean;
}

type FrameCallback = (time: number) => void;

export interface CountUpAnimatorOptions {
  from: number;
  to: number;
  /** Duration in milliseconds. */
  duration?: number;
  /** Easing curve, defaults to the D-10 motion curve. */
  ease?: (progress: number) => number;
  onFrame: (value: number) => void;
  onComplete?: (value: number) => void;
  /** Injectable rAF (tests). */
  requestFrame?: (callback: FrameCallback) => number;
  /** Injectable cancelAnimationFrame (tests). */
  cancelFrame?: (handle: number) => void;
  /** Injectable clock (tests). */
  now?: () => number;
}

export interface CountUpAnimator {
  /** Stop the loop and release the pending frame. Safe to call repeatedly. */
  cancel: () => void;
  readonly cancelled: boolean;
  readonly done: boolean;
}

export interface StartCountUpOptions extends CountUpAnimatorOptions {
  /** Defaults to `prefersReducedMotion()`. */
  reducedMotion?: boolean;
}

function defaultNow(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function defaultRequestFrame(callback: FrameCallback): number {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }
  return 0;
}

function defaultCancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(handle);
  }
}

/**
 * Animate a number with `requestAnimationFrame`.
 *
 * The final frame always emits the exact target so rounding never leaves a
 * value like `99.999`. Call `cancel()` from an effect cleanup to stop on
 * unmount or when the target changes.
 */
export function createCountUpAnimator(options: CountUpAnimatorOptions): CountUpAnimator {
  const {
    from,
    to,
    duration = MOTION_COUNT_UP,
    ease = motionEase,
    onFrame,
    onComplete,
    requestFrame = defaultRequestFrame,
    cancelFrame = defaultCancelFrame,
    now = defaultNow,
  } = options;

  let handle = 0;
  let cancelled = false;
  let done = false;

  const finish = (): void => {
    if (cancelled || done) return;
    done = true;
    onFrame(to);
    onComplete?.(to);
  };

  const total = Number.isFinite(duration) ? Math.max(0, duration) : MOTION_COUNT_UP;
  const canAnimate = Number.isFinite(from) && Number.isFinite(to) && from !== to && total > 0;

  if (!canAnimate) {
    finish();
  } else {
    const startedAt = now();
    const delta = to - from;

    const tick: FrameCallback = () => {
      if (cancelled || done) return;
      const elapsed = now() - startedAt;
      const progress = elapsed / total;
      if (progress >= 1) {
        finish();
        return;
      }
      const eased = ease(Math.max(0, progress));
      onFrame(from + delta * eased);
      handle = requestFrame(tick);
    };

    handle = requestFrame(tick);
  }

  return {
    cancel(): void {
      if (cancelled) return;
      cancelled = true;
      done = false;
      if (handle) {
        cancelFrame(handle);
        handle = 0;
      }
    },
    get cancelled(): boolean {
      return cancelled;
    },
    get done(): boolean {
      return done;
    },
  };
}

/**
 * Start a count-up, or settle immediately under `prefers-reduced-motion`.
 * Returns `null` when no animation loop was created.
 */
export function startCountUp(options: StartCountUpOptions): CountUpAnimator | null {
  const reducedMotion = options.reducedMotion ?? prefersReducedMotion();
  if (reducedMotion) {
    options.onFrame(options.to);
    options.onComplete?.(options.to);
    return null;
  }
  return createCountUpAnimator(options);
}

/**
 * Build a reusable number formatter. Intl grouping and currency formatting
 * keep commas (including Indian lakh grouping) and symbols correct.
 */
export function createCountFormatter(options: CountUpFormatOptions = {}): (value: number) => string {
  const prefix = options.prefix ?? "";
  const suffix = options.suffix ?? "";
  const custom = options.format;
  const decimals = options.decimals ?? 0;
  const intl = custom
    ? null
    : new Intl.NumberFormat(options.locale ?? "en-IN", {
        ...(options.currency ? { style: "currency" as const, currency: options.currency } : {}),
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return (value: number): string => {
    const safe = Number.isFinite(value) ? value : 0;
    if (custom) return `${prefix}${custom(safe)}${suffix}`;
    return `${prefix}${(intl as Intl.NumberFormat).format(safe)}${suffix}`;
  };
}

/** One-shot formatting helper (integers get no decimals, fractions get two). */
export function formatCountValue(value: number, options: CountUpFormatOptions = {}): string {
  const safe = Number.isFinite(value) ? value : 0;
  const decimals = options.decimals ?? (Number.isInteger(safe) ? 0 : 2);
  return createCountFormatter({ ...options, decimals })(safe);
}

/**
 * Count a KPI value up to `target` over 600ms and return the formatted string.
 *
 * - Respects `prefers-reduced-motion`: the target is returned immediately and
 *   no animation frame is scheduled.
 * - Cancels the active loop when the target changes or the component unmounts.
 * - Formatting is stable for the whole animation (fixed fraction digits) and
 *   pairs with tabular numerals (`MOTION.count`) so width never shifts.
 */
export function useCountUp(target: number, options: UseCountUpOptions = {}): string {
  const {
    duration = MOTION_COUNT_UP,
    from,
    reducedMotion,
    locale,
    decimals,
    currency,
    prefix,
    suffix,
    format,
  } = options;

  const safeTarget = Number.isFinite(target) ? target : 0;
  const resolvedDecimals = decimals ?? (Number.isInteger(safeTarget) ? 0 : 2);
  const settleImmediately = reducedMotion ?? prefersReducedMotion();

  const [value, setValue] = useState(() => {
    if (settleImmediately || typeof window === "undefined") return safeTarget;
    return from ?? 0;
  });
  const valueRef = useRef(value);
  valueRef.current = value;

  const formatter = useMemo(
    () =>
      createCountFormatter({
        locale,
        decimals: resolvedDecimals,
        currency,
        prefix,
        suffix,
        format,
      }),
    [locale, resolvedDecimals, currency, prefix, suffix, format],
  );

  useEffect(() => {
    if (settleImmediately) {
      valueRef.current = safeTarget;
      setValue(safeTarget);
      return;
    }

    const startValue = valueRef.current;
    if (startValue === safeTarget) return;

    const animator = startCountUp({
      from: startValue,
      to: safeTarget,
      duration,
      reducedMotion: false,
      onFrame: (next) => {
        valueRef.current = next;
        setValue(next);
      },
    });

    return () => animator?.cancel();
  }, [safeTarget, duration, settleImmediately]);

  return formatter(value);
}
