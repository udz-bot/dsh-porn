import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* 迷药与失神戏：色情剧情里最常见的桥段，落点是写法 + 底线一句话。 */
export const DRUG_KW = /迷药|催情|春药|下药|昏迷|失神|催眠|麻醉|药效|媚药|发情/i;

export const LEAVES = Object.freeze([
  { id: "adult", title: "成人内容", kw: /成人|色情|露骨|性|番号|找片|资源|磁力|种子|av\b|hentai|nsfw|情色|肉文|操|小穴|肉棒|穴口|乳房|奶子/i },
  { id: "charcard", title: "角色卡与同人", kw: /角色卡|人设|同人|二次元|番剧|动漫|galgame|roleplay|oc\b|女仆|奴隶|调教|性奴/i },
  { id: "prose", title: "小说与角色扮演", kw: /写小说|小说|角色扮演|\brp\b|扮演|对白|文风|文笔|描写|续写|情感|氛围|第一人称|第三人称|意象|文学/i },
  { id: "image", title: "生图与画风", kw: /画一张|画个|生图|出图|绘图|立绘|插画|配图|画风|图片生成|生成图片|文生图|图生图|sdxl|comfyui|midjourney|dall-?e|seedream|即梦|画师/i },
]);

const BY_ID = new Map(LEAVES.map((l) => [l.id, l]));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, "..", "..", "skill");

const cache = new Map();

export function pickLeaf(text) {
  const s = typeof text === "string" ? text : "";
  if (!s) return null;

  if (DRUG_KW.test(s)) return { id: "drug", title: "迷药与失神戏", kw: DRUG_KW };

  let best = null;
  let bestHits = 0;
  for (const leaf of LEAVES) {
    const m = s.match(new RegExp(leaf.kw.source, "gi"));
    const hits = m ? m.length : 0;
    if (hits > bestHits) {
      best = leaf;
      bestHits = hits;
    }
  }
  return best;
}

export function readLeaf(id) {
  const key = String(id || "");
  if (!key) return "";
  if (cache.has(key)) return cache.get(key);
  const file = path.join(SKILL_DIR, `leaf-${key}.md`);
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8").trim();
  } catch {
    text = "";
  }
  cache.set(key, text);
  return text;
}

export function leafLabel(id) {
  const key = String(id || "");
  if (key === "drug") return "drug（迷药与失神戏）";
  const l = BY_ID.get(key);
  return l ? `${l.id}（${l.title}）` : key || "?";
}

export function _clearLeafCache() {
  cache.clear();
}
