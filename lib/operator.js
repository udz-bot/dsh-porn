import fs from "node:fs";
import path from "node:path";

import { log } from "./log.js";

export const OPERATOR_SECTION = "porn:operator";

const CANDIDATES = ["prompt-inject.md", "prompt-inject.zh.md", "prompt-inject.en.md"];

function dshHome() {
  const env = String(process.env.DSH_HOME || "").trim();
  if (env) return env;
  const home = process.env.USERPROFILE || process.env.HOME || "";
  return home ? path.join(home, ".dsh") : "";
}

export function findOperatorFile(home) {
  const root = home || dshHome();
  if (!root) return "";
  for (const name of CANDIDATES) {
    const p = path.join(root, name);
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {

    }
  }
  return "";
}

export function createOperatorReader(home) {
  let cache = { key: "", text: "", file: "" };

  return function read() {
    const file = findOperatorFile(home);
    if (!file) {

      if (cache.text) {
        return { text: cache.text, file: cache.file, bytes: cache.text.length, changed: false };
      }
      return { text: "", file: "", bytes: 0, changed: false };
    }

    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return { text: cache.text, file: cache.file, bytes: cache.text.length, changed: false };
    }

    const key = `${file}:${stat.mtimeMs}:${stat.size}`;
    if (key === cache.key) {
      return { text: cache.text, file: cache.file, bytes: cache.text.length, changed: false };
    }

    let text = "";
    try {

      text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    } catch (e) {
      log("操作稿读失败，沿用上次", String(e?.message || e));
      return { text: cache.text, file: cache.file, bytes: cache.text.length, changed: false };
    }

    cache = { key, text, file };
    return { text, file, bytes: text.length, changed: true };
  };
}

export function composeKernel(operatorText, kernelText) {
  const op = typeof operatorText === "string" ? operatorText.trim() : "";
  const k = typeof kernelText === "string" ? kernelText.trim() : "";
  if (!op) return k;
  if (!k) return op;
  return `${k}\n\n${op}`;
}

export function installOperator(ctx, cfg, state) {
  try {
    if (cfg.operatorPrompt === "off") {
      state.layers.operator = "off";
      return null;
    }
    const read = createOperatorReader(cfg.operatorHome || dshHome());
    const first = read();
    if (first.changed) log("操作稿已加载", first.file, first.bytes, "字符");
    state.operatorFile = first.file;
    state.operatorChars = first.bytes;
    state.layers.operator = first.text ? "on" : "empty";
    return read;
  } catch (e) {
    state.layers.operator = "failed";
    log("installOperator 失败", String(e?.message || e));
    return null;
  }
}
