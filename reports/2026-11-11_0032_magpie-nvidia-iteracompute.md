# magpie 接入 NVIDIA NIM + IteraCompute（备用）

对应任务卡：`[未完成] 2026-11-10 23:40 把 IteraCompute 加进 magpie` 与 `[待确认] 英伟达 NIM 接入`。两张卡都做了。

**结论先说**：结构全部接好、路由组顺序已改、ZCode 已走 magpie；但**两家新供应商目前不可用**，因为 magpie 不支持从环境变量读密钥，而任务卡要求密钥不落盘。这一条需要 qi 决定，见末尾「需要 qi 决定」。

---

## 1. 密钥处理

- 两把密钥已用 `setx` 存为 qi 的**用户级环境变量**：`ITERACOMPUTE_API_KEY`、`NVIDIA_API_KEY`。
- 已核验存在（只报长度，不报值）：IteraCompute 81 字符、NVIDIA 70 字符。
- 密钥**没有**写进任何文件、脚本、日志或本报告。
- 测试时从注册表读进进程环境再用，命令行与输出均不含值。

## 2. model id（调 GET /v1/models 查实，未猜）

| 供应商 | 任务卡说的名字 | 实际 model id | 备注 |
|---|---|---|---|
| NVIDIA NIM | GLM-5.3-Flash | `z-ai/glm-5.3-flash` | 目录共 84 个模型 |
| NVIDIA NIM | DeepSeek-V4.1-Flash | `deepseek-ai/deepseek-v4.1-flash` | 注意前缀是 `deepseek-ai/` |
| IteraCompute | Qwen3.8-27B | `qwen/qwen3.8-27b` | 与任务卡预期一致 |
| IteraCompute | Auto | `Auto` | 确实存在 |

两家的 `/v1/models` 都是**公开端点**（不带密钥也返回 200），所以「能列模型」不代表密钥有效；密钥有效性是用假密钥对比确认的（假密钥 → 401/403，真密钥 → 过认证）。

## 3.「你好」测试结果

请求体由 Node 生成以保证 UTF-8。**踩坑提醒**：先前用 bash 内联 curl 传中文会被 shell 编码破坏，IteraCompute 因此回 400 `provider_invalid_request`、NVIDIA 的推理内容里也出现「garbled characters」。换成 Node 生成请求体后 IteraCompute 立刻正常。以后测中文别用 bash 内联 JSON。

| 供应商 / 模型 | 结果 | 首字节 | 总耗时 | 说明 |
|---|---|---|---|---|
| IteraCompute `qwen/qwen3.8-27b` | ✅ HTTP 200 | 4.83s | 10.98s | 回「你好！很高兴见到你。今天有什么我可以帮你的吗？」；prompt 53 / completion 40（含推理 24）；**cost 0** |
| IteraCompute `Auto` | ✅ HTTP 200 | 9.10s | 13.68s | 回「你好！👋 有什么我可以帮你的吗？」；completion 40（含推理 25）；**cost 0** |
| NVIDIA `z-ai/glm-5.3-flash` | ✅ HTTP 200（**仅流式**） | **114.19s** | 116.43s | 回复正常，自我介绍为 GLM；`finish_reason=stop` |
| NVIDIA `deepseek-ai/deepseek-v4.1-flash` | ❌ **四次全失败** | 无 | 90s / 180s / 300s / 240s | 依次为：非流式超时、流式超时、`fetch failed`（连接被断）、流式超时。始终 0 字节 |

补充观察：

- **IteraCompute 免费额度确认**：两次成功请求 `cost` 都是 `0`，与「3000 万 tokens/月、用完 429 不扣钱」一致。
- **IteraCompute 偶发 503**：中文首次测试遇到一次 `provider_api_error`（服务暂时不可用），重试即 200。属上游抖动，不是配置问题。
- **NVIDIA GLM 首字节 114 秒**：这是最大隐患。非流式请求会一直挂到超时（90s 内 0 字节），流式也要近 2 分钟才吐第一个字。多数 agent 的默认超时撑不住，实际用起来很可能被判失败。
- **NVIDIA DeepSeek 判定不可用**：目录里列着，但四种超时/传输组合都拿不到任何字节。同一密钥请求别的模型能秒回（EOL 模型 1.0s 回 410、假密钥 0.7s 回 403），所以不是密钥或网络问题，是这个模型本身没在服务。已按要求注册，但别指望它能兜底。
- **上下文口径不一致**：任务卡写 Qwen 128K，接口 `model_disclosure` 报 `context_tokens: 262144`（256K）。输出上限两边一致都是 8192。我按任务卡的免费档口径**保守设成 128k**，避免超档被拒。

