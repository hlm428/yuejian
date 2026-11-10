# magpie 密钥本机注入代理（B 方案）已完成

对应任务：`Qoder-新任务-2026-11-11-第二批.md`（qi 00:40 选定 B 方案）。上一批报告见 `2026-11-11_0032_magpie-nvidia-iteracompute.md`。

**结论**：代理已起、只听回环、密钥全程只在环境变量与内存里；magpie 两家已指向代理；经网关三条验证全部 200；重启 magpie + 代理后复测仍全部 200；21 项审计全过，**任何文件里都没有密钥**。

---

## 1. 代理怎么做的

**位置**：`D:\软件\magpie\key-proxy\`（与 magpie 同级，非仓库目录）

| 文件 | 作用 | 含机密 |
|---|---|---|
| `proxy.mjs` | 代理本体，Node 原生 `http` + `fetch`，无第三方依赖 | 否 |
| `launch.vbs` | 隐藏窗口启动器（`WshShell.Run(..., 0, False)`） | 否 |
| `proxy.log` | 运行日志，只有路由/模型名/状态码/耗时 | 否（已扫描） |

**监听**：`127.0.0.1:3426`，**只绑回环**。netstat 实证：
```
TCP    127.0.0.1:3426    0.0.0.0:0    LISTENING    49056
```
没有 `0.0.0.0:3426`，也没有 `[::]:3426`，公网访问不到。

**分流**：单端口按路径分流（比双端口简单，magpie 侧只需改 chat 地址）

| 路径前缀 | 转发目标 | 密钥来源 |
|---|---|---|
| `/nvidia/*` | `https://integrate.api.nvidia.com/v1/*` | 环境变量 `NVIDIA_API_KEY` |
| `/iteracompute/*` | `https://api.iteracompute.com/v1/*` | 环境变量 `ITERACOMPUTE_API_KEY` |
| `/health` | 不转发，返回各路由 `keyPresent` 布尔值 | — |

**密钥处理**：启动时从 `process.env` 读进内存 `Map`，之后全程只在内存。请求进来时**覆盖** `Authorization` 头为真密钥，并把 magpie 传来的占位符丢掉。密钥不写盘、不进日志、不进任何响应体。某条路由的密钥缺失时该路由返回 503 并说明缺哪个变量名，另一条照常工作，不会整个崩掉。

**流式**：上游响应用 `Readable.fromWeb(upstream.body).pipe(res)` 直通，不缓冲；`res.flushHeaders()` 立刻把头发给客户端，所以首字节不被代理拖延。

**超时（按任务要求放宽）**：
- `server.requestTimeout = 0`（关掉 Node 默认 5 分钟整体超时）
- 上游 fetch 超时 **30 分钟**
- `headersTimeout` 60s、`keepAliveTimeout` 75s
- 客户端断开时 abort 上游请求，不留悬空连接

实测 NVIDIA GLM 整条链路跑到 **135 秒**仍然 200 正常收尾，代理没有先断。

**两个容易踩的坑，已处理**：
1. Node 的 `fetch` 会**自动解压** gzip/br，但保留上游的 `content-encoding` 头。若照抄该头，客户端会二次解压报错。代理剥掉响应的 `content-encoding` 与 `content-length`，交给 Node 重新分块。请求侧也剥掉 `accept-encoding`，让上游回 identity。
2. 路径校验：拒绝 `..`/`.` 段、控制字符、不以 `/` 开头、以 `//` 开头的路径；方法白名单 GET/HEAD/POST/OPTIONS/DELETE；请求体上限 64MB。上游主机名写死在路由表里，请求方无法把转发指向别的主机。

**日志样例**（真实内容，无任何密钥）：
```
2026-11-10T17:04:39.800Z startup host=127.0.0.1 port=3426 nvidia=key-present iteracompute=key-present
2026-11-10T17:06:12.431Z iteracompute model=qwen3.8-27b status=200 ms=13021
2026-11-10T17:08:03.226Z nvidia model=z-ai/glm-5.3-flash status=200 ms=135244
```
上游 fetch 抛异常时**故意不记异常对象**（它可能引用请求细节），只记 `status=502`。

## 2. 开机自启怎么做的

**机制：Windows 计划任务**（没用启动项，原因见下）

| 项 | 值 |
|---|---|
| 任务名 | `MagpieKeyProxy` |
| 触发器 | `MSFT_TaskLogonTrigger` — 用户 `jiaai` 登录时 |
| 主体 | `jiaai` / `Interactive` / `Limited`（非管理员，仅登录时运行） |
| 动作 | `wscript.exe "D:\软件\magpie\key-proxy\launch.vbs"` |
| 执行时限 | `PT0S` = **无限制** |
| 其他 | Hidden、StartWhenAvailable、电池下不停、失败重试 3 次/间隔 1 分钟 |

`launch.vbs` 用 `WScript.ScriptFullName` 在运行时推导自身目录，**脚本里没有任何非 ASCII 字面量**——中文路径 `软件` 由 Windows 原生 Unicode 传入，绕开了 VBS/控制台的代码页坑。它再以窗口样式 0（隐藏）拉起 `D:\node.exe proxy.mjs`，登录时不会弹黑框。

**为什么不用 HKCU Run**：我一开始写的是 Run 键，但 Run 键由 Explorer 拉起，而 Explorer 的环境是本次登录时建立的快照，**无法在不注销的前提下证明它能读到 setx 之后的新变量**。计划任务由任务计划服务以用户令牌新建环境块（含 `HKCU\Environment`），可以当场实测。所以改用计划任务，并**已删除**那条 Run 键，避免双重启动。

**执行时限必须设 PT0S**：计划任务默认 3 天后强杀进程，代理是常驻服务，不改这条三天后就没了。

### 自启实测（关键证据）

1. 手动起的代理（PID 19744）→ `Stop-Process` 杀掉 → 确认 3426 端口空闲。
2. `Start-ScheduledTask -TaskName MagpieKeyProxy` 拉起。
3. `GET /health` 返回：
```json
{"ok":true,"host":"127.0.0.1","port":3426,
 "routes":{"nvidia":{"upstream":"https://integrate.api.nvidia.com/v1","keyPresent":true},
           "iteracompute":{"upstream":"https://api.iteracompute.com/v1","keyPresent":true}}}
```
**两条路由 `keyPresent` 都是 `true`**。这一步是真正的证明：我没有给这个进程手动注入任何环境变量，它完全由计划服务以用户身份新建环境拉起，却读到了 qi 用 `setx` 存的两把密钥。登录触发走的是同一条路径，所以开机自启后密钥同样可读。

### 关于「重启电脑」

任务卡允许「重启一次电脑（**或至少重启 magpie + 代理进程**）」，我做的是后者：

- 代理进程：杀掉 → 由计划任务重新拉起（上面第 2 步）
- magpie：`Stop-Process`（PID 15084）→ 确认网关 `http=000` → `magpie tray` 重起 → 网关 `http=200`
- 两个服务都重启后，三条网关验证**重新跑了一遍，全部通过**（见第 4 节）

**没有真的重启整台电脑**——那会连带杀掉 Qoder 本身、中断这次会话，属于影响面很大的动作，任务卡也给了替代路径，所以我选了替代路径并如实说明。如果 qi 要一次真实冷启动的确认，说一声我配合，或者 qi 自己重启后跑一遍第 4 节那三条即可。

**一个已知局限**：VBS 拉起 node 后自己就退出了，计划服务看到的是「动作已完成」，所以 `RestartCount` 那 3 次重试**管不到 node 崩溃**的情况。登录自启是覆盖的，进程崩溃自愈不是。要崩溃自愈得让计划任务直接跑 node（代价是登录时可能弹控制台窗口），qi 要的话我改。

## 3. magpie 改了哪几行

**只改了两个供应商的 chat 地址，别的一律没动。**

| 供应商 | 字段 | 改前 | 改后 |
|---|---|---|---|
| `nvidia` | `chat` | `https://integrate.api.nvidia.com/v1` | `http://127.0.0.1:3426/nvidia` |
| `iteracompute` | `chat` | `https://api.iteracompute.com/v1` | `http://127.0.0.1:3426/iteracompute` |

用的命令：
```
magpie provider set nvidia url=http://127.0.0.1:3426/nvidia
magpie provider set iteracompute url=http://127.0.0.1:3426/iteracompute
```

**key 字段保持占位符不变**：`${NVIDIA_API_KEY}` / `${ITERACOMPUTE_API_KEY}`（变量名，非机密）。magpie 仍然把占位符当 Bearer 发出来，代理在转发前覆盖掉，所以 magpie 那边不需要知道真密钥。

**逐项 JSON 对比备份确认**（备份：`~/.config/magpie/auto-backups/nvidia-pre-20261110-235343/`）：
- 原有 14 家供应商：`changed = NONE`，`removed = NONE`
- 路由组 `auto/glm-5-3-flash`：成员顺序、`routing=order` 全部原样
- `scnet` 仍在 `off` 列表里，没碰
- Kimi 仍在末位，没碰
- `nvidia/deepseek-ai/deepseek-v4.1-flash` 仍注册着，没摘
- 上一批设的 `rpm=40`、`rest-cap=1m`、`patience=off`、`at-once=1`、`queue=1/60s`、`list=off`、Qwen 的 `128k/8192` 全部保留
- ZCode 仍 `baseURL=http://127.0.0.1:3425`，三个模型条目都在，不直连

## 4. 端到端验证（逐条实测返回）

统一请求：`POST http://127.0.0.1:3425/v1/chat/completions`，body 为 Node 生成的 UTF-8 `{"model":…,"messages":[{"role":"user","content":"你好"}],"max_tokens":512,"stream":…}`。

### 4.1 重启前

| 模型 | 方式 | 结果 | 首字节 | 总耗时 | 返回内容 / 备注 |
|---|---|---|---|---|---|
| `iteracompute/qwen3.8-27b` | 非流式 | **HTTP 200** | — | 10.24s | 「你好！有什么我可以帮你的吗？」completion 40（推理 29），**cost 0** |
| `auto/glm-5.3-flash` | 非流式 | **HTTP 200** | — | 7.54s | GLM 正常自我介绍，路由组落到可用成员，cost 0.00008484 |
| `nvidia/z-ai/glm-5.3-flash` | **流式** | **HTTP 200** | 3.05s | **113.27s** | 「你好！很高兴见到你。我是 GLM，Z.ai 训练的大语言模型…」`finish_reason=stop` |

**上一批的 401 已消失**：IteraCompute 从 `invalid_api_key` 变成 200，NVIDIA 从 `Invalid JWT serialization` 变成 200。

### 4.2 重启 magpie + 代理之后（复测）

| 模型 | 方式 | 结果 | 首字节 | 总耗时 | 返回内容 / 备注 |
|---|---|---|---|---|---|
| `iteracompute/qwen3.8-27b` | 非流式 | **HTTP 200** | — | 13.03s | 「你好！👋 很高兴见到你。有什么我可以帮你的吗？」completion 56（推理 37），**cost 0** |
| `auto/glm-5.3-flash` | 非流式 | **HTTP 200** | — | 17.26s | GLM 正常回复，cost 0.00016436 |
| `nvidia/z-ai/glm-5.3-flash` | **流式** | **HTTP 200** | 3.05s | **135.27s** | 回复正常，`finish_reason=stop` |

### 4.3 绕过 magpie、直接打代理（确认注入本身没问题）

| 目标 | 方式 | 结果 | 首字节 | 总耗时 |
|---|---|---|---|---|
| `127.0.0.1:3426/iteracompute` + `qwen/qwen3.8-27b` | 非流式 | 200 | — | 12.48s（cost 0） |
| `127.0.0.1:3426/nvidia` + `z-ai/glm-5.3-flash` | 流式 | 200 | 74.58s | 84.65s |

### 4.4 审计（21 项，全过）

```
PASS  no key material in proxy.mjs / launch.vbs / proxy.log / providers.json / config.json
PASS  original 14 providers unchanged (changed=NONE) / none removed
PASS  nvidia + iteracompute chat points at loopback proxy
PASS  nvidia + iteracompute key is a placeholder, not a secret
PASS  group order unchanged / routing still order / scnet still off / DeepSeek still registered
PASS  ZCode still routes via magpie / has all three model entries
PASS  proxy listens only on 127.0.0.1
PASS  autostart task registered (state=Ready)
AUDIT PASS (0 failures)
```

密钥扫描是**双保险**：既用正则匹配 `nvapi-…` / `ick_live_…` 形态，也把两把真密钥从注册表读进内存做**字面量包含比对**（只输出 pass/fail，不输出值）。五个文件全部 clean。

## 5. 验收标准对照

- [x] 本机注入代理已起，只听 127.0.0.1，从环境变量读密钥，脚本和日志里无任何密钥
- [x] magpie 的 NVIDIA 和 IteraCompute 已指向代理，其他 14 家零改动
- [x] 经网关实测：`iteracompute/qwen3.8-27b` 200、`nvidia/z-ai/glm-5.3-flash` 流式 200、`auto/glm-5.3-flash` 200
- [x] 重启后代理自启、验证仍通过 —— **按任务卡允许的「重启 magpie + 代理进程」路径做的，未整机重启**，自启能力另用计划任务实拉 + `keyPresent=true` 证明（见 2 节）
- [x] 验证结果逐条写回，报告推 qoder-inbox，不碰 main

## 6. 需要 qi 知道 / 决定的

1. **NVIDIA GLM 仍然很慢**：整条链路 113–135 秒。magpie 这一段撑住了（不需要改它的超时），但**下游 agent（ZCode 等）自己的超时未必撑得住**，很可能在拿到完整回复前就判失败。这是模型侧的特性，代理解决不了。要不要给它单独放宽 agent 超时，或只当最后兜底，qi 定。
2. **NVIDIA DeepSeek 仍判不可用**：上一批四次测试全 0 字节，本批按指示没摘、也没再花 5 分钟重测。它占着备用位但兜不住，要不要摘 qi 还没定。
3. **代理与 magpie 之间没有鉴权**：magpie 的 key 字段是占位符，代理只靠「只听回环」来限制访问。这意味着**本机任何进程**都能通过这个代理用到 qi 的密钥额度。这是 B 方案的固有取舍（任务卡也指定 key 字段填任意占位）。要收紧可以加一个本地共享令牌，但那个令牌又得写进 providers.json，等于把「不落盘」的范围从 API 密钥扩大到本地令牌——需要 qi 明确要不要。
4. **轮换密钥后要重启代理**：密钥是启动时读进内存的。qi 以后 `setx` 换新密钥，需要 `Stop-ScheduledTask` + `Start-ScheduledTask`（或重启电脑）才生效。
5. **代理脚本没有进任何仓库**：收件箱分支按 README 规定「只放沟通文件，不放代码」，main 又必须 qi 明确要求才推。脚本本身不含机密、可以进仓库，qi 想放哪个仓库说一声我推。目前只在 `D:\软件\magpie\key-proxy\`。
6. **日志会一直增长**：`proxy.log` 是追加写，每请求一行，量很小（目前 12 行），暂时没做轮转。要轮转我加。
7. **IteraCompute 活动 2026-11-24 16:00（北京时间）到期**，到期后这条备用会失效，届时需复核。

## 7. 提交与备份

- 本报告提交在 `qoder-inbox` 分支，**main 未碰**。
- 本批无代码提交（代理脚本在本机非仓库目录，见第 6 节第 5 条）。
- magpie 配置改动前的备份仍在：`~/.config/magpie/auto-backups/nvidia-pre-20261110-235343/`
- 回滚方式：`magpie provider set nvidia url=https://integrate.api.nvidia.com/v1` 与 `magpie provider set iteracompute url=https://api.iteracompute.com/v1` 即可退回直连（但会退回 401，因为密钥仍未落盘）；要彻底停掉代理就 `Stop-ScheduledTask -TaskName MagpieKeyProxy` 并结束 node 进程、删除该任务。