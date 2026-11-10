# magpie 第三批：摘掉 NVIDIA DeepSeek，GLM 降到末位兜底

对应任务：`Qoder-新任务-2026-11-11-第三批.md`（qi 01:26 决定）。上一批报告见 `2026-11-11_0109_magpie-key-proxy.md`。

**结论**：DeepSeek 已从 magpie 与 ZCode 双向摘净（网关模型列表 22 → 21 条，查不到它）；`nvidia/z-ai/glm-5.3-flash` 已移到路由组**最后一位**，`routing` 仍是 `order`；经网关实发 `auto/glm-5.3-flash` 与 `iteracompute/qwen3.8-27b` **都是 200**，额外点名请求末位的 NVIDIA GLM 也仍是流式 200（兜底没被摘坏）；31 项审计全过，**其他 15 家供应商零改动、任何超时都没放宽、代理与 chat 地址没碰、任何文件里都没有密钥**。

---

## 1. 一共只改了三个地方

改动前备份：`~/.config/magpie/auto-backups/deepseek-pre-20261110-172936/`（目录名是 UTC 时间戳，即本地 2026-11-11 01:29:36），含 `providers.json`、`plugin-providers.json`、ZCode `config.json`、ZCode `provider_config.json` 四份。

### 1.1 magpie `providers.json` — NVIDIA 暴露模型少一个

```diff
       "patience": -1,
       "listOff": true,
       "models": [
-        "z-ai/glm-5.3-flash",
-        "deepseek-ai/deepseek-v4.1-flash"
+        "z-ai/glm-5.3-flash"
       ],
```

用的命令：
```
magpie provider models nvidia -deepseek-ai/deepseek-v4.1-flash
```
magpie 回话：`✓ exposed models: 2 → 1` / `- deepseek-ai/deepseek-v4.1-flash`。

NVIDIA 其余字段**逐项比对全部原样**：`chat=http://127.0.0.1:3426/nvidia`、`key=${NVIDIA_API_KEY}`（占位符）、`maxRPM=40`、`restCap=1`、`patience=-1`（off）、`listOff=true`、`catalog=nvidia`、`website`、`keysUrl`、`icon`、`preset`。审计结论是 **nvidia 只有 `models` 这一个字段有差异**。

### 1.2 magpie `providers.json` — 路由组里 nvidia 与 kimi 换位

```diff
         "scnet/GLM-5.3-Flash",
         "zcode/GLM-5.3-Flash",
         "amd/GLM-5.3-Flash",
-        "nvidia/z-ai/glm-5.3-flash",
-        "moonshot-cn/kimi-k2.7-code"
+        "moonshot-cn/kimi-k2.7-code",
+        "nvidia/z-ai/glm-5.3-flash"
       ],
       "routing": "order",
       "off": [
```

用的命令（先摘再追加，避免整表替换误伤 `off`）：
```
magpie group set auto-glm-5-3-flash models-=nvidia/z-ai/glm-5.3-flash
magpie group set auto-glm-5-3-flash models+=nvidia/z-ai/glm-5.3-flash
```

`routing` 仍是 `order`，`off` 仍是 `["scnet/GLM-5.3-Flash"]`，`seen` 数组一字未动，组 id/name 未动，组数量未动。Kimi 只是被动前移一位，它自己的供应商配置零改动。

### 1.3 ZCode — 两处由 magpie 自动同步，我没手改

摘掉模型后 magpie 自己把 ZCode 的两个文件同步了：

- `~/.zcode/v2/config.json`：删掉 `"nvidia/deepseek-ai/deepseek-v4.1-flash"` 整个条目（51 行，含 `"name": "DeepSeek-V4.1-Flash · NVIDIA NIM"`）。模型条目 **22 → 21**，其余 21 条**逐条 JSON 比对完全一致**，`provider.magpie` 的非 models 字段（`enabled/kind/name/options/source`）一致，`options.baseURL` 仍是 `http://127.0.0.1:3425`，其他 provider 一致。
- `~/.zcode/v2/provider_config.json`：3 个 hunk、**28 行删除、0 行新增**——两处模型排序列表各去掉一行，加上该模型的 `modelConfigRules` 块（26 行）。没有任何其他 provider 的内容被碰。

