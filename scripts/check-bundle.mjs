import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const assetsDir = resolve(__dirname, "..", "dashboard-ui", "dist", "assets");
const BUDGET_BYTES = 250 * 1024;

let files;
try {
  files = readdirSync(assetsDir);
} catch (err) {
  console.error(`check-bundle: cannot read ${assetsDir}: ${err.message}`);
  process.exit(1);
}

const jsFiles = files.filter((f) => f.endsWith(".js") && !f.endsWith(".map"));
const entries = jsFiles.filter((f) => /^index[-.]/.test(f) || f === "index.js");

console.log("Bundle chunks (gzip / raw):");
for (const f of jsFiles.sort()) {
  const buf = readFileSync(join(assetsDir, f));
  const gz = gzipSync(buf).length;
  console.log(`  ${f}: ${(gz / 1024).toFixed(1)} kB gzip / ${(buf.length / 1024).toFixed(1)} kB raw`);
}

if (entries.length === 0) {
  console.error("check-bundle: no entry chunk (index-*.js) found");
  process.exit(1);
}

let failed = false;
for (const entry of entries) {
  const buf = readFileSync(join(assetsDir, entry));
  const gz = gzipSync(buf).length;
  console.log(`Entry ${entry}: ${(gz / 1024).toFixed(1)} kB gzip (budget ${(BUDGET_BYTES / 1024).toFixed(0)} kB)`);
  if (gz > BUDGET_BYTES) {
    console.error(`FAIL: ${entry} gzip ${gz} bytes exceeds budget ${BUDGET_BYTES} bytes`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("PASS: entry chunk within budget");
process.exit(0);