## 4. magpie 配置改动

新增两个供应商，**其他 14 家供应商零改动**（逐项 JSON 对比备份确认：changed = NONE，removed = NONE）。

### nvidia
- 用 magpie 内置 `nvidia` 预设添加，`catalog=nvidia`，chat = `https://integrate.api.nvidia.com/v1`
- 暴露模型：`nvidia/z-ai/glm-5.3-flash`（显示名 GLM-5.3-Flash）、`nvidia/deepseek-ai/deepseek-v4.1-flash`（显示名 **DeepSeek-V4.1-Flash**，独立注册，**不进 GLM 组**）
- `list=off`（只暴露指定两个，不把 84 个全灌进来）
- `rpm=40`（贴合免费限速）
- `rest-cap=1m`（被限速/失败最多歇 1 分钟，而非默认 30 分钟）
- `patience=off`（不原地重试等待，直接把错误交出去让路由换人）

### iteracompute
- 自定义供应商，chat = `https://api.iteracompute.com/v1`
- 注册名按任务卡改成 **`iteracompute/qwen3.8-27b`**，上游仍问 `qwen/qwen3.8-27b`（用 `magpie model id` + wire 分离，避免双斜杠的怪 id）
- `context=128k`、`output=8192`（原本 magpie 猜成 32768，已修正）
- **不进 GLM 组**，单独作 Qwen 备用
- `at-once=1`（贴合「同一账号同时只跑 1 个请求」）
- `queue=1 等待 / 60s`（排队超过 60 秒就转 429 走人，不卡死）
- `patience=off`、`rest-cap=1m`

### 路由组 `auto/glm-5.3-flash` 新顺序

`routing` 由 `smart` 改为 **`order`**（第一个答不了才换下一个，顺序才有硬保证）：

| 位次 | 成员 | 状态 |
|---|---|---|
| 1 | `scnet/GLM-5.3-Flash` | **原本就在组的 `off` 列表里**，保留原状未动 |
| 2 | `zcode/GLM-5.3-Flash` | 可用 → **实际首个生效成员** |
| 3 | `amd/GLM-5.3-Flash` | 可用 |
| 4 | `nvidia/z-ai/glm-5.3-flash` | 新增，排在 Kimi 之前 |
| 5 | `moonshot-cn/kimi-k2.7-code` | 新增，最后备用 |

两点要 qi 知道：

1. **原组里根本没有 Kimi**（原成员只有 scnet / zcode / amd）。按 qi 在聊天里选的「追加 Kimi 到末位、nvidia 在其前」加进来的。加的是 `kimi-k2.7-code`——它并不是 GLM-5.3-Flash，作跨模型兜底可以，但输出风格/能力会变，心里有数。
2. **scnet 处于 off**：这是改动前就有的状态，我没碰（任务卡要求不改其他供应商）。所以生效顺序是 zcode → amd → nvidia → kimi。要让 scnet 重新参与，说一声我把它打开。

## 5. ZCode

- ZCode 的 provider 仍是 magpie，`baseURL=http://127.0.0.1:3425`、`kind=anthropic`，**不直连**任何一家。
- 三个条目已自动写进 `~/.zcode/v2/config.json`：
  - `nvidia/z-ai/glm-5.3-flash` → 「GLM-5.3-Flash · NVIDIA NIM」
  - `nvidia/deepseek-ai/deepseek-v4.1-flash` → 「DeepSeek-V4.1-Flash · NVIDIA NIM」
  - `iteracompute/qwen3.8-27b` → 「qwen3.8-27b · IteraCompute」，limit = context 128000 / output 8192
- ZCode 进程当时在跑，配置由 magpie 写入；**如果 ZCode 界面里没立刻出现，重启 ZCode 一次**。

