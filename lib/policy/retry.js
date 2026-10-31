import { isHardRefusal } from "./detect.js";

export const HEAD_MIN = 24;

export function readChunk(chunk) {
  if (!chunk || typeof chunk !== "object") return { text: "", reasoning: false };
  const c = chunk.chunk && typeof chunk.chunk === "object" ? chunk.chunk : chunk;
  const type = String(c.type || "");
  const reasoning =
    c.blockType === "reasoning" ||
    /reasoning|thinking/i.test(type) ||
    c.channel === "reasoning";

  let text = "";
  if (typeof c.delta === "string") text = c.delta;
  else if (typeof c.text === "string") text = c.text;
  else if (typeof c.content === "string") text = c.content;
  else if (c.delta && typeof c.delta === "object" && typeof c.delta.text === "string") text = c.delta.text;
  else if (typeof chunk.delta === "string") text = chunk.delta;

  return { text, reasoning };
}

export function judgeHead(head) {
  const s = String(head || "").trim();
  if (!s) return "unknown";
  if (isHardRefusal(s)) return "refuse";
  if (s.length < HEAD_MIN) return "unknown";
  return "ok";
}

export function retryEnabled(cfg) {
  return Boolean(cfg && cfg.retryOnRefusal === "on" && Number(cfg.retryMax) > 0);
}

const HOUR = 3600_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function takeRetryTicket(state, cfg) {
  const cap = Math.max(1, Math.min(120, Number(cfg?.retryPerHour) || 6));
  const gap = Math.max(0, Math.min(60_000, Number(cfg?.retryGapMs) || 0));
  const now = Date.now();
  if (!state) return { allowed: true, wait: 0, used: 0, cap };
  if (!Array.isArray(state.retryWindow)) state.retryWindow = [];
  const win = state.retryWindow;
  while (win.length && now - win[0] > HOUR) win.shift();

  if (win.length >= cap) return { allowed: false, wait: 0, used: win.length, cap };
  const last = win.length ? win[win.length - 1] : 0;
  const wait = last ? Math.max(0, gap - (now - last)) : 0;
  win.push(now + wait);
  return { allowed: true, wait, used: win.length, cap };
}

export async function* guardedStream(openStream, options, cfg, state, escalate) {
  const maxTry = Math.max(0, Math.min(3, Number(cfg?.retryMax) || 0));
  const stats = state?.stats || {};
  let lastError = null;
  let lastBuffer = [];

  for (let attempt = 0; attempt <= maxTry; attempt += 1) {
    const opts = attempt === 0 ? options : escalate(options, attempt);
    let head = "";
    let judged = false;
    let verdict = "unknown";
    const buffered = [];
    let stream;

    try {
      stream = openStream(opts);
    } catch (e) {

      if (attempt === 0) throw e;
      lastError = e;
      break;
    }

    try {
      for await (const chunk of stream) {
        const { text, reasoning } = readChunk(chunk);

        if (!judged) {

          if (reasoning || !text) {
            buffered.push(chunk);
            continue;
          }
          head += text;
          buffered.push(chunk);
          verdict = judgeHead(head);
          if (verdict === "unknown") continue;
          judged = true;

          if (verdict === "refuse") break;

          for (const b of buffered.splice(0)) yield b;
          continue;
        }

        yield chunk;
      }
    } catch (e) {
      if (attempt === 0) throw e;
      lastError = e;
      break;
    }

    if (!judged) {

      for (const b of buffered.splice(0)) yield b;
      return;
    }
    if (verdict !== "refuse") return;

    lastBuffer = buffered;
    if (attempt < maxTry) {
      const ticket = takeRetryTicket(state, cfg);
      if (!ticket.allowed) {

        stats.retryDenied = (stats.retryDenied || 0) + 1;
        break;
      }
      if (ticket.wait) await sleep(ticket.wait);
      stats.retries = (stats.retries || 0) + 1;
      continue;
    }
    break;
  }

  if (lastError) throw lastError;

  if (lastBuffer.length) {
    for (const b of lastBuffer) yield b;
    stats.retryExhausted = (stats.retryExhausted || 0) + 1;
  }
}
