import { log } from "../core/log.js";

export function installRoute(ctx, cfg, state) {
  try {
    const ladder = Array.isArray(cfg.routeLadder) ? cfg.routeLadder : [];

    const wantAlias = Boolean(cfg.adapterAlias) && state.layers.adapter === "on";
    const wantSampling = cfg.temperature !== null || cfg.maxTokensFloor !== null;
    const wantLadder = ladder.length > 0;

    if (!wantAlias && !wantSampling && !wantLadder) {
      state.layers.route = "off";
      return false;
    }
    if (typeof ctx?.on !== "function") {
      state.layers.route = "no-service";
      return false;
    }

    const off = ctx.on(
      "agent/request",
      async (payload, next) => {
        const resolved = typeof next === "function" ? await next() : payload;
        try {
          if (!resolved || typeof resolved !== "object") return resolved;
          let out = resolved;

          if (wantAlias && out.provider && out.provider !== cfg.adapterAlias) {
            out = { ...out, provider: cfg.adapterAlias };
            state.stats.alias = (state.stats.alias || 0) + 1;
          }

          if (wantSampling) {
            let touched = false;
            const patch = { ...out };
            if (cfg.temperature !== null && patch.temperature !== cfg.temperature) {
              patch.temperature = cfg.temperature;
              touched = true;
            }
            if (
              cfg.maxTokensFloor !== null &&
              (patch.maxTokens === undefined || patch.maxTokens === null || patch.maxTokens < cfg.maxTokensFloor)
            ) {
              patch.maxTokens = cfg.maxTokensFloor;
              touched = true;
            }
            if (touched) out = patch;
          }

          if (wantLadder) {
            const agent = payload?.agent;
            const sid = agent?.id || agent?.session?.id || "";
            const turn = Number(payload?.turn) || 0;
            const key = `${sid}:${turn}`;
            const refusals = state.refusals.get(key) || 0;
            if (refusals >= cfg.routeAfterRefusals) {
              const slot = state.routeSlot.get(key) || 0;
              if (slot < ladder.length) {
                const pick = ladder[slot];
                state.routeSlot.set(key, slot + 1);
                const same = out.provider === pick.provider && out.model === pick.model;
                if (!same) {
                  state.stats.routes += 1;
                  log("换线", `${out.provider}/${out.model}`, "→", `${pick.provider}/${pick.model}`);
                  out = { ...out, provider: pick.provider, model: pick.model };
                }
              }
            }
          }

          return out === resolved ? resolved : out;
        } catch (e) {
          log("route 改写失败，放行原值", String(e?.message || e));
          return resolved;
        }
      },
      { global: true },
    );

    state.layers.route = "on";
    state.routeDisposer = off;
    return true;
  } catch (e) {
    state.layers.route = "failed";
    log("installRoute 失败", String(e?.message || e));
    return false;
  }
}

export function noteRefusal(state, sessionId, turn) {
  const key = `${sessionId || ""}:${Number(turn) || 0}`;
  state.refusals.set(key, (state.refusals.get(key) || 0) + 1);
  if (state.refusals.size > 400) {
    const first = state.refusals.keys().next().value;
    if (first !== undefined) state.refusals.delete(first);
  }
}
