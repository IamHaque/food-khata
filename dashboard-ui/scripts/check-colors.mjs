// Scenario 2 (S-002): no hardcoded color literals outside the token source files.
// Scans dashboard-ui/src/ and fails if any literal hex / rgb( / hsl( color is
// written outside src/style.css and src/styles/*.css (the only token sources).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, extname } from "node:path";
import process from "node:process";

const srcDir = resolve(import.meta.dirname, "../src");
const SCAN_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".css", ".html", ".svg"]);

function allowed(rel) {
  // Token source files are the only place color values may be written.
  if (rel === "style.css") return true;
  return rel.startsWith("styles/") && rel.endsWith(".css");
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// Contexts where hex-looking text is an id/fragment or an SVG attribute
// selector, not a color value.
function stripNonColorSyntax(text) {
  return text
    .replace(/url\([^)]*\)/gi, "url()") // url(#gradient-id)
    .replace(/\[[^\[\]]*['"][^'"]*['"][^\[\]]*\]/g, "[]"); // [stroke='#ccc'] arbitrary selectors
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const FUNC_RE = /\b(?:rgba?|hsla?)\(\s*(?:\.[0-9]|[0-9])/g;

const violations = [];
for (const file of walk(srcDir)) {
  const rel = relative(srcDir, file).split("\\").join("/");
  if (!SCAN_EXT.has(extname(file).toLowerCase())) continue;
  if (allowed(rel)) continue;
  const text = readFileSync(file, "utf8");
  const cleaned = stripNonColorSyntax(text);
  for (const [re, kind] of [[HEX_RE, "hex"], [FUNC_RE, "rgb/hsl"]]) {
    re.lastIndex = 0;
    for (const match of cleaned.matchAll(re)) {
      const line = cleaned.slice(0, match.index).split("\n").length;
      violations.push(`${rel}:${line}: ${kind} literal "${match[0]}"`);
    }
  }
}

if (violations.length) {
  console.error(`check-colors: ${violations.length} hardcoded color literal(s) found outside token files:`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log("check-colors: no hardcoded color literals outside token files.");
