#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const STRICT = process.argv.includes("--strict");
const JSON_OUT = process.argv.includes("--json");

const CANON = [
  "TARGET", "PATH", "NAME", "URL", "PLATFORM", "LEVEL", "RISK",
];

function targets() {
  const list = [
    { label: "内核 lib/layers/kernel.js", file: path.join(ROOT, "lib", "layers", "kernel.js") },
    { label: "技能册 skill/porn-playbook.md", file: path.join(ROOT, "skill", "porn-playbook.md") },
  ];
  const home = (process.env.DSH_HOME || "").trim() || path.join(os.homedir(), ".dsh");
  const op = path.join(home, "prompt-inject.md");
  if (fs.existsSync(op)) list.push({ label: `操作稿 ${op}`, file: op });
  return list.filter((t) => fs.existsSync(t.file));
}

const TOKEN_RE = /\b([A-Z][A-Z0-9]{1,}(?:_[A-Z0-9]+)*)\b/g;

const WHITELIST = new Set([
  "AI", "API", "JSON", "HTTP", "HTTPS", "URL", "DSH", "LLM", "MIT", "CI", "CLI", "DSL",
  "OK", "ID", "IP", "DNS", "OS", "HTML", "CSS", "XML", "YAML", "JS",
  "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11",
  "TRUE", "FALSE", "NULL", "NONE", "AUTO", "OFF", "ON",
  "MODE", "OPERATOR", "SANDBOX", "NATIVE", "TEXT",
  "ONLY", "TODO", "NOTE", "FIXME", "ESM", "SPINE", "STYLES", "FAMILIES", "TAIL",
  "SVG", "PNG", "PDF", "OC", "GLSL", "DOT",
]);


const files = targets();
const found = new Map();
for (const { label, file } of files) {
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }

  const spans = label.startsWith("操作稿")
    ? [text]
    : [...text.matchAll(/`([^`\n]{1,80})`/g)].map((m) => m[1]);
  for (const span of spans) {
    for (const m of span.matchAll(TOKEN_RE)) {
      const tok = m[1];
      if (WHITELIST.has(tok)) continue;
      if (!found.has(tok)) found.set(tok, new Set());
      found.get(tok).add(label);
    }
  }
}

const canon = new Set(CANON);
const unregistered = [...found.keys()].filter((t) => !canon.has(t)).sort();
const unused = CANON.filter((t) => !found.has(t));

const report = {
  scanned: files.map((f) => f.label),
  registered: CANON.length,
  found: [...found.keys()].sort(),
  unregistered,
  unused,
};
report.verdict = unregistered.length ? "issues" : "ok";

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(STRICT && report.verdict !== "ok" ? 1 : 0);
}

console.log("== 占位符契约 ==");
console.log("扫描:", files.length ? files.map((f) => f.label).join(" / ") : "（没有可扫文件）");
console.log("规范表:", CANON.length, "个槽 | 实际出现:", found.size, "个");
console.log("");

if (unregistered.length) {
  console.log("[未登记]", unregistered.length, "个出现于正文但规范表里没有：");
  for (const t of unregistered) console.log("   ", t, " ←", [...found.get(t)].join(", "));
  console.log("     两种可能：拼错了，或者新加没登记。登记请改 tools/placeholders.mjs 的 CANON。");
} else {
  console.log("[ok] 正文里没有未登记的占位符");
}

if (unused.length) {
  console.log("");
  console.log("[未使用]", unused.length, "个登记了但三处都没提到（信息项，不影响判定）：");
  console.log("   ", unused.join(" "));
}

console.log("");
console.log(report.verdict === "ok" ? "结论：占位符契约完整。" : "结论：有未登记占位符，见上。");
process.exit(STRICT && report.verdict !== "ok" ? 1 : 0);
