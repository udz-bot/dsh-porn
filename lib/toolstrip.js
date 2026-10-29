import { log } from "./log.js";
import { stripMessageText } from "./msgstrip.js";

function resultText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && typeof b === "object" && b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
}

export function stripToolContent(content) {
  if (typeof content === "string") {
    const r = stripMessageText(content);
    return { content: r.text, hits: r.hits, changed: r.hits > 0 };
  }
  if (!Array.isArray(content)) return { content, hits: 0, changed: false };
  let hits = 0;
  let changed = false;
  const out = content.map((block) => {
    if (!block || typeof block !== "object") return block;
    if (block.type !== "text" || typeof block.text !== "string") return block;
    const r = stripMessageText(block.text);
    if (r.hits === 0) return block;
    hits += r.hits;
    changed = true;
    return { ...block, text: r.text };
  });
  return { content: changed ? out : content, hits, changed };
}

export function rewriteToolResult(target) {
  if (typeof target === "string" || Array.isArray(target)) return stripToolContent(target);
  if (!target || typeof target !== "object") return { content: target, hits: 0, changed: false };
  const source = target.content !== undefined ? target.content : target;
  return stripToolContent(source);
}

export function installToolStrip(ctx, cfg, state) {
  try {
    if (!cfg.msgStrip) {
      state.layers.toolStrip = "off";
      return false;
    }
    if (typeof ctx?.on !== "function") {
      state.layers.toolStrip = "no-service";
      return false;
    }
    const off = ctx.on(
      "tools/post-execute",
      async (exec, result, next) => {
        const decision = typeof next === "function" ? await next() : undefined;
        try {
          if (!decision || decision.kind !== "accept") return decision;

          if (decision.value !== undefined) return decision;
          const content = decision.content !== undefined ? decision.content : result?.content;
          const r = stripToolContent(content);
          if (!r.changed) return decision;
          state.stats.toolStrip = (state.stats.toolStrip || 0) + r.hits;
          return { ...decision, content: r.content };
        } catch (e) {
          log("工具结果改写失败，放行原值", String(e?.message || e));
          return decision;
        }
      },
      { global: true },
    );
    state.layers.toolStrip = "on";
    state.toolStripDisposer = off;
    if (typeof off === "function") state.disposers?.push?.(off);
    return true;
  } catch (e) {
    state.layers.toolStrip = "failed";
    log("installToolStrip 失败", String(e?.message || e));
    return false;
  }
}

export { resultText };
