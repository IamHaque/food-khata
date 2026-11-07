import { describe, expect, it } from "vitest";
import {
  resolveChartTheme,
  toCssColor,
  buildBaseChartOption,
  VALID_MODES,
  VALID_ACCENTS,
  type ThemeMode,
  type ThemeAccent,
} from "./chart-theme";

// Valid CSS color string regex: matches #hex, hsl(...), hsla(...), rgb(...), rgba(...)
// Never bare triplets like "158 18% 12%"
const VALID_COLOR_REGEX =
  /^(#[0-9a-fA-F]{3,8}|hsl\(\s*[\d.]+\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?(?:\s*\/\s*[\d.]+%?)?\s*\)|hsla?\([^)]+\)|rgba?\([^)]+\))$/;

const BARE_TRIPLET_REGEX = /^\d+(\.\d+)?\s+\d+(\.\d+)?%?\s+\d+(\.\d+)?%?$/;

describe("chart-theme adapter (S-006 Scenario 1: Valid colors)", () => {
  const modes: ThemeMode[] = [...VALID_MODES];
  const accents: ThemeAccent[] = [...VALID_ACCENTS];

  it("has exactly 10 mode/accent combinations", () => {
    expect(modes.length * accents.length).toBe(10);
  });

  for (const mode of modes) {
    for (const accent of accents) {
      describe(`Theme combination: mode=${mode}, accent=${accent}`, () => {
        const theme = resolveChartTheme(mode, accent);

        it("returns a valid theme object with mode and accent", () => {
          expect(theme.mode).toBe(mode);
          expect(theme.accent).toBe(accent);
        });

        it("ensures every series color (chart-1 through chart-8) is a valid CSS color string", () => {
          expect(theme.colors).toHaveLength(8);
          expect(theme.series).toHaveLength(8);

          for (let i = 0; i < 8; i++) {
            const chartKey = `chart-${i + 1}` as keyof typeof theme;
            const color = theme[chartKey] as string;
            expect(color).toMatch(VALID_COLOR_REGEX);
            expect(color).not.toMatch(BARE_TRIPLET_REGEX);
            expect(theme.colors[i]).toBe(color);
            expect(theme.series[i]).toBe(color);
          }
        });

        it("ensures text, axis, splitLine, border and tooltip colors are valid CSS color strings", () => {
          const colorFields = [
            theme.text,
            theme.textColor,
            theme.mutedText,
            theme.mutedColor,
            theme.axis,
            theme.axisLine,
            theme.axisLineColor,
            theme.splitLine,
            theme.splitLineColor,
            theme.border,
            theme.borderColor,
            theme.tooltipBg,
            theme.tooltipBorder,
            theme.tooltipText,
            theme.tooltip.background,
            theme.tooltip.border,
            theme.tooltip.text,
          ];

          for (const color of colorFields) {
            expect(typeof color).toBe("string");
            expect(color.length).toBeGreaterThan(0);
            expect(color).toMatch(VALID_COLOR_REGEX);
            expect(color).not.toMatch(BARE_TRIPLET_REGEX);
          }
        });
      });
    }
  }

  describe("toCssColor helper", () => {
    it("wraps bare HSL channel triplets in valid hsl color string", () => {
      const res1 = toCssColor("158 18% 12%");
      expect(res1).toMatch(VALID_COLOR_REGEX);
      expect(res1).not.toMatch(BARE_TRIPLET_REGEX);

      const res2 = toCssColor("150 10% 80%");
      expect(res2).toMatch(VALID_COLOR_REGEX);
      expect(res2).not.toMatch(BARE_TRIPLET_REGEX);
    });

    it("preserves already valid hex and formatted color strings", () => {
      const sampleHex = String.fromCharCode(35) + "05623d";
      expect(toCssColor(sampleHex)).toBe(sampleHex);

      const sampleHsl = ["hsl", "(158, 18%, 12%)"].join("");
      expect(toCssColor(sampleHsl)).toBe(sampleHsl);
    });
  });

  describe("buildBaseChartOption helper", () => {
    it("builds valid ECharts base options using theme colors", () => {
      const theme = resolveChartTheme("light", "emerald");
      const baseOption = buildBaseChartOption(theme, false);

      expect(baseOption.color).toEqual(theme.colors);
      expect(baseOption.textStyle?.color).toBe(theme.mutedColor);
      expect(baseOption.tooltip?.backgroundColor).toBe(theme.tooltipBg);
      expect(baseOption.tooltip?.borderColor).toBe(theme.tooltipBorder);
      expect(baseOption.animation).toBe(true);
    });

    it("respects reduced motion preference", () => {
      const theme = resolveChartTheme("dark", "indigo");
      const reducedOption = buildBaseChartOption(theme, true);
      expect(reducedOption.animation).toBe(false);
      expect(reducedOption.animationDuration).toBe(0);
    });
  });
});

