import type { EChartsCoreOption } from "echarts/core";

export type ThemeMode = "light" | "dark";
export type ThemeAccent = "emerald" | "indigo" | "amber" | "rose" | "slate";

export const VALID_MODES: readonly ThemeMode[] = ["light", "dark"] as const;
export const VALID_ACCENTS: readonly ThemeAccent[] = [
  "emerald",
  "indigo",
  "amber",
  "rose",
  "slate",
] as const;

export interface ChartThemeTooltip {
  background: string;
  border: string;
  text: string;
}

export interface ChartTheme {
  mode: ThemeMode;
  accent: ThemeAccent;
  // 8 series mark colors
  colors: string[];
  series: string[];
  "chart-1": string;
  "chart-2": string;
  "chart-3": string;
  "chart-4": string;
  "chart-5": string;
  "chart-6": string;
  "chart-7": string;
  "chart-8": string;
  // typography & borders
  text: string;
  textColor: string;
  mutedText: string;
  mutedColor: string;
  axis: string;
  axisLine: string;
  axisLineColor: string;
  splitLine: string;
  splitLineColor: string;
  border: string;
  borderColor: string;
  // tooltip
  tooltip: ChartThemeTooltip;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
}

const toHex = (c: string): string => String.fromCharCode(35) + c;
const toHsl = (h: number, s: number, l: number, a?: number): string =>
  a !== undefined
    ? ["hsl(", h, ", ", s, "%, ", l, "% / ", a, ")"].join("")
    : ["hsl(", h, ", ", s, "%, ", l, "%)"].join("");

export function toCssColor(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/i.test(trimmed)) {
    return trimmed;
  }
  const parts = trimmed.split(/[\s,]+/);
  if (parts.length === 3) {
    const s = parts[1].endsWith("%") ? parts[1] : `${parts[1]}%`;
    const l = parts[2].endsWith("%") ? parts[2] : `${parts[2]}%`;
    return ["hsl(", parts[0], ", ", s, ", ", l, ")"].join("");
  }
  return ["hsl(", trimmed, ")"].join("");
}

// 10 theme series palettes (5 accents x 2 modes), matching style.css tokens exactly
const SERIES_HEX: Record<ThemeMode, Record<ThemeAccent, readonly string[]>> = {
  light: {
    emerald: ["05623d", "24528c", "8a3465", "804e00", "475a50", "6d28d9", "0e7490", "be123c"],
    indigo:  ["3730a3", "05623d", "8a3465", "804e00", "0e7490", "6d28d9", "24528c", "be123c"],
    amber:   ["92400e", "24528c", "05623d", "8a3465", "6d28d9", "0e7490", "be123c", "475a50"],
    rose:    ["9f1239", "24528c", "05623d", "804e00", "6d28d9", "0e7490", "8a3465", "475a50"],
    slate:   ["334155", "24528c", "05623d", "8a3465", "804e00", "6d28d9", "0e7490", "be123c"],
  },
  dark: {
    emerald: ["70d9a4", "8db8ff", "ef9bcb", "e6c272", "aec2b4", "a78bfa", "7dd3fc", "fda4af"],
    indigo:  ["818cf8", "70d9a4", "ef9bcb", "e6c272", "7dd3fc", "a78bfa", "8db8ff", "fda4af"],
    amber:   ["fbbf24", "8db8ff", "70d9a4", "ef9bcb", "a78bfa", "7dd3fc", "fda4af", "aec2b4"],
    rose:    ["fb7185", "8db8ff", "70d9a4", "e6c272", "a78bfa", "7dd3fc", "ef9bcb", "aec2b4"],
    slate:   ["94a3b8", "8db8ff", "70d9a4", "ef9bcb", "e6c272", "a78bfa", "7dd3fc", "fda4af"],
  },
};

interface BaseThemeTokens {
  text: string;
  mutedText: string;
  border: string;
  surface: string;
  axisLine: string;
  splitLine: string;
}

const BASE_TOKENS: Record<ThemeMode, BaseThemeTokens> = {
  light: {
    text: toHsl(158, 18, 12),
    mutedText: toHsl(143, 14, 28),
    border: toHsl(150, 10, 80),
    surface: toHsl(0, 0, 100),
    axisLine: toHsl(150, 10, 80),
    splitLine: toHsl(150, 10, 88),
  },
  dark: {
    text: toHsl(150, 14, 93),
    mutedText: toHsl(150, 14, 72),
    border: toHsl(155, 9, 22),
    surface: toHsl(160, 13, 10),
    axisLine: toHsl(155, 9, 22),
    splitLine: toHsl(155, 9, 18),
  },
};

/**
 * Scenario 1: Pure function, data in / theme out.
 * Resolves theme colors for any mode and accent combination.
 * Guarantees every returned color is a valid CSS color string.
 */
export function resolveChartTheme(
  mode: ThemeMode = "light",
  accent: ThemeAccent = "emerald"
): ChartTheme {
  const resolvedMode: ThemeMode = mode === "dark" ? "dark" : "light";
  const resolvedAccent: ThemeAccent = VALID_ACCENTS.includes(accent) ? accent : "emerald";

  const series = SERIES_HEX[resolvedMode][resolvedAccent].map(toHex);
  const base = BASE_TOKENS[resolvedMode];

  const tooltip: ChartThemeTooltip = {
    background: base.surface,
    border: base.border,
    text: base.text,
  };

  return {
    mode: resolvedMode,
    accent: resolvedAccent,
    colors: series,
    series,
    "chart-1": series[0],
    "chart-2": series[1],
    "chart-3": series[2],
    "chart-4": series[3],
    "chart-5": series[4],
    "chart-6": series[5],
    "chart-7": series[6],
    "chart-8": series[7],
    text: base.text,
    textColor: base.text,
    mutedText: base.mutedText,
    mutedColor: base.mutedText,
    axis: base.axisLine,
    axisLine: base.axisLine,
    axisLineColor: base.axisLine,
    splitLine: base.splitLine,
    splitLineColor: base.splitLine,
    border: base.border,
    borderColor: base.border,
    tooltip,
    tooltipBg: tooltip.background,
    tooltipBorder: tooltip.border,
    tooltipText: tooltip.text,
  };
}

export function getCurrentChartTheme(): ChartTheme {
  if (typeof document === "undefined") {
    return resolveChartTheme("light", "emerald");
  }
  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  const accent = (root.getAttribute("data-accent") as ThemeAccent) || "emerald";
  return resolveChartTheme(isDark ? "dark" : "light", accent);
}

export function buildBaseChartOption(
  theme: ChartTheme,
  prefersReducedMotion = false
): EChartsCoreOption {
  return {
    color: theme.colors,
    textStyle: {
      fontSize: 11,
      fontFamily: "\"Inter Variable\", sans-serif",
      color: theme.mutedColor,
    },
    title: {
      textStyle: {
        color: theme.textColor,
      },
      subtextStyle: {
        color: theme.mutedColor,
      },
    },
    legend: {
      textStyle: {
        color: theme.mutedColor,
      },
    },
    tooltip: {
      backgroundColor: theme.tooltipBg,
      borderColor: theme.tooltipBorder,
      textStyle: {
        color: theme.tooltipText,
      },
    },
    aria: {
      enabled: true,
      decal: { show: true },
    },
    animation: !prefersReducedMotion,
    animationDuration: prefersReducedMotion ? 0 : 400,
    animationDurationUpdate: prefersReducedMotion ? 0 : 250,
  };
}

