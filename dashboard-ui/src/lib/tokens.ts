// D-03 token helpers. All colors come from CSS tokens; no literals here.

/**
 * Resolve a CSS token to a concrete color string.
 * HSL channel triplets are wrapped in `hsl(...)`, literal values are returned as-is.
 * Returns "" when the token is unavailable (SSR).
 */
/** ECharts/zrender cannot parse the space-separated `hsl(h s% l% / a)` syntax (it paints black), so emit commas. */
function hslComma(triplet: string, alpha?: number): string {
  const [h, sat, l] = triplet.split(/[\s,]+/);
  return alpha === undefined ? `hsl(${h}, ${sat}, ${l})` : `hsla(${h}, ${sat}, ${l}, ${alpha})`;
}

export function tokenColor(name: string): string {
  if (typeof window === "undefined") return "";
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!value) return "";
  if (/^(#[0-9a-f]|rgb|hsl)/i.test(value)) return value;
  return hslComma(value);
}

/**
 * Resolve a CSS token as a color with alpha. Requires the token to be an HSL
 * channel triplet; literal values are returned unchanged (alpha not applied).
 * Returns "" when the token is unavailable (SSR).
 */
export function tokenAlpha(name: string, alpha: number): string {
  if (typeof window === "undefined") return "";
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!value) return "";
  if (/^(#[0-9a-f]|rgb|hsl)/i.test(value)) return value;
  return hslComma(value, alpha);
}