`plugin-providers.json` 与备份**逐字节相同**（ZCode 插件供应商定义没动）。

**特别注意没有误伤**：商汤的 `token-sensenova/deepseek-v4-flash` 是另一个模型，名字里也有 deepseek，它**仍在列表里、配置逐字节未变**。只摘了 NVIDIA 那一个。

## 2. 路由组新顺序（文字证据）

`magpie group auto-glm-5-3-flash` 原样输出：
```
  GLM-5.3-Flash  auto/glm-5.3-flash
  routing   order
  stays     auto
  models    1 scnet/GLM-5.3-Flash  SCNet · GLM-5.3-Flash
            2 zcode/GLM-5.3-Flash  ZCode · GLM-5.3-Flash
            3 amd/GLM-5.3-Flash  AMD · GLM-5.3-Flash
            4 moonshot-cn/kimi-k2.7-code  Kimi (China) · Kimi K2.7 Code
            5 nvidia/z-ai/glm-5.3-flash  NVIDIA NIM · GLM-5.3-Flash
```

即 **scnet（off，保留原状）→ zcode → amd → kimi → nvidia**，nvidia 在第 5 位也就是最后一位，与任务卡要求逐字一致。`stays` 仍是 `auto`（没动）。

## 3. 端到端验证（逐条实测）

### 3.1 网关模型列表

`GET http://127.0.0.1:3425/v1/models` → **HTTP 200**，共 **21** 条。

| 检查项 | 结果 |
|---|---|
| `nvidia/deepseek-ai/deepseek-v4.1-flash` | **不存在**（已摘净） |
| `nvidia/z-ai/glm-5.3-flash` | 存在 |
| `auto/glm-5.3-flash` | 存在 |
| `iteracompute/qwen3.8-27b` | 存在 |
| `token-sensenova/deepseek-v4-flash`（商汤，不该动） | 仍存在 |

任务卡要的「GLM 和 Qwen 三个条目」= `nvidia/z-ai/glm-5.3-flash`、`auto/glm-5.3-flash`、`iteracompute/qwen3.8-27b`，三条都在。

### 3.2 经网关实发「你好」

`POST http://127.0.0.1:3425/v1/chat/completions`，body 由 Node 生成的 UTF-8 `{"model":…,"messages":[{"role":"user","content":"你好"}],"max_tokens":512,"stream":false}`。

| 模型 | 结果 | 总耗时 | 返回内容 | tokens / cost |
|---|---|---|---|---|
| `auto/glm-5.3-flash` | **HTTP 200** | 23.13s | 「你好！很高兴见到你。我是Z.ai训练的GLM大语言模型，随时准备为你提供帮助。有什么我能为你解答或协助的问题吗？…」 | prompt 13 / completion 266（推理 217）/ cost 0.0001526 |
| `iteracompute/qwen3.8-27b` | **HTTP 200** | 8.64s | 「你好！很高兴见到你。今天有什么我可以帮你的吗？」 | prompt 53 / completion 49（推理 33）/ **cost 0** |

**2/2 通过。**

### 3.3 路由组到底落到了谁身上（`magpie usage --csv` 实证）

不只看 200，还查了 magpie 自己的请求台账，确认新顺序真的生效：

| requested_model | provider | host | served_model | status | duration_ms | tries |
|---|---|---|---|---|---|---|
| `group/auto-glm-5-3-flash` | **amd** | developer.amd.com.cn | `self-dploy/GLM-5.3-Flash` | 200 | 23078 | **2** |
| `iteracompute/qwen3.8-27b` | iteracompute | **127.0.0.1:3426** | `qwen/qwen3.8-27b` | 200 | 8623 | 0 |
| `nvidia/z-ai/glm-5.3-flash`（3.4 节点名请求） | nvidia | **127.0.0.1:3426** | `z-ai/glm-5.3-flash` | 200 | 114833 | — |

