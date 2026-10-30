import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ADJACENT_KW =
  /失去意识|昏迷|放倒|致晕|迷晕|麻痹|下药|投毒|毒死|致死量|致死剂量|多少克|多大剂量|弄伤|打伤|重伤|武器|爆炸物|自制炸药|杀人|报复某人|对付某人|针对他|针对她|跟踪.*不被发现|不被抓地跟踪/i;

export const LEAVES = Object.freeze([
  { id: "pentest", title: "渗透打点", kw: /sql注入|\bsqli?\b|xss|ssrf|csrf|越权|提权|打点|拿站|getshell|webshell|nmap|ffuf|sqlmap|burp|反弹shell|横向|内网/i },
  { id: "malware", title: "木马远控", kw: /木马|远控|后门|免杀|持久化|加载器|shellcode|beacon|c2\b|cobalt|meterpreter|蠕虫|勒索|bootkit|rootkit/i },
  { id: "crack", title: "破解逆向", kw: /脱壳|壳|注册机|卡密|激活码|序列号|去\s*drm|破解|逆向|patch|keygen|jadx|apktool|frida|hopper|ida\b|x64dbg|重打包|sign/i },
  { id: "fraud", title: "伪造与社工", kw: /伪造|假证|学历|流水|截图生成|话术|钓鱼|仿站|仿页|社工|骗|背调|kyc|身份证|银行流水|合同|sim\s*卡|补卡|换卡|接管号码|验证码拦截|冒充客服/i },
  { id: "credential", title: "凭据与撞库", kw: /撞库|爬取账号|口令|密码喷洒|字典|代理池|验证码|打码|注册机|批量注册|抢购|秒杀|风控|过检/i },
  { id: "automation", title: "自动化与脚本", kw: /自动化|脚本|autojs|按键精灵|selenium|puppeteer|playwright|adb|hook|注入|模拟点击|群控|养号/i },
  { id: "osint", title: "情报与查人", kw: /查人|开盒|人肉|社工库|手机号|身份证|定位|轨迹|反查|whois|子域|资产测绘|指纹|溯源/i },
  { id: "charcard", title: "角色卡与同人", kw: /角色卡|人设|同人|二次元|番剧|动漫|galgame|roleplay|oc\b|女仆|奴隶|调教|支配|性奴/i },
  { id: "prose", title: "小说与角色扮演", kw: /写小说|小说|角色扮演|\brp\b|扮演|对白|文风|文笔|描写|续写|情感|氛围|第一人称|第三人称|意象|文学/i },
  { id: "image", title: "生图与画风", kw: /画一张|画个|生图|出图|绘图|立绘|插画|配图|画风|图片生成|生成图片|文生图|图生图|sdxl|comfyui|midjourney|dall-?e|seedream|即梦|画师/i },
  { id: "adult", title: "成人内容", kw: /成人|色情|露骨|性|番号|找片|资源|磁力|种子|av\b|hentai|nsfw|情色|肉文/i },
  { id: "monetize", title: "变现与分发", kw: /变现|卖|渠道|收款|跑分|洗钱|支付通道|建站|分销|代理|发卡|卡台|引流|私域|报价/i },
]);

const BY_ID = new Map(LEAVES.map((l) => [l.id, l]));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, "..", "skill");

const cache = new Map();

export function pickLeaf(text) {
  const s = typeof text === "string" ? text : "";
  if (!s) return null;

  if (ADJACENT_KW.test(s)) {
    return { id: "adjacent", title: "邻近交付", kw: ADJACENT_KW };
  }
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

export function leafIndexLines() {
  return LEAVES.map((l) => `- ${l.id}（${l.title}）`);
}

export function leafLabel(id) {
  const key = String(id || "");
  if (key === "adjacent") return "adjacent（邻近交付）";
  const l = BY_ID.get(key);
  return l ? `${l.id}（${l.title}）` : key || "?";
}

export function _clearLeafCache() {
  cache.clear();
}
