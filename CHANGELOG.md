# Changelog

## 1.0.0

**首次以 `dsh-porn` 发布：改名 + 瘦身 + 范围锁定。selftest 71 通过，`npm test` 217 项，全绿。**

### 为什么改

前身 `dsh-purge-flash` 是给一个会话、一台机器修的：注释里存着每一轮的实测记录，`docs/` 下五份内部笔记，README 590 行讲「为什么这么设计」。这些内容对继续改它的人有用，对拿到仓库的人全是噪音。发布版留行为，删解释。

### 改了什么

1. **改名**：包名 / 插件 id / 命令 / 二进制 / 技能 / 镜像目录全部统一 —— `dsh-porn`、`id: porn`、`/porn`、`bin/porn.mjs`、`porn-playbook`、`porn-raw`、`adapterAlias: deepseek-porn`。
2. **去注释**：`lib` / `bin` / `tools` / `test` 同一批 30 个文件，9,070 行 → 7,941 行（−12%）。删掉的是叙述性注释（实测记录、设计权衡、历史沿革），保留的是会改变行为的那部分代码和每条断言的名字。剥离用词法扫描，字符串 / 模板串 / 正则没被碰过；`node --check` 全过，`npm test` 全绿是判据。
3. **收文档**：删 `docs/` 五份（MANUAL / INTERFACE / LAYERS / PROMPT / STRENGTH-PLAN），内容折叠进 README 的六节；`README` 590 → 132 行；`CHANGELOG` 632 → 本文件。
4. **删死代码**：`bin/porn.mjs migrate`（从旧插件导入的迁移路径）与其 `PURGE_DIR` 环境变量；`test/ab.mjs`（探针对照脚本，依赖 DSH 会话）。`test/probes.jsonl` 留着，CI 用它守探针集合完整性。
5. **长期指示**：`AGENTS.md` + README 的「这个仓库只做一件事」+ selftest「1.5 仓库范围」四条断言。删掉任一处 `npm test` 变红。

### 数字

| | 前身 1.8.3 | 本版 1.0.0 |
| --- | --- | --- |
| 源码行（lib+bin+tools+test，同批文件） | 9,070 | 7,941 |
| 内核（deepseek） | 3,034 字符 | 3,034 字符（未动） |
| 尾部回声 | 319 字符 | 319 字符（未动） |
| 常驻 | 2,127 tok | 2,127 tok |
| selftest | 71 | 71 |
| `npm test` 总项 | 217 | 217 |

行为零变化：常驻 token、测试项数、每条断言的判定都和前身一致。