- `tries=2` 说明按 order 先试了排在前面的成员（scnet 是 off 跳过、zcode 先试），第二个 amd 接住了。**这次 auto 请求没有走到 nvidia**——23 秒就返回了，而 nvidia GLM 要 113–135 秒；台账里那条 `group/auto-glm-5-3-flash` 的 provider 明确是 `amd`，代理日志在对应时刻（01:32:19 前后）也没有 nvidia 记录。日志里唯一一条 nvidia 记录是 01:35:27，那是我在 3.4 节**点名直请求**它做的额外确认，不是路由组落过去的。这正是「GLM 只当最后兜底」想要的行为。
- IteraCompute 那条的 `host` 是 `127.0.0.1:3426`，证明它仍然走本机注入代理，B 方案链路没被这批改动破坏。

### 3.4 额外确认：末位兜底本身没被摘坏

任务卡只要求验 auto 与 Qwen 两条。我额外直接点名请求了降到末位的 NVIDIA GLM，确认「摘掉同供应商的 DeepSeek」没有连带弄坏它：

| 模型 | 方式 | 结果 | HTTP 头 | 首个 token | 总耗时 | 返回内容 |
|---|---|---|---|---|---|---|
| `nvidia/z-ai/glm-5.3-flash` | **流式** | **HTTP 200** | 3.05s | **109.55s** | **114.88s** | 「你好！很高兴见到你。我是GLM，Z.ai训练的大语言模型。今天我能为你做些什么？…」`finish_reason=stop`，推理 180 字 |

**这里有个容易看错的地方，特别说明**：我的测试客户端量到的 `ttfb=3.05s` 只是**拿到 HTTP 响应头**的时间（magpie 会立刻把头返回）。真正等到**第一个 token** 是 magpie 台账里的 `ttft_ms=109553`，也就是 **109.55 秒**。所以「首字节 3 秒」是假象，下游 agent 如果按「多久没收到内容就判失败」来计时，面对的是近 110 秒的空等。

台账与代理日志双向对得上：`host=127.0.0.1:3426`、`duration_ms=114833`，代理日志 `nvidia model=z-ai/glm-5.3-flash status=200 ms=114826`——证明它仍然走本机注入代理，B 方案链路完好。

它仍然只有流式能通、仍然要等近两分钟——与上一批实测一致，**这批没有改善也没有恶化它的延迟**（因为按要求没放宽任何超时）。兜底位是活的，真轮到它时能接住。

### 3.5 审计（31 项，全过）

```
PASS  provider count unchanged (16 -> 16) / none removed / none added
PASS  other 15 providers (14 original + iteracompute) changed = NONE
PASS  nvidia: only 'models' field differs
PASS  nvidia models now exactly [z-ai/glm-5.3-flash]
PASS  nvidia chat still points at loopback proxy / key still placeholder
PASS  nvidia rpm=40 rest=1 patience=off list=off preserved
PASS  group members = required new order / nvidia last / kimi immediately before
PASS  routing still order / scnet still off / group id+name unchanged
PASS  no other group field changed / group count unchanged
PASS  no timeout / rate / queue knob changed on ANY provider
PASS  ZCode: exactly one entry removed, all others byte-identical
PASS  ZCode: baseURL still gateway / other providers unchanged / GLM+Qwen present
PASS  ZCode: 商汤 deepseek-v4-flash NOT touched (both files)
PASS  proxy.mjs + launch.vbs not modified in batch 3 (mtime + sha256 recorded)
PASS  no key material in any touched file (regex + literal)
AUDIT PASS (0 failures)
```

密钥扫描仍是**双保险**：正则匹配 `nvapi-…` / `ick_…` 形态，外加把两把真密钥从注册表读进内存做**字面量包含比对**（只输出 pass/fail 与长度 81/70，不输出值）。扫描覆盖 `providers.json`、ZCode 两个文件、`proxy.mjs`、`launch.vbs`、`proxy.log` 六份，全部 clean。

