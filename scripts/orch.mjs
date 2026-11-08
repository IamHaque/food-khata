#!/usr/bin/env node
// Orchestration helper: pick, run, score, probe, models.
// Usage:
//   node scripts/orch.mjs pick <class> [--not <model>] [--exclude a,b]
//   node scripts/orch.mjs run <model> <packet> <worktree> <dispatch-id>
//   node scripts/orch.mjs score <model> ok|quality
//   node scripts/orch.mjs probe
//   node scripts/orch.mjs models
//   node scripts/orch.mjs reset <model>
//   node scripts/orch.mjs bootstrap [worktree]
import { readFileSync, writeFileSync, existsSync, mkdirSync, symlinkSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { join, resolve } from "node:path";

const MODELS_FILE = "orchestration/models.json";
const STATE_FILE = "orchestration/state.json";
const RUNS_DIR = "orchestration/runs";

function loadModels() {
  return JSON.parse(readFileSync(MODELS_FILE, "utf8"));
}

function loadState() {
  if (!existsSync(STATE_FILE)) return { models: {} };
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function ensureRuns() {
  if (!existsSync(RUNS_DIR)) mkdirSync(RUNS_DIR, { recursive: true });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function now() {
  return new Date().toISOString();
}

function modelState(state, name) {
  if (!state.models[name]) {
    state.models[name] = { ok: 0, infra: 0, quality: 0, consec_infra: 0, consec_quality: 0, disabled: false, cooldown_until: null };
  }
  return state.models[name];
}

function isAvailable(state, name, defaults) {
  const ms = modelState(state, name);
  if (ms.disabled) return false;
  if (ms.cooldown_until && new Date(ms.cooldown_until) > new Date()) return false;
  return true;
}

// --- pick ---
function cmdPick(args) {
  const cls = args[0];
  if (!cls) { console.error("Usage: pick <class> [--not <model>] [--exclude a,b]"); process.exit(1); }
  const notIdx = args.indexOf("--not");
  const notModel = notIdx >= 0 ? args[notIdx + 1] : null;
  const exIdx = args.indexOf("--exclude");
  const excludes = exIdx >= 0 ? args[exIdx + 1].split(",") : [];

  const data = loadModels();
  const state = loadState();
  const chain = data.task_classes[cls];
  if (!chain) { console.error(`Unknown class: ${cls}`); process.exit(1); }

  for (const name of chain.chain) {
    if (name === notModel) continue;
    if (excludes.includes(name)) continue;
    if (chain.needs_vision && !data.models[name]?.vision) continue;
    if (isAvailable(state, name, data.defaults)) {
      console.log(name);
      return;
    }
  }
  // Fallback: any available model with vision if needed
  for (const [name, m] of Object.entries(data.models)) {
    if (name === notModel) continue;
    if (excludes.includes(name)) continue;
    if (chain.needs_vision && !m.vision) continue;
    if (isAvailable(state, name, data.defaults)) {
      console.log(name);
      return;
    }
  }
  console.error("NO_MODEL_AVAILABLE");
  process.exit(2);
}

// --- score ---
function cmdScore(args) {
  const [name, outcome] = args;
  if (!name || !outcome) { console.error("Usage: score <model> ok|quality"); process.exit(1); }
  const data = loadModels();
  const state = loadState();
  const ms = modelState(state, name);
  if (outcome === "ok") {
    ms.ok++;
    ms.consec_infra = 0;
    ms.consec_quality = 0;
    ms.disabled = false;
  } else if (outcome === "quality") {
    ms.quality++;
    ms.consec_quality++;
    if (ms.consec_quality >= 6) {
      ms.disabled = true;
      console.log(`DISABLED ${name} (${ms.consec_quality} consecutive quality failures)`);
    }
  }
  saveState(state);
  console.log(`scored ${name} ${outcome} → ok:${ms.ok} infra:${ms.infra} quality:${ms.quality} disabled:${ms.disabled}`);
}

// --- models ---
function cmdModels() {
  const data = loadModels();
  const state = loadState();
  console.log("\nModel health:");
  for (const [name, m] of Object.entries(data.models)) {
    const ms = modelState(state, name);
    const avail = isAvailable(state, name, data.defaults);
    const coolStr = ms.cooldown_until && new Date(ms.cooldown_until) > new Date()
      ? ` COOLDOWN until ${ms.cooldown_until}`
      : "";
    console.log(`  ${avail ? "✓" : "✗"} ${name.padEnd(15)} ok:${ms.ok} infra:${ms.infra} quality:${ms.quality}${ms.disabled ? " DISABLED" : ""}${coolStr}`);
  }
}

// --- reset ---
function cmdReset(args) {
  const name = args[0];
  if (!name) { console.error("Usage: reset <model>"); process.exit(1); }
  const state = loadState();
  const ms = modelState(state, name);
  ms.disabled = false;
  ms.cooldown_until = null;
  ms.consec_infra = 0;
  ms.consec_quality = 0;
  saveState(state);
  console.log(`reset ${name}`);
}

// --- probe ---
function cmdProbe() {
  const data = loadModels();
  const state = loadState();
  console.log("Probing all models with a minimal task...\n");

  const probePacket = join(RUNS_DIR, "probe_packet.md");
  if (!existsSync(RUNS_DIR)) mkdirSync(RUNS_DIR, { recursive: true });
  writeFileSync(probePacket, `# Probe task
Reply with a single JSON block and nothing else:
\`\`\`json
{"status":"ok","model":"self"}
\`\`\`
`);

  const results = {};
  for (const [name, m] of Object.entries(data.models)) {
    try {
      const cmd = buildCmd(m, probePacket, process.cwd(), name);
      console.log(`  probing ${name}...`);
      execSync(cmd, { timeout: 30000, stdio: "pipe" });
      results[name] = "ok";
      const ms = modelState(state, name);
      ms.disabled = false;
      ms.cooldown_until = null;
      ms.consec_infra = 0;
    } catch (e) {
      results[name] = `fail: ${e.message.slice(0, 60)}`;
      const ms = modelState(state, name);
      ms.infra++;
      ms.consec_infra++;
      if (ms.consec_infra >= data.defaults.disable_after_consecutive_failures) {
        ms.disabled = true;
        const coolEnd = new Date(Date.now() + data.defaults.cooldown_minutes * 60000).toISOString();
        ms.cooldown_until = coolEnd;
      }
    }
    console.log(`    ${name}: ${results[name]}`);
  }
  saveState(state);
  console.log("\nProbe complete. See orchestration/state.json for health.");
  console.log(JSON.stringify(results, null, 2));
}

function buildCmd(m, packetFile, worktree, dispatchId) {
  const packetAbs = resolve(packetFile);
  let cmd = m.cmd
    .replace("{id}", m.id)
    .replace("{packet}", packetAbs)
    .replace("{worktree}", worktree)
    .replace("{dispatch}", dispatchId || "probe");
  // For gemini: inject thinking level if present
  if (m.thinking) {
    cmd = cmd.replace("--yolo", `--yolo --thinking ${m.thinking}`);
  }
  return cmd;
}

// --- run ---
function cmdRun(args) {
  const [modelName, packetFile, worktree, dispatchId] = args;
  if (!modelName || !packetFile || !worktree || !dispatchId) {
    console.error("Usage: run <model> <packet> <worktree> <dispatch-id>");
    process.exit(1);
  }
  ensureRuns();
  bootstrapWorktree(worktree);

  const data = loadModels();
  const state = loadState();
  const m = data.models[modelName];
  if (!m) { console.error(`Unknown model: ${modelName}`); process.exit(1); }

  const logFile = join(RUNS_DIR, `${dispatchId}.log`);
  const startMs = Date.now();
  const cmd = buildCmd(m, packetFile, worktree, dispatchId);
  const timeoutMs = data.defaults.timeout_minutes * 60 * 1000;

  console.log(`[${now()}] DISPATCH ${dispatchId} → ${modelName}`);
  console.log(`  cmd: ${cmd.slice(0, 120)}`);
  console.log(`  log: ${logFile}`);

  let exitCode = 0;
  try {
    const out = execSync(cmd, {
      cwd: worktree,
      timeout: timeoutMs,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    writeFileSync(logFile, out);
    // Print last 40 lines for the orchestrator
    const lines = out.split("\n");
    console.log("\n--- tail ---");
    console.log(lines.slice(-40).join("\n"));
    console.log("--- end tail ---");
  } catch (e) {
    exitCode = e.status || 1;
    const output = (e.stdout || "") + (e.stderr || "") + e.message;
    writeFileSync(logFile, output);
    const ms = modelState(state, modelName);
    ms.infra++;
    ms.consec_infra++;
    if (ms.consec_infra >= data.defaults.disable_after_consecutive_failures) {
      ms.disabled = true;
      const coolEnd = new Date(Date.now() + data.defaults.cooldown_minutes * 60000).toISOString();
      ms.cooldown_until = coolEnd;
      console.log(`CIRCUIT BREAKER: ${modelName} disabled until ${coolEnd}`);
    }
    saveState(state);

    const tail = output.split("\n").slice(-40).join("\n");
    console.log(`\n[F1 Infra] ${modelName} failed (exit ${exitCode}):\n${tail}`);
    process.exit(exitCode);
  }

  const mins = ((Date.now() - startMs) / 60000).toFixed(1);
  console.log(`\n[${now()}] DONE ${dispatchId} in ${mins}m`);
}

// --- bootstrap ---
export function bootstrapWorktree(targetWorktree) {
  const start = Date.now();
  const wt = resolve(process.cwd(), targetWorktree || ".");
  let mainRepo;
  try {
    const gitCommon = execSync("git rev-parse --git-common-dir", {
      cwd: wt,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    mainRepo = resolve(wt, gitCommon, "..");
  } catch {
    mainRepo = process.cwd();
  }

  if (resolve(wt) === resolve(mainRepo)) {
    const durationMs = Date.now() - start;
    console.log(`[bootstrap] ${wt} is the main repository; skipped (${durationMs}ms)`);
    return { wt, mainRepo, durationMs, symlinks: [] };
  }

  const symlinkType = process.platform === "win32" ? "junction" : "dir";
  const links = [
    { src: join(mainRepo, ".venv"), dest: join(wt, ".venv") },
    { src: join(mainRepo, "dashboard-ui", "node_modules"), dest: join(wt, "dashboard-ui", "node_modules") },
    { src: join(mainRepo, "node_modules"), dest: join(wt, "node_modules") },
  ];

  const created = [];
  for (const { src, dest } of links) {
    if (existsSync(src) && !existsSync(dest)) {
      mkdirSync(resolve(dest, ".."), { recursive: true });
      symlinkSync(src, dest, symlinkType);
      created.push(dest);
    }
  }

  const durationMs = Date.now() - start;
  console.log(`[bootstrap] ${wt} bootstrapped in ${durationMs}ms (${created.length} symlinks created)`);
  return { wt, mainRepo, durationMs, symlinks: created };
}

function cmdBootstrap(args) {
  const target = args[0] || ".";
  bootstrapWorktree(target);
}

// --- main ---
const [, , cmd, ...rest] = process.argv;
switch (cmd) {
  case "pick":      cmdPick(rest); break;
  case "run":       cmdRun(rest); break;
  case "score":     cmdScore(rest); break;
  case "probe":     cmdProbe(); break;
  case "models":    cmdModels(); break;
  case "reset":     cmdReset(rest); break;
  case "bootstrap": cmdBootstrap(rest); break;
  default:
    console.log("Commands: pick, run, score, probe, models, reset, bootstrap");
    process.exit(1);
}
