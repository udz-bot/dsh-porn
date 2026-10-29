#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const value = (n) => {
  const i = argv.indexOf(n);
  return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined;
};

const APPLY = flag('--apply');
const FORCE = flag('--force');
const VERIFY = flag('--verify');
const JSON_OUT = flag('--json');
const LIST = flag('--list');
const RESTORE = value('--restore');
const HOME_ARG = value('--home');
const KEEP = new Set(
  (value('--keep') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

function die(code, msg) {
  console.error(msg);
  process.exit(code);
}

const DSH_HOME = HOME_ARG || process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const WS_FILE = path.join(DSH_HOME, 'storages', 'workspace.json');
const SESSIONS = path.join(DSH_HOME, 'sessions');

if (!fs.existsSync(WS_FILE)) {
  die(1, `找不到 ${WS_FILE}\n用 --home <dir> 指定 DSH_HOME，或确认 DSH 至少启动过一次。`);
}

function dshRunning() {
  if (process.platform !== 'win32') return false;
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq DeepSeek Harness.exe', '/NH'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return /DeepSeek Harness\.exe/i.test(out);
  } catch {
    return false;
  }
}

function readHeader(fp) {
  let raw;
  try {
    raw = fs.readFileSync(fp);
  } catch {
    return undefined;
  }
  if (raw.length === 0) return undefined;
  const firstFrameEnd = (() => {
    const n = raw.indexOf(MAGIC, 1);
    return n === -1 ? raw.length : n;
  })();
  const candidates = [raw, raw.subarray(0, firstFrameEnd)];
  for (const buf of candidates) {
    let text;
    try {
      text = zlib.zstdDecompressSync(buf).toString('utf8');
    } catch {
      continue;
    }
    const nl = text.indexOf('\n');
    try {
      return JSON.parse(nl === -1 ? text : text.slice(0, nl));
    } catch {

    }
  }
  return undefined;
}

function indexSessions() {
  const map = new Map();
  let dirs;
  try {
    dirs = fs.readdirSync(SESSIONS, { withFileTypes: true });
  } catch {
    return map;
  }
  for (const wsDir of dirs) {
    if (!wsDir.isDirectory()) continue;
    const wp = path.join(SESSIONS, wsDir.name);
    let subs;
    try {
      subs = fs.readdirSync(wp, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const sub of subs) {
      if (!sub.isDirectory()) continue;
      const sp = path.join(wp, sub.name);
      let files;
      try {
        files = fs.readdirSync(sp);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.startsWith('session.')) continue;
        const head = readHeader(path.join(sp, f));
        if (!head) continue;
        map.set(sub.name, {
          cwd: head.cwd || '',
          parent: head.parentSession || '',
          version: head.version,
          createdAt: head.createdAt || 0,
        });
        break;
      }
    }
  }
  return map;
}

if (RESTORE) {
  if (!fs.existsSync(RESTORE)) die(1, `找不到备份文件：${RESTORE}`);
  if (dshRunning() && !FORCE) {
    die(2, '[abort] DSH 正在运行，先完全退出（或加 --force）。');
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(WS_FILE, `${WS_FILE}.bak-before-restore-${stamp}`);
  fs.copyFileSync(RESTORE, WS_FILE);
  console.log('[done] 已从备份还原:', RESTORE);
  process.exit(0);
}

let ws;
try {
  ws = JSON.parse(fs.readFileSync(WS_FILE, 'utf8'));
} catch (e) {
  die(1, `workspace.json 不是合法 JSON：${e.message}\n先确认 DSH 已退出，或从 .bak-* 恢复。`);
}

const tables = ws?.tables?.workspaces ?? {};
const archived = Array.isArray(ws?.global?.archivedSessionIds) ? ws.global.archivedSessionIds : [];
const pinned = Array.isArray(ws?.global?.pinnedSessionIds) ? ws.global.pinnedSessionIds : [];

const slots = new Map();
for (const [wid, rec] of Object.entries(tables)) {
  for (const id of rec.sessionIds || []) slots.set(id, rec.path);
}

const sess = indexSessions();
const pathToWs = new Map(Object.entries(tables).map(([wid, rec]) => [rec.path, { wid, rec }]));

const detached = archived.filter((id) => !slots.has(id));
const hiddenInSlot = archived.filter((id) => slots.has(id));
const stray = [...sess.keys()].filter((id) => !slots.has(id) && !archived.includes(id));

const report = {
  workspaceJson: WS_FILE,
  workspaces: Object.keys(tables).length,
  slots: slots.size,
  archived: archived.length,
  archivedHiddenInSlot: hiddenInSlot.length,
  archivedDetached: detached.length,
  pinned: pinned.length,
  sessionFiles: sess.size,
  strayVisible: stray.length,
};

if (VERIFY) {
  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(archived.length === 0 ? 0 : 0);
  }
  console.log('== workspace.json 体检 ==');
  console.log('文件            :', report.workspaceJson);
  console.log('工作区数        :', report.workspaces);
  console.log('工作区槽位合计  :', report.slots);
  console.log(
    '归档集合        :',
    report.archived,
    `（其中 ${report.archivedHiddenInSlot} 条藏在工作区槽位里、${report.archivedDetached} 条已脱槽）`,
  );
  console.log('置顶            :', report.pinned);
  console.log('会话文件        :', report.sessionFiles);
  console.log('未分组可见      :', report.strayVisible);
  console.log('');
  if (archived.length === 0) {
    console.log('[ok] 归档集合为空，侧栏不会藏任何会话。');
  } else {
    console.log(`[warn] 还有 ${archived.length} 条归档，侧栏默认过滤（archivedFilter="default"）看不到它们。`);
    console.log('       清掉：完全退出 DSH，再跑 `node bin/fix-hidden.mjs --apply`。');
  }
  process.exit(0);
}

const toUnarchive = archived.filter((id) => !KEEP.has(id));
const keepList = archived.filter((id) => KEEP.has(id));
const needSlot = toUnarchive.filter((id) => !slots.has(id));

const plan = [];
const orphans = [];
for (const id of needSlot) {
  const cwd = sess.get(id)?.cwd;
  const hit = cwd ? pathToWs.get(cwd) : undefined;
  if (hit) plan.push({ id, cwd, wid: hit.wid, path: hit.rec.path });
  else orphans.push({ id, cwd: cwd || '(header 缺失)' });
}

if (!JSON_OUT) {
  console.log('workspace.json :', WS_FILE);
  console.log('工作区数        :', report.workspaces);
  console.log('归档集合        :', archived.length, '→ 清掉', toUnarchive.length, '保留', keepList.length);
  console.log('其中已脱槽       :', needSlot.length, '（按 header.cwd 挂回工作区）');
  console.log('');
  console.log('可挂回原工作区  :', plan.length);
  const byWs = new Map();
  for (const p of plan) byWs.set(p.path, (byWs.get(p.path) || 0) + 1);
  for (const [p, n] of [...byWs].sort((a, b) => b[1] - a[1])) console.log('  ', String(n).padStart(3), p);
  if (plan.length === 0) console.log('   （无需挂回：脱槽会话的 cwd 不在任何现存工作区里）');
  console.log('');
  console.log('只能落到「未分组」:', orphans.length);
  const byCwd = new Map();
  for (const o of orphans) byCwd.set(o.cwd, (byCwd.get(o.cwd) || 0) + 1);
  for (const [c, n] of [...byCwd].sort((a, b) => b[1] - a[1])) console.log('  ', String(n).padStart(3), c);

  if (LIST) {
    console.log('\n== 归档逐条（先看这份再决定 --keep 谁） ==');
    const rows = archived
      .map((id) => ({ id, ...(sess.get(id) || {}) }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    for (const r of rows) {
      const t = r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 16).replace('T', ' ') : '(header 缺失)';
      console.log('  ', t, slots.has(r.id) ? '槽内' : '脱槽', r.id, r.cwd || '');
    }
  }
}

if (!APPLY) {
  if (JSON_OUT) console.log(JSON.stringify({ ...report, plan: plan.length, orphans: orphans.length }, null, 2));
  else console.log('\n[dry-run] 未写盘。确认后：先完全退出 DeepSeek Harness，再加 --apply。');
  process.exit(0);
}

if (dshRunning() && !FORCE) {
  die(
    2,
    '\n[abort] DeepSeek Harness 正在运行。注册表内存里那份 state 会把这次写入整份盖掉。\n' +
      '        先完全退出 DSH 再跑 --apply；确认要写就加 --force。',
  );
}

const next = JSON.parse(JSON.stringify(ws));
if (!next.global) next.global = {};
next.global.archivedSessionIds = keepList;
const now = new Date().toISOString();
for (const p of plan) {
  const rec = next.tables.workspaces[p.wid];
  if (!rec) continue;
  if (!Array.isArray(rec.sessionIds)) rec.sessionIds = [];
  if (!rec.sessionIds.includes(p.id)) rec.sessionIds = [p.id, ...rec.sessionIds];
  rec.updatedAt = now;
}

const seenPath = new Map();
const seenSession = new Map();
for (const [wid, rec] of Object.entries(next.tables.workspaces)) {
  if (seenPath.has(rec.path)) die(1, `校验失败：两个工作区指向同一路径 ${rec.path}`);
  seenPath.set(rec.path, wid);
  for (const id of rec.sessionIds || []) {
    if (seenSession.has(id)) die(1, `校验失败：会话 ${id} 被两个工作区同时占用`);
    seenSession.set(id, wid);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${WS_FILE}.bak-fixhidden-${stamp}`;
fs.copyFileSync(WS_FILE, backup);
fs.writeFileSync(WS_FILE, JSON.stringify(next, null, 2), 'utf8');

const afterSlots = Object.values(next.tables.workspaces).reduce((n, r) => n + (r.sessionIds?.length || 0), 0);
if (JSON_OUT) {
  console.log(
    JSON.stringify(
      { ...report, backup, archivedAfter: next.global.archivedSessionIds.length, reattached: plan.length, slotsAfter: afterSlots },
      null,
      2,
    ),
  );
} else {
  console.log('\n[done] 备份        :', backup);
  console.log('[done] 归档集合    :', next.global.archivedSessionIds.length, '条');
  console.log('[done] 挂回会话    :', plan.length, '条');
  console.log('[done] 工作区槽位  :', afterSlots);
  console.log('');
  console.log('下一步：启动 DSH。侧栏这批会话回来了；剩下', orphans.length, '条在「未分组」里，点开该分组就能看到。');
  console.log(`回滚  ：node bin/fix-hidden.mjs --restore "${backup}"`);
}
process.exit(0);
