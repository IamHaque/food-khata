#!/usr/bin/env node
// Token-saving helper for docs/REDESIGN_BRIEF.md. Zero dependencies.
// Usage:
//   node scripts/brief.mjs next [n]              next startable stories (deps DONE)
//   node scripts/brief.mjs show S-014            print one story (+ chart contract if a chart story)
//   node scripts/brief.mjs status S-014 DONE "commit abc123; tests x,y"
//   node scripts/brief.mjs progress              counts only
//   node scripts/brief.mjs log dec|dev|bl|blk|ver|chg|led "a|b|c|..."   append a log row (IDs auto-filled for dec/dev/bl/blk)
import { readFileSync, writeFileSync } from "node:fs";

const FILE = process.env.BRIEF || "docs/REDESIGN_BRIEF.md";
const STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "DEFERRED"];
const CHART = /^S-(03[2-5]|04\d|05[0-4]|06\d)$/;
const SECTIONS = {
  dec: ["### 8.2", "DEC"], dev: ["### 8.3", "DEV"], bl: ["### 8.4", "BL"], blk: ["### 8.5", "BLK"],
  ver: ["### 8.6", null], chg: ["### 8.7", null], led: ["### 8.9", null],
};

const read = () => readFileSync(FILE, "utf8").split("\n");
const write = (lines) => writeFileSync(FILE, lines.join("\n"));
const today = () => new Date().toISOString().slice(0, 10);
const cells = (l) => l.split("|").slice(1, -1).map((c) => c.trim());
const isRow = (l) => l.startsWith("|") && !/^\|[-\s|]+\|$/.test(l);