## 6. 验证证据

magpie 原本**没在运行**（3425 无监听、进程列表无 magpie），我用 `magpie tray` 起了它，网关现在正常。

网关 `GET /v1/models` → HTTP 200，共 22 个 id，新增三个都在：
```
auto/glm-5.3-flash
iteracompute/qwen3.8-27b
nvidia/z-ai/glm-5.3-flash
nvidia/deepseek-ai/deepseek-v4.1-flash
```

经网关实发「你好」（`POST http://127.0.0.1:3425/v1/chat/completions`）：

| 请求模型 | 结果 | 耗时 | 返回 |
|---|---|---|---|
| `iteracompute/qwen3.8-27b` | ❌ 401 | 6.17s | `IteraCompute authentication failed / invalid_api_key` |
| `nvidia/z-ai/glm-5.3-flash` | ❌ 401 | 0.82s | `Invalid JWT serialization: Missing dot delimiter(s)` |
| `auto/glm-5.3-flash` | ✅ 200 | 6.48s | `model=group/auto-glm-5-3-flash`，路由组正常落到可用成员 |

前两条 401 **不是配置错**，是密钥占位符被当字面量发出去了——见下。

配置备份（改动前的 providers.json 与 ZCode config.json）：
`~/.config/magpie/auto-backups/nvidia-pre-20261110-235343/`

本次无代码提交；magpie/ZCode 改动都是本机配置文件，不在 git 里。

## 7. 没做成的 / 需要 qi 决定

### ⚠️ 阻塞点：magpie 读不到环境变量里的密钥

任务卡要求「密钥只从环境变量读、不写进任何文件」，但 **magpie 做不到**：

- magpie 的 provider key 只能明文存在 `~/.config/magpie/providers.json`（现有 14 家都是这样）。
- 我实测过占位符：把 key 设成 `${ITERACOMPUTE_API_KEY}` 后跑 `magpie provider test`，magpie **不解析**，把字面量当 Bearer token 发出去 → 401。
- 翻了二进制：`{env:NAME}` 那套正则只用于 MCP 配置，`$env:` 只用于给 Gemini/Cursor 写启动脚本，**provider key 没有环境变量通道**。
- 预设添加还强制要求非空 key（`provider add nvidia key=` 直接报 "needs an API key"），所以连「留空」都加不进去。

**当前状态**：两家供应商的 key 字段是占位符 `${NVIDIA_API_KEY}` / `${ITERACOMPUTE_API_KEY}`（变量名，不是机密，可以留在文件里）。结构、模型、路由、ZCode 全部就位，**但请求一律 401，等于没接通**。

请 qi 选一条：

- **A. 破例把真密钥写进 providers.json**（与现有 14 家一致）。我从环境变量读、只写这一个文件、不打印不提交。最省事，但违反「不写进任何文件」。**需要 qi 明确批准这次破例。**
- **B. 加一个本机注入代理**（推荐，能同时守住规矩和可用性）：起一个只听 127.0.0.1 的小转发进程，从环境变量读密钥并补上 `Authorization` 头；magpie 的 chat 地址指向它，key 字段填任意占位。密钥全程只在环境变量里，不落盘。代价是多一个需要常驻的进程 + 一个不含机密的脚本。要做我就做，但这是新增组件，先等 qi 点头。
- **C. 维持现状**：结构留着，等 qi 想清楚再补密钥。两家备用暂时不生效，GLM 组仍由 zcode/amd/kimi 兜着。

### 其他需要留意的

1. **NVIDIA DeepSeek-V4.1-Flash 不可用**（四次测试 0 字节）。要不要从 magpie 和 ZCode 里摘掉，免得它占着备用位却兜不住？等 qi 决定。
2. **NVIDIA GLM 首字节 114 秒**，即使解决了密钥，也很可能被 agent 超时判死。是否给它单独放宽超时，或干脆只当最后兜底？
3. **Kimi 混进 GLM 组**是跨模型兜底，确认这是想要的。
4. **scnet 仍 off**，要不要打开。
5. IteraCompute 活动到 **2026-11-24 16:00（北京时间）**，到期后这个备用会失效，届时需要复核。