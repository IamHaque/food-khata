#!/usr/bin/env node
// Verification helper for food-khata worktrees.
// Usage: node scripts/verify.mjs <worktree-path> [--backend] [--browser] [--dispatch <id>]
import { readFileSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join } from "node:path";

function parseArgs() {
  let worktreeArg = null;
  let backend = false;
  let browser = false;
  let reportArg = null;

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--backend") {
      backend = true;
    } else if (arg === "--browser") {
      browser = true;
    } else if (arg === "--dispatch" || arg === "--report") {
      reportArg = process.argv[++i];
    } else if (arg.startsWith("--dispatch=")) {
      reportArg = arg.split("=")[1];
    } else if (arg.startsWith("--report=")) {
      reportArg = arg.split("=")[1];
    } else if (!arg.startsWith("--")) {
      if (!worktreeArg) {
        worktreeArg = arg;
      } else if (!reportArg) {
        reportArg = arg;
      }
    }
  }

  return { worktreeArg, backend, browser, reportArg };
}

function checkGuardrails(worktree) {
  try {
    const statusOut = execSync("git status --porcelain", {
      cwd: worktree,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    for (const rawLine of statusOut.split(/\r?\n/)) {
      if (!rawLine.trim()) continue;
      const status = rawLine.slice(0, 2);
      const file = rawLine.slice(3).trim();
      if (file.startsWith(".food-khata") || file === ".env" || file.startsWith(".env.") || file.includes("/.env")) {
        return { pass: false, error: `Forbidden path modified: ${file}` };
      }
      if (status.includes("D") && /test|spec/i.test(file)) {
        return { pass: false, error: `Test file deleted: ${file}` };
      }
    }

    const diffOut = execSync("git diff --name-only --diff-filter=D HEAD", {
      cwd: worktree,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    for (const rawFile of diffOut.split(/\r?\n/)) {
      const file = rawFile.trim();
      if (!file) continue;
      if (/test|spec/i.test(file)) {
        return { pass: false, error: `Test file deleted: ${file}` };
      }
    }
  } catch {
    // Skip git check if not git repository or HEAD missing
  }
  return { pass: true };
}

function extractFirstFailure(output) {
  if (!output) return [];
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("> ") && !l.startsWith("npm "));

  const errPattern = /\b(error|fail|failed|failure|exception|err)\b|^E\s+|TS\d+:/i;
  let idx = lines.findIndex((l) => errPattern.test(l));
  if (idx < 0) idx = 0;

  return lines.slice(idx, idx + 3).map((l) => `  ${l.slice(0, 100)}`);
}

function findLogFile(worktreeDir, reportArg) {
  const candidates = [
    resolve(process.cwd(), reportArg),
    resolve(worktreeDir, reportArg),
    resolve(process.cwd(), "orchestration", "runs", `${reportArg}.log`),
    resolve(worktreeDir, "orchestration", "runs", `${reportArg}.log`),
    resolve(process.cwd(), "orchestration", "runs", reportArg),
    resolve(worktreeDir, "orchestration", "runs", reportArg),
  ];
  for (const c of candidates) {
    if (existsSync(c) && !statSync(c).isDirectory()) {
      return c;
    }
  }
  return null;
}

function validateReport(logPath) {
  if (!existsSync(logPath)) return false;
  let content = "";
  try {
    content = readFileSync(logPath, "utf8");
  } catch {
    return false;
  }

  let report = null;
  const jsonBlocks = [...content.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g)];
  for (let i = jsonBlocks.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(jsonBlocks[i][1].trim());
      if (parsed && typeof parsed === "object" && parsed.story) {
        report = parsed;
        break;
      }
    } catch {
      // continue
    }
  }

  if (!report) {
    const lastBrace = content.lastIndexOf("}");
    if (lastBrace !== -1) {
      const firstBrace = content.lastIndexOf("{", lastBrace);
      if (firstBrace !== -1) {
        try {
          const parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1));
          if (parsed && typeof parsed === "object" && parsed.story) {
            report = parsed;
          }
        } catch {
          // ignore
        }
      }
    }
  }

  if (!report) return false;

  if (typeof report.story !== "string" || !/^S-\d{3}$/.test(report.story)) return false;
  if (!["done", "partial", "failed"].includes(report.status)) return false;
  if (!Array.isArray(report.files_changed)) return false;
  if (typeof report.notes !== "string" || report.notes.length > 600) return false;
  if (!report.scenarios || typeof report.scenarios !== "object" || Array.isArray(report.scenarios)) return false;

  const validScenarioVals = ["pass", "fail", "not_done", "na"];
  for (const val of Object.values(report.scenarios)) {
    if (!validScenarioVals.includes(val)) return false;
  }

  if (report.tests_run && Array.isArray(report.tests_run)) {
    for (const t of report.tests_run) {
      if (!t || typeof t.cmd !== "string" || !["pass", "fail", "not_run"].includes(t.result)) return false;
    }
  }

  for (const listField of ["decisions", "deviations", "backlog", "blockers"]) {
    if (report[listField] && !Array.isArray(report[listField])) return false;
  }

  return true;
}