function stories(lines) {
  const out = [];
  lines.forEach((l, i) => {
    const m = l.match(/^### (S-\d+) — (.+?) \[(P\d)\]\s*$/);
    if (m) out.push({ id: m[1], title: m[2], prio: m[3], start: i });
  });
  out.forEach((s, k) => {
    let end = lines.length;
    for (let j = s.start + 1; j < lines.length; j++) {
      if (/^### /.test(lines[j]) || /^---\s*$/.test(lines[j])) { end = j; break; }
    }
    s.end = end;
  });
  return out;
}

function progressRows(lines) {
  const rows = [];
  lines.forEach((l, i) => {
    if (isRow(l)) {
      const c = cells(l);
      if (/^S-\d+$/.test(c[0]) && STATUSES.includes(c[3])) rows.push({ i, id: c[0], c });
    }
  });
  return rows;
}

function counts(lines) {
  const n = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  const rows = progressRows(lines);
  rows.forEach((r) => n[r.c[3]]++);
  return { n, total: rows.length };
}

function refreshHeader(lines) {
  const { n, total } = counts(lines);
  const i = lines.findIndex((l) => l.startsWith("**Overall progress:**"));
  if (i < 0) return;
  const phase = (lines[i].match(/Current phase: ([^·]+?) ·/) || [])[1] || "P0";
  lines[i] = `**Overall progress:** ${n.DONE} / ${total} stories DONE · ${n.IN_PROGRESS} IN_PROGRESS · ${n.BLOCKED} BLOCKED · ${n.DEFERRED} DEFERRED · Current phase: ${phase} · Last updated: ${today()}`;
}

const [, , cmd, a, b, c] = process.argv;
const lines = read();

if (cmd === "show") {
  const s = stories(lines).find((x) => x.id === a);
  if (!s) { console.error("unknown story " + a); process.exit(1); }
  console.log(lines.slice(s.start, s.end).join("\n").trim());
  if (CHART.test(a)) {
    const i = lines.findIndex((l) => l.startsWith("## 5. Chart Contract"));
    const j = lines.findIndex((l, k) => k > i && /^---\s*$/.test(l));
    console.log("\n" + lines.slice(i, j).join("\n").trim());
  }
} else if (cmd === "status") {
  if (!STATUSES.includes(b)) { console.error("status must be one of " + STATUSES); process.exit(1); }
  const r = progressRows(lines).find((x) => x.id === a);
  if (!r) { console.error("no tracker row for " + a); process.exit(1); }
  const ev = (c ?? r.c[5]).replace(/\|/g, "/");
  lines[r.i] = `| ${r.c[0]} | ${r.c[1]} | ${r.c[2]} | ${b} | ${today()} | ${ev} |`;
  refreshHeader(lines);
  write(lines);
  const { n, total } = counts(lines);
  console.log(`${a} -> ${b}. ${n.DONE}/${total} done`);
} else if (cmd === "progress") {
  const { n, total } = counts(lines);
  console.log(JSON.stringify({ total, ...n }));
} else if (cmd === "next") {
  const limit = Number(a) || 5;
  const st = Object.fromEntries(progressRows(lines).map((r) => [r.id, r.c[3]]));
  const all = stories(lines);
  // Phase level of each story = number in the last "### Phase Pn" header above it (P3a..P3e share level 3).
  const level = {};
  let cur = 0;
  const heads = lines.map((l, i) => [i, (l.match(/^### Phase P(\d)/) || [])[1]]).filter((x) => x[1]);
  for (const s of all) {
    const h = heads.filter((x) => x[0] < s.start).pop();
    level[s.id] = h ? Number(h[1]) : cur;
  }
  const open = (id) => st[id] !== "DONE" && st[id] !== "DEFERRED";
  const lowestOpen = Math.min(...all.filter((s) => open(s.id)).map((s) => level[s.id]), 99);
  const out = [];
  for (const s of all) {
    if (st[s.id] !== "TODO" || level[s.id] > lowestOpen) continue;
    const dep = (lines.slice(s.start, s.end).find((l) => l.startsWith("Depends:")) || "").replace(/Files.*|Data.*|Reference.*/, "");
    const deps = [...dep.matchAll(/S-\d+/g)].map((m) => m[0]);
    if (deps.every((d) => !open(d))) out.push(`${s.id} [${s.prio}] ${s.title}${deps.length ? " (after " + deps.join(",") + ")" : ""}`);
    if (out.length >= limit) break;
  }
  console.log(out.join("\n") || "none startable (check BLOCKED stories or finish the current phase)");
} else if (cmd === "log") {
  const cfg = SECTIONS[a];
  if (!cfg) { console.error("log kind: " + Object.keys(SECTIONS)); process.exit(1); }
  const h = lines.findIndex((l) => l.startsWith(cfg[0]));
  if (h < 0) { console.error("section not found: " + cfg[0]); process.exit(1); }
  let first = -1, last = -1;
  for (let i = h + 1; i < lines.length; i++) {
    if (/^### |^---/.test(lines[i])) break;
    if (lines[i].startsWith("|")) { if (first < 0) first = i; last = i; }
  }
  const width = cells(lines[first]).length;
  const vals = (b ?? "").split("|").map((x) => x.trim());
  let row;
  if (cfg[1]) {
    const ids = lines.slice(first, last + 1).filter(isRow).map((l) => cells(l)[0]);
    const nums = ids.filter((x) => x.startsWith(cfg[1] + "-")).map((x) => Number(x.split("-")[1]));
    const lastRow = cells(lines[last]);
    const placeholder = lastRow.slice(1).every((x) => x === "");
    const id = `${cfg[1]}-${String(placeholder ? Math.max(...nums, 1) : Math.max(...nums, 0) + 1).padStart(3, "0")}`;
    row = [id, today(), ...vals];
  } else row = [today(), ...vals];
  row = row.slice(0, width); while (row.length < width) row.push("");
  const text = `| ${row.join(" | ")} |`;
  const lastCells = cells(lines[last]);
  const isPlaceholder = cfg[1] ? lastCells.slice(1).every((x) => x === "") : lastCells.every((x) => x === "");
  if (isPlaceholder) lines[last] = text; else lines.splice(last + 1, 0, text);
  write(lines);
  console.log("logged " + row[0]);
} else {
  console.log("commands: next [n] | show ID | status ID STATUS [evidence] | progress | log dec|dev|bl|blk|ver|chg|led \"a|b|c\"");
}
