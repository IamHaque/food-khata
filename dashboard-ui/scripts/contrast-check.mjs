#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const styleCssPath = resolve(__dirname, '../src/style.css');

const ACCENTS = ['emerald', 'indigo', 'amber', 'rose', 'slate'];
const MODES = ['light', 'dark'];

// WCAG 2.2 Relative Luminance and Contrast
function srgbLuminance(r, g, b) {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function parseColorToRgb(rawStr) {
  const str = rawStr.trim();
  if (str.startsWith('#')) {
    let hex = str.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split('')
        .slice(0, 3)
        .map((c) => c + c)
        .join('');
    } else if (hex.length >= 6) {
      hex = hex.slice(0, 6);
    }
    const num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  // HSL channel triplet: 'H S% L%' or 'hsl(H S% L%)' or 'hsl(H, S%, L%)'
  const hslMatch = str.match(
    /^(?:hsl\s*\(\s*)?(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?%?)\s*[, ]\s*(\d+(?:\.\d+)?%?)(?:\s*\/\s*[\d.]+%?)?\s*\)?$/i
  );
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]);
    const s = parseFloat(hslMatch[2].replace('%', '')) / 100;
    const l = parseFloat(hslMatch[3].replace('%', '')) / 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

  // RGB: 'rgb(r, g, b)'
  const rgbMatch = str.match(/^rgba?\s*\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1], 10), parseInt(rgbMatch[2], 10), parseInt(rgbMatch[3], 10)];
  }

  throw new Error('Cannot parse color value: ' + rawStr);
}

function contrastRatio(colorA, colorB) {
  const lumA = srgbLuminance(...parseColorToRgb(colorA));
  const lumB = srgbLuminance(...parseColorToRgb(colorB));
  const max = Math.max(lumA, lumB);
  const min = Math.min(lumA, lumB);
  return (max + 0.05) / (min + 0.05);
}

function parseCssRules(cssText) {
  const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];

  function walk(text) {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open === -1) break;

      let prefix = text.slice(i, open).trim();
      const lastSemi = prefix.lastIndexOf(';');
      if (lastSemi !== -1) {
        prefix = prefix.slice(lastSemi + 1).trim();
      }

      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);

      if (prefix.startsWith('@layer') || prefix.startsWith('@media') || prefix.startsWith('@supports')) {
        walk(body);
      } else if (!prefix.startsWith('@')) {
        const decls = {};
        const declRegex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
        let dMatch;
        while ((dMatch = declRegex.exec(body)) !== null) {
          decls[dMatch[1].trim()] = dMatch[2].trim();
        }
        if (Object.keys(decls).length > 0) {
          const selectors = prefix.split(',').map((s) => s.trim().replace(/\s+/g, ' '));
          rules.push({ selectors, decls });
        }
      }
      i = j;
    }
  }

  walk(stripped);
  return rules;
}

function resolveTokensForCombination(rules, mode, accent) {
  const tokens = {};

  // 1. Base tokens from :root
  for (const rule of rules) {
    if (rule.selectors.some((s) => s === ':root' || s.startsWith(':root,'))) {
      Object.assign(tokens, rule.decls);
    }
  }

  if (mode === 'light') {
    // 2. Light mode accent overrides: selectors with [data-accent=""] but NOT .dark
    for (const rule of rules) {
      const matchesAccent = rule.selectors.some(
        (s) => !s.includes('.dark') && s.includes('[data-accent=\"' + accent + '\"]')
      );
      if (matchesAccent) {
        Object.assign(tokens, rule.decls);
      }
    }
  } else {
    // 2. Dark mode base tokens (.dark without data-accent)
    for (const rule of rules) {
      const isDarkBase = rule.selectors.some(
        (s) => s.includes('.dark') && !s.includes('data-accent')
      );
      if (isDarkBase) {
        Object.assign(tokens, rule.decls);
      }
    }

    // 3. Dark mode accent overrides (.dark with [data-accent=""])
    for (const rule of rules) {
      const matchesDarkAccent = rule.selectors.some(
        (s) => s.includes('.dark') && s.includes('[data-accent=\"' + accent + '\"]')
      );
      if (matchesDarkAccent) {
        Object.assign(tokens, rule.decls);
      }
    }
  }

  return tokens;
}

function runContrastCheck() {
  const css = readFileSync(styleCssPath, 'utf8');
  const rules = parseCssRules(css);

  const failures = [];
  let totalEvaluated = 0;

  for (const mode of MODES) {
    for (const accent of ACCENTS) {
      totalEvaluated++;
      const tokens = resolveTokensForCombination(rules, mode, accent);

      const required = ['--foreground', '--background', '--surface'];
      for (let i = 1; i <= 8; i++) required.push('--chart-' + i);

      for (const req of required) {
        if (!tokens[req]) {
          failures.push('[' + mode + ' / ' + accent + '] Missing token ' + req);
        }
      }
      if (failures.length > 0) continue;

      const fg = tokens['--foreground'];
      const bg = tokens['--background'];
      const surface = tokens['--surface'];

      // Text vs surface >= 4.5:1
      const crFgBg = contrastRatio(fg, bg);
      if (crFgBg < 4.5) {
        failures.push(
          '[' + mode + ' / ' + accent + '] --foreground on --background: ' + crFgBg.toFixed(2) + ':1 (minimum 4.5:1)'
        );
      }

      const crFgSurface = contrastRatio(fg, surface);
      if (crFgSurface < 4.5) {
        failures.push(
          '[' + mode + ' / ' + accent + '] --foreground on --surface: ' + crFgSurface.toFixed(2) + ':1 (minimum 4.5:1)'
        );
      }

      // Chart marks vs surface and background >= 3:1
      for (let i = 1; i <= 8; i++) {
        const mark = tokens['--chart-' + i];
        const crMarkSurf = contrastRatio(mark, surface);
        if (crMarkSurf < 3.0) {
          failures.push(
            '[' + mode + ' / ' + accent + '] --chart-' + i + ' (' + mark + ') on --surface: ' + crMarkSurf.toFixed(2) + ':1 (minimum 3:1)'
          );
        }
        const crMarkBg = contrastRatio(mark, bg);
        if (crMarkBg < 3.0) {
          failures.push(
            '[' + mode + ' / ' + accent + '] --chart-' + i + ' (' + mark + ') on --background: ' + crMarkBg.toFixed(2) + ':1 (minimum 3:1)'
          );
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error('contrast-check: FAIL -- ' + failures.length + ' contrast violations found across ' + totalEvaluated + ' combinations:');
    for (const f of failures) {
      console.error('  - ' + f);
    }
    process.exit(1);
  }

  console.log('contrast-check: PASS -- all 10 theme/mode combinations satisfy WCAG 2.2 contrast gates (>=4.5:1 text, >=3:1 charts).');
  process.exit(0);
}

runContrastCheck();