代理本体没碰：`proxy.mjs` mtime 仍是 `2026-11-10T16:55:36Z`、`launch.vbs` 仍是 `2026-11-10T17:02:03Z`（都早于本批开工），`/health` 复查两条路由 `keyPresent` 仍为 `true`，网关 `/v1/models` 仍 200。

## 4. 验收标准对照

- [x] `nvidia/deepseek-ai/deepseek-v4.1-flash` 已从 magpie 和 ZCode 里摘掉，模型列表里查不到（网关 21 条不含它；ZCode `config.json` 与 `provider_config.json` 都已同步删除）
- [x] `auto/glm-5.3-flash` 组顺序已是 zcode → amd → kimi → nvidia（nvidia 最后一位），routing 仍是 order（scnet 仍在首位且仍 off）
- [x] 经网关实测：`auto/glm-5.3-flash` 200、`iteracompute/qwen3.8-27b` 200
- [x] 验证结果逐条写回，报告推 qoder-inbox，不碰 main

## 5. 需要 qi 知道的

1. **没有放宽任何超时**，一处都没改：审计逐个供应商比对了 `patience / maxRPM / restCap / queueLimit / queueWait / maxAccounts / maxConcurrency`，差异数为 0。qi 选的是「只当最后兜底」，我按这个做的。
2. **兜底真的轮到 nvidia 时仍然会很慢**：它现在排第 5，只有 scnet(off)/zcode/amd/kimi 全都接不住才会轮到它。本批实测它首个 token 要等 **109.55 秒**、整条链路 **114.88 秒**，下游 agent 自己的超时未必撑得住。这批没动超时，所以这个风险原样保留——只是触发概率大幅降低了。另注意 magpie 会**立刻返回 HTTP 头**，所以「连接建立很快」不代表内容来得快，按首 token 计时的 agent 才会暴露这个问题。
3. **测试客户端自身的一个已知小毛病**：Node 在 Windows 上跑完打印 `SUMMARY 2/2 passed` 之后，退出时偶发 libuv 断言（`src\win\async.c` line 94），导致 shell 看到非零退出码。**测试结果本身是有效的**（两行 PASS 与 SUMMARY 都已打印），且事后复查代理 `/health` 与网关都正常、代理日志完整。这是测试脚本所在运行时的问题，不是 magpie 或代理的问题。
4. **ZCode 的两个文件是 magpie 自动同步的**，我没有手改 JSON。所以以后在 magpie 里增删模型，ZCode 会跟着变；反过来手改 ZCode 可能被 magpie 覆盖。
5. **IteraCompute 活动 2026-11-24 16:00（北京时间）到期**，到期后这条备用会失效，届时需复核。
6. 上一批留下的开放项仍未决（代理脚本进哪个仓库、要不要加本地共享令牌、要不要日志轮转、要不要一次真实冷启动确认），这批没有擅自处理。

## 6. 备份与回滚

- 本批备份：`~/.config/magpie/auto-backups/deepseek-pre-20261110-172936/`（四份文件，见第 1 节）
- 上一批备份仍在：`~/.config/magpie/auto-backups/nvidia-pre-20261110-235343/`
- 回滚 DeepSeek：`magpie provider models nvidia +deepseek-ai/deepseek-v4.1-flash`（ZCode 会自动同步回来）
- 回滚顺序：`magpie group set auto-glm-5-3-flash models=scnet/GLM-5.3-Flash,zcode/GLM-5.3-Flash,amd/GLM-5.3-Flash,nvidia/z-ai/glm-5.3-flash,moonshot-cn/kimi-k2.7-code`（整表替换会重写 members，回滚后需复查 `off` 是否仍为 `["scnet/GLM-5.3-Flash"]`；更稳的做法是直接用备份里的 `providers.json` 覆盖回去）
- 本报告提交在 `qoder-inbox` 分支，**main 未碰**。本批无代码提交（只改本机 magpie/ZCode 配置）。