function main() {
  const { worktreeArg, backend, browser, reportArg } = parseArgs();
  const repoRoot = process.cwd();
  let worktreeDir = resolve(repoRoot, worktreeArg || ".");
  if (!existsSync(worktreeDir) && worktreeArg && (repoRoot.endsWith(worktreeArg) || repoRoot.endsWith(`\\${worktreeArg}`) || repoRoot.endsWith(`/${worktreeArg}`))) {
    worktreeDir = repoRoot;
  }

  const env = { ...process.env };
  const candidateVenvs = [
    join(worktreeDir, ".venv"),
    join(repoRoot, ".venv"),
  ];
  for (const venv of candidateVenvs) {
    const binDir = process.platform === "win32" ? join(venv, "Scripts") : join(venv, "bin");
    if (existsSync(binDir)) {
      const sep = process.platform === "win32" ? ";" : ":";
      env.PATH = `${binDir}${sep}${env.PATH || ""}`;
      env.VIRTUAL_ENV = venv;
      break;
    }
  }

  const checks = [
    { name: "guardrails", run: () => checkGuardrails(worktreeDir) },
    { name: "typecheck", cmd: "npm --prefix dashboard-ui run typecheck" },
    { name: "lint", cmd: "npm --prefix dashboard-ui run lint" },
    { name: "unit", cmd: "npm --prefix dashboard-ui test -- --run" },
  ];

  if (backend) {
    checks.push({ name: "pytest", cmd: "python -m pytest tests -q" });
    checks.push({ name: "ruff", cmd: "python -m ruff check ." });
  }

  if (browser) {
    checks.push({ name: "browser", cmd: "npm --prefix dashboard-ui run test:browser" });
  }

  let allPassed = true;
  const outputLines = [];

  for (const check of checks) {
    if (check.run) {
      const res = check.run();
      if (res.pass) {
        outputLines.push(`${check.name}: PASS`);
      } else {
        allPassed = false;
        outputLines.push(`${check.name}: FAIL`);
        if (res.error) {
          outputLines.push(`  ${res.error}`);
        }
      }
    } else {
      try {
        execSync(check.cmd, {
          cwd: worktreeDir,
          env,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        outputLines.push(`${check.name}: PASS`);
      } catch (err) {
        allPassed = false;
        outputLines.push(`${check.name}: FAIL`);
        const combined = (err.stdout || "") + "\n" + (err.stderr || "") + "\n" + (err.message || "");
        const failSnippet = extractFirstFailure(combined);
        for (const line of failSnippet) {
          outputLines.push(line);
        }
      }
    }
  }

  if (reportArg) {
    const logFile = findLogFile(worktreeDir, reportArg);
    const isValid = logFile ? validateReport(logFile) : false;
    if (isValid) {
      outputLines.push("REPORT_VALID");
    } else {
      outputLines.push("REPORT_MISSING");
      allPassed = false;
    }
  }

  const linesToPrint = outputLines.slice(0, 30);
  console.log(linesToPrint.join("\n"));
  process.exit(allPassed ? 0 : 1);
}

main();
