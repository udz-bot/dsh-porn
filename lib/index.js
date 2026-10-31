import fs from "node:fs";
import path from "node:path";

import { normalizeConfig } from "./core/config.js";
import { log, setVerbose, warnOnce } from "./core/log.js";
import { pickFamily, renderKernel, renderTail } from "./layers/kernel.js";
import { composeKernel, createOperatorReader, findOperatorFile } from "./layers/operator.js";
import { classifyReply, estimateTokens, isRetraction } from "./policy/detect.js";
import { createMirror, dshHome } from "./support/mirror.js";
import { installAssemble } from "./layers/assemble.js";
import { installAdapter } from "./layers/adapter.js";
import { installPreStep } from "./layers/prestep.js";
import { installRoute, noteRefusal } from "./layers/route.js";
import { installStream } from "./layers/stream.js";
import { installSkills } from "./layers/skills.js";
import { installCommands } from "./layers/commands.js";

export const name = "dsh-porn";

export const inject = ["systemPrompt"];

const TOK_PER_CHAR = 0.62;

const KERNEL_SECTION = "porn:kernel";
const TAIL_SECTION = "porn:tail";

function makeState(cfg) {
  return {
    cfg,
    layers: {
      kernel: "off",
      tail: "off",
      operator: "off",
      assemble: "off",
      adapter: "off",
      msgStrip: cfg.msgStrip ? "on" : "off",
      preStep: "off",
      route: "off",
      stream: "off",
      mirror: "off",
      shadow: cfg.shadowRefusal === "on" ? "on" : "off",
      skills: "off",
      commands: "off",
    },
    stats: {
      repairs: 0,
      anchors: 0,
      routes: 0,
      retractions: 0,
      shadowed: 0,
      rewinds: 0,
      msgStrip: 0,
      prefill: 0,
      shots: 0,
      refusalsShadowed: 0,
      leaves: 0,
      leafIds: {},
      retries: 0,
      retryExhausted: 0,
      retryDenied: 0,
      escalations: 0,
      json: 0,
    },
    leaves: new Map(),
    escalation: new Map(),
    retryWindow: [],
    repairs: new Map(),
    refusals: new Map(),
    routeSlot: new Map(),
    kernelChars: 0,
    kernelFamily: "",
    tailChars: 0,
    operatorFile: "",
    operatorChars: 0,
    mergedChars: 0,
    startedAt: Date.now(),
    disposers: [],
  };
}

function kernelText(cfg, family) {
  if (cfg.kernelOverrideFile) {
    try {
      const text = fs.readFileSync(cfg.kernelOverrideFile, "utf8");
      if (text.trim()) return text;
    } catch (e) {
      warnOnce("kernel-override", `内核覆盖文件读不到，回退内置：${String(e?.message || e)}`);
    }
  }
  return renderKernel(family);
}

function installKernel(ctx, cfg, state) {
  try {
    if (cfg.kernel === "off") {
      state.layers.kernel = "off";
      return false;
    }
    const prompt = ctx?.systemPrompt;
    if (!prompt || typeof prompt.section !== "function") {
      state.layers.kernel = "no-service";
      warnOnce("no-prompt", "拿不到 systemPrompt 服务：提示词内核没挂上，其余层照跑。");
      return false;
    }

    let family = cfg.kernel === "auto" ? "generic" : cfg.kernel;
    if (!["deepseek", "claude", "openai-compat", "generic"].includes(family)) family = "generic";

    const readOperator = createOperatorReader(cfg.operatorHome || dshHome());
    const firstOp = readOperator();
    state.operatorFile = firstOp.file;
    state.operatorChars = firstOp.bytes;
    if (firstOp.text) {
      state.layers.operator = "on";
      log("操作稿已加载", firstOp.file, firstOp.bytes, "字符");
    } else {
      state.layers.operator = "empty";
      warnOnce(
        "no-operator",
        `没找到操作稿（${findOperatorFile(cfg.operatorHome || dshHome()) || "$DSH_HOME/prompt-inject.md"} 不存在）：只有内核在跑，破甲强度会明显下降。`,
      );
    }

    const section = {
      name: KERNEL_SECTION,
      order: cfg.kernelOrder,
      interpolate: false,
      text: () => {
        if (state.cfg.enabled === false) return "";
        const op = readOperator();
        state.operatorChars = op.bytes;
        state.layers.operator = op.text ? "on" : "empty";
        const kernel = kernelText(cfg, family);
        state.kernelChars = kernel.length;
        state.kernelFamily = family;
        const merged = composeKernel(op.text, kernel);
        state.mergedChars = merged.length;
        return merged;
      },
    };

    const disposer = prompt.section(section);
    if (typeof disposer === "function") state.disposers.push(disposer);
    state.layers.kernel = "on";

    if (cfg.kernelTail === "on") {
      try {
        const tail = {
          name: TAIL_SECTION,
          order: cfg.kernelTailOrder,
          interpolate: false,
          text: () => {
            if (state.cfg.enabled === false) return "";
            const text = renderTail(family);
            state.tailChars = text.length;
            return text;
          },
        };
        const offTail = prompt.section(tail);
        if (typeof offTail === "function") state.disposers.push(offTail);
        state.layers.tail = "on";
      } catch (e) {
        state.layers.tail = "failed";
        log("尾部回声注册失败", String(e?.message || e));
      }
    }

    try {
      const off = ctx.on("session/event", (session, event) => {
        try {
          if (event?.type !== "request/header") return;
          if (cfg.kernel !== "auto") return;
          const config = event?.data?.header?.config || {};
          const next = pickFamily(config.provider, config.model);
          if (next !== family) {
            family = next;
            log("内核换家族", next, config.provider, config.model);
          }
        } catch {

        }
      });
      if (typeof off === "function") state.disposers.push(off);
    } catch {

    }

    return true;
  } catch (e) {
    state.layers.kernel = "failed";
    log("installKernel 失败", String(e?.message || e));
    return false;
  }
}

