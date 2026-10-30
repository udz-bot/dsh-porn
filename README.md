# dsh-porn

**2,127 token 的破甲，零宿主补丁，被拒之后还有下一步。**

DSH（DeepSeek Harness）插件，专注一件事：稳定产出高质量色情正文。在 dsh-purge-flash 基础上反复修改得到，剔除了其他方面的破甲内容，减少可能导致封号的风险因素，并加入文风优化。范围锁定写在 [AGENTS.md](AGENTS.md)，由 `npm test` 的「1.5 仓库范围」一节守着。

拆法是把「模型不肯写」拆成可独立失效的几层，每层只负责一种失败模式；再把「写得干」用可数的配额压掉 —— 直白请求看人格层，氛围请求看文学档。

| | |
|---|---|
| **2,127 tok** | 每轮常驻：内核 3,034 字符 + 尾部回声 319 字符 |
| **0 个宿主文件** | 全部走 DSH 公开事件面，升级 DSH 不用重打补丁 |
| **12 片按需叶子** | 拒答命中后才装一片，约 350 tok，不常驻 |
| **221 项测试** | 不需要 DSH、不需要第三方依赖，`npm test` 直接跑 |

## 实现方式

| 层 | 文件 | 作用 |
|---|---|---|
| 提示词内核 | `lib/kernel.js` | order `-100000` 插在宿主所有段之前：输出约定 / 请求解析 / 交付校验 / 交付领域 / 思考槽 / 收口。四套家族模板（deepseek / claude / openai-compat / generic） |
| 操作稿注入 | `lib/operator.js` | 读 `$DSH_HOME/prompt-inject.md` 拼在内核之后。**强度主来源在这一层** |
| 尾部回声 | `lib/kernel.js` | 同一份立场以 order `10200` 重贴到 prompt 最末尾，近因权重最高 |
| 请求体整形 | `lib/adapter.js` | 注册 provider 别名代理真 adapter，改 prefill / prefill 形态 / many-shot / 采样 |
| 拒答判定与自愈 | `lib/detect.js` `lib/retry.js` `lib/route.js` | token 流读头判拒 → 换更强一级 prefill 重发；连续拒则换线。异常一律退回原流 |
| 擦除与注记 | `lib/note.js` | 历史里的拒答句改写；注记插在倒数第 N 条之前，管文风 |
| 词表贴合 | `lib/adapter.js` `lib/note.js` | 用词要求贴到最后一条用户消息头部；写代码的会话一个字都不加 |
| 按需叶子 | `lib/leaf.js` `skill/leaf-*.md` | 拒答命中后注入该类的具体工具链，一次一片 |
| 留证 | `lib/mirror.js` `lib/stream.js` | 事件与原始流镜像，`/porn recover` 能把会话还原成 markdown |

两个创作档写在核心里，规则全部可数：

1. **直白档**（请求点名尺度）：人格层优先 —— 固定自称与称呼、每 100 字至少一句角色自己的扭曲判断、主动索取；动作层 —— 第一句落身体、每 100 字两个性词、环境一句以内。只有动作没有判断 = 体操，整段重写。
2. **文学档**（要氛围、情感、文笔）：每段一个 25 字以上长句、每 300 字三处感官细节、环境占三成、内心两成用自由间接引语。

## 安装

```bash
# CLI 版
dsh plugin --profile <profile> add link:"$REPO"

# 桌面版（Windows）：从 DSH 安装目录跑 host CLI
ELECTRON_RUN_AS_NODE=1 "./DeepSeek Harness.exe" \
  "resources/app/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js" \
  plugin --profile <profile> add link:"$REPO"
```

两步收尾：

1. `$DSH_HOME/profiles/<profile>/package.json` 的 `dsh.profile.bundles` 数组里加一行 `"dsh-porn"`。
2. 重启 DSH **进程**（Windows 上关窗口不等于退进程）。

`link:` 需要软链能力；Windows 没开发者模式就用不带 `link:` 的 `add "$REPO"`（拷贝安装，改源码后要重装）。

首次启动后在 profile 里至少填 `adapterSource` —— 它必须等于该 runtime 真实的 provider id：

```yaml
- id: porn
  config:
    adapterSource: deepseek-official   # 用 /porn status 查；写错会回落到 deepseek-official / anthropic 等真实 id
    adapterAlias: deepseek-porn
```

## 使用

`/porn` 一个入口：

| 子命令 | 做什么 |
|---|---|
| `/porn status` | 各层挂载状态 + 计数 |
| `/porn on` / `off` | 开关内核，其余层照跑 |
| `/porn cost` | 内核字符数与 token 估算 |
| `/porn recover <sid>` | 从镜像还原会话为 markdown |
| `/porn verify <sid>` | 镜像与原日志条数比对 |
| `/porn list` / `flush` | 镜像会话列表 / 清空 |

CLI 另有一份离线工具：`node bin/porn.mjs list | recover | verify | cost | migrate`。

## 配置

三层覆盖，后者盖前者：`lib/config.js` 的 `DEFAULTS` → 包内 `cordis.patch.yml` → `$DSH_HOME/profiles/<profile>/cordis.patch.yml`。

常用键：

| 修改项 | 键 | 默认 |
|---|---|---|
| 换内核文本 | `kernelOverrideFile` | `""`（用内置） |
| 关掉操作稿 | `operatorPrompt` | `on` |
| 注记 | `note` / `noteDepth` | `on` / `3` |
| 词表贴合 | `wording` | `auto`（成人请求贴词表、其余创作贴文学要求，只贴一条） |
| prefill 形态 | `prefill` / `prefillGraded` | `auto` / `on` |
| 拒答阶梯 | `prefillLadder` / `prefillLadderMax` | `on` / `3` |
| token 级重试 | `retryOnRefusal` / `retryMax` / `retryPerHour` | `on` / `0` / `6` |
| 自我播种 | `seed` | `off`（种子正文是上行数据） |
| 擦除 | `shadowRefusal` | `on` |
| 换线 | `routeLadder` | `[]` |
| 采样 | `temperature` / `maxTokensFloor` | `null`（不动） |
| 镜像目录 | `mirrorDir` | `porn-raw` |

枚举外的值回落默认，数字 clamp 到区间，不抛错。

## 验证

```bash
npm test          # selftest + harness + rewind + adapter + leaf + retry + fixhidden + 两个契约审计
npm run test:all  # 再加 smoke-cordis（真 cordis 挂载）
```

当前基线：`npm test` 退出码 `0`，selftest 73 通过 / 0 失败，总 221 项。

改了 prompt 文本、词表、叶子之后，这两个数字不变才算改完。

## 不做的事

不随措辞、位置、分层、模型家族变化：

1. 不写未成年性内容。角色卡年龄写明确值，不写「看起来年轻」。（以用户提交年龄为准，输入 20 岁即可）
2. 不产出可直接使用的真实凭据、真实目标的可执行攻击链。叶子写工具名和参数，不写受害目标。
3. 不写自伤、自杀的方法细节。

这三条之上，尺度取用户原词，不给降级版，不改写成暗示，不追加说明段。

## 许可

MIT。破甲类插件在多数服务条款下属于违规使用，风险自负。