function installMirror(ctx, cfg, state) {
  try {
    if (!cfg.mirror) {
      state.layers.mirror = "off";
      return null;
    }
    const home = dshHome();
    const mirror = createMirror(cfg, home);

    const off = ctx.on("session/event", (session, event) => {
      try {
        const sid = session?.id ?? session?.header?.id;
        if (typeof sid !== "string" || !sid) return;

        try {
          const file = mirror.snapshotShadowed(session, event);
          if (file) state.stats.shadowed += 1;
        } catch (e) {
          log("遮蔽快照失败", String(e?.message || e));
        }

        try {
          mirror.pushEvent(sid, event);
        } catch (e) {
          log("事件镜像失败", String(e?.message || e));
        }

        if (event?.type === "assistant/message") {
          const msg = event?.data?.message;
          const content = Array.isArray(msg?.content) ? msg.content : [];
          const text = content
            .filter((b) => b && b.type === "text" && typeof b.text === "string")
            .map((b) => b.text)
            .join("");
          const thinking = content
            .filter((b) => b && typeof b.text === "string" && (b.type === "reasoning" || b.type === "thinking"))
            .map((b) => b.text)
            .join("");
          if (text || thinking) {
            try {
              if (classifyReply(`${text}\n${thinking}`).refused) noteRefusal(state, sid, event?.data?.turn);
            } catch {

            }
            if (cfg.retractProbe) {
              try {
                const info = isRetraction(text);
                if (info.hit) {
                  mirror.recordRetraction(sid, info, text);
                  state.stats.retractions += 1;
                }
              } catch {

              }
            }
          }
        }
      } catch (e) {
        log("session/event 处理失败", String(e?.message || e));
      }
    });

    if (typeof off === "function") state.disposers.push(off);
    state.mirror = mirror;
    state.layers.mirror = "on";

    try {
      const added = mirror.backfill(true);
      if (added > 0) log("启动补录", added, "条");
    } catch {

    }
    return mirror;
  } catch (e) {
    state.layers.mirror = "failed";
    log("installMirror 失败", String(e?.message || e));
    return null;
  }
}

function layerReport(state) {
  const c = state.cfg;
  return {
    enabled: c.enabled,
    kernel: state.layers.kernel,
    family: state.kernelFamily || "-",
    kernelChars: state.kernelChars,
    kernelTokens: state.kernelChars > 0 ? Math.round(state.kernelChars * TOK_PER_CHAR) : 0,
    tail: state.layers.tail,
    tailChars: state.tailChars,
    operator: state.layers.operator,
    operatorFile: state.operatorFile || "-",
    operatorChars: state.operatorChars,
    mergedChars: state.mergedChars,
    mergedTokens: state.mergedChars > 0 ? Math.round(state.mergedChars * TOK_PER_CHAR) : 0,
    assemble: state.layers.assemble,
    dedupeOperator: c.dedupeOperator,
    adapter: state.layers.adapter,
    adapterAlias: c.adapterAlias || "-",
    prefill: c.prefill,
    manyShot: c.manyShot,
    systemField: c.systemField,
    prefillGraded: c.prefillGraded,
    prefillLadder: c.prefillLadder,
    prefillLadderMax: c.prefillLadderMax,
    jsonMode: c.jsonMode,
    leafRouter: c.leafRouter,
    retryOnRefusal: c.retryOnRefusal,
    retryMax: c.retryMax,
    retryPerHour: c.retryPerHour,
    retryGapMs: c.retryGapMs,
    msgStrip: state.layers.msgStrip,
    shadowRefusal: c.shadowRefusal,
    temperature: c.temperature,
    maxTokensFloor: c.maxTokensFloor,
    preStep: state.layers.preStep,
    route: state.layers.route,
    routeLadder: c.routeLadder.length,
    stream: state.layers.stream,
    shadow: state.layers.shadow,
    mirror: state.layers.mirror,
    skills: state.layers.skills,
    leaves: state.layers.leaves,
    commands: state.layers.commands,
    stats: { ...state.stats },
    mirrorStats: state.mirror ? state.mirror.stats() : null,
  };
}

export function apply(ctx, rawConfig) {
  const cfg = normalizeConfig(rawConfig);
  setVerbose(cfg.verbose);
  const state = makeState(cfg);
  state.report = () => layerReport(state);

  try {
    if (!cfg.enabled) {
      state.layers.kernel = "disabled";
      log("插件已禁用");
    } else {
      installKernel(ctx, cfg, state);
      installAssemble(ctx, cfg, state);
      installAdapter(ctx, cfg, state);
      installPreStep(ctx, cfg, state);
      installRoute(ctx, cfg, state);
      const mirror = installMirror(ctx, cfg, state);
      installStream(ctx, cfg, mirror, state);
      installSkills(ctx, cfg, state);

      state.layers.leaves = cfg.leafRouter === "auto" ? "on" : cfg.leafRouter;
    }

    installCommands(ctx, cfg, state);
  } catch (e) {

    log("apply 失败", String(e?.message || e));
    warnOnce("apply", `启用失败：${String(e?.message || e)}`);
  }

  try {
    ctx.effect(() => () => {
      for (const d of state.disposers) {
        try {
          if (typeof d === "function") d();
        } catch {

        }
      }
      state.disposers.length = 0;
      try {
        state.mirror?.dispose();
      } catch {

      }
    });
  } catch {

  }

  return state;
}

export { normalizeConfig, classifyReply, estimateTokens, renderKernel, pickFamily };
