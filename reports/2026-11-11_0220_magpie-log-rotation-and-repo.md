# magpie 代理日志轮转 + 脚本进仓库（第四批）

- 时间：2026-11-11 02:20（+08:00）
- 任务卡：`Qoder-新任务-2026-11-11-第四批.md`（qi 01:45 定的四件事）
- 对象：`D:\软件\magpie\key-proxy\`（本机密钥注入代理，第二批建的 B 方案）
- 前序报告：`2026-11-11_0032_magpie-nvidia-iteracompute.md`、`2026-11-11_0109_magpie-key-proxy.md`、`2026-11-11_0135_magpie-drop-deepseek-glm-last.md`

## 0. 一句话结论

**两件要做的事都做完了，42 项审计全过。** 验收里只有「经网关实发 `iteracompute/qwen3.8-27b` → 200」这一条没拿到——**IteraCompute 上游推理容量从 01:53 起持续故障**，6 次定点重试全部 429/503。这不是本批改动引起的，也不是代理或密钥的问题，第 3.4 节给了五条独立证据（其中 `GET /iteracompute/models` 经同一代理、同一密钥返回 **200 / 29 个模型**，是最硬的一条）。`auto/glm-5.3-flash` 实测 **200**。

qi 明确不做的两件（本地共享令牌、专门重启做冷启动确认）**一件都没做**。

## 1. 任务 1：日志轮转

### 1.1 方案：阈值与保留数

| 项 | 值 |
|---|---|
| 单文件阈值 | **1 MiB = 1048576 字节**（`LOG_MAX_BYTES = 1024 * 1024`） |
| 保留旧文件数 | **3 个**（`LOG_KEEP = 3`）→ `proxy.log.1` / `.2` / `.3` |
| 日志家族总占用上限 | 约 **4 MiB**（当前文件 + 3 个归档） |
| 触发时机 | **写每一行之前**判断：`当前大小 + 本行字节数 > 阈值` 就先轮转再追加 |
| 轮转方式 | rename 链：删 `.3` → `.2`→`.3` → `.1`→`.2` → `proxy.log`→`.1` |
| 编号语义 | `.1` 最新，`.3` 最旧；第 4 轮时最旧的自然被淘汰 |

阈值判断用的是「**加上本行会不会超**」而不是「已经超了没有」，所以单个文件永远不会越过 1 MiB，不会出现最后一行把文件顶过阈值的情况。

**为什么不会丢日志、不会打断正在跑的请求：**

1. 原来的 `log()` 本来就是每行 `fs.appendFileSync`——**每行重新打开文件，没有常驻句柄**。所以轮转用 rename 不会让任何已打开的句柄指向被改名的旧 inode，这是这个方案能成立的前提。
2. 「查大小 → 轮转 → 追加」整段是**同步**的，Node 单线程期间不会有别的日志行插进来，因此不存在两行竞争同一个归档名。
3. `rename` 是原子操作；正在跑的请求持有的是 `res` 对象和上游 stream，**跟日志文件没有任何句柄关系**，轮转碰不到它们。
4. 每个 rename 都单独 `try/catch`，中间某个归档不存在（比如首次轮转时没有 `.2`）也不会中断整条链。

**一个诚实的边界**：rename 之后、append 之前有几微秒 `proxy.log` 不存在，外部 `tail` 类工具理论上可能瞬时看到「文件没了」。代理自身不受影响。我第一版测试脚本正好踩到这个窗口，详见 1.4 末尾。

### 1.2 完整改动（只有这一处，别的一个字节没动）

```diff
 const HOST = "127.0.0.1";
 const PORT = Number(process.env.KEY_PROXY_PORT || 3426);
 const LOG_FILE = path.join(HERE, "proxy.log");
+const LOG_MAX_BYTES = 1024 * 1024;
+const LOG_KEEP = 3;
 const UPSTREAM_TIMEOUT_MS = 30 * 60 * 1000;
 const MAX_BODY_BYTES = 64 * 1024 * 1024;
 const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "OPTIONS", "DELETE"]);
@@
+// Every line reopens the file and the whole check-rotate-append is synchronous,
+// so an in-flight request never sees a half-rotated log and no line is lost.
+function rotateLog() {
+  try { fs.rmSync(`${LOG_FILE}.${LOG_KEEP}`, { force: true }); } catch {}
+  for (let i = LOG_KEEP - 1; i >= 1; i--) {
+    try { fs.renameSync(`${LOG_FILE}.${i}`, `${LOG_FILE}.${i + 1}`); } catch {}
+  }
+  try { fs.renameSync(LOG_FILE, `${LOG_FILE}.1`); } catch {}
+}
+
 function log(line) {
+  const entry = `${new Date().toISOString()} ${line}\n`;
   try {
-    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${line}\n`);
+    let size = 0;
+    try { size = fs.statSync(LOG_FILE).size; } catch {}
+    if (size + Buffer.byteLength(entry) > LOG_MAX_BYTES) rotateLog();
+    fs.appendFileSync(LOG_FILE, entry);
   } catch {}
 }
```

`proxy.mjs` 6793 → **7463 字节**。`node --check` 通过。

审计里有一条最强的检查：**把上面这两个常量和整个轮转块从新文件里剥掉，剩下的必须与备份逐字节相同** → `PASS proxy.mjs diff is EXACTLY the rotation addition, nothing else :: byte-identical after removing rotation`。也就是说监听地址、端口、两个上游域名、四个超时值、body 上限、header 处理、密钥注入逻辑，全都没被顺手改到。

### 1.3 重启：按计划任务拉起（和上一批同一条路径）

| 步骤 | 实测结果 |
|---|---|
| 找到旧进程 | PID **49056**（`Win32_Process` 里 CommandLine 匹配 `*proxy.mjs*`） |
| 停掉并确认端口释放 | 3426 无监听 |
| 拉起 | `Start-ScheduledTask -TaskName 'MagpieKeyProxy'` |
| 任务状态 | `State = Ready`，`LastTaskResult = **0**`，`LastRunTime = 2026/11/11 1:53:02` |
| 无运行时限 | `ExecutionTimeLimit = **PT0S**`（默认 3 天会杀掉长驻代理，第二批已改） |
| 新进程 | PID **42456** |
| 监听面 | `TCP 127.0.0.1:3426  0.0.0.0:0  LISTENING  42456`——**只有这一个**，没有 `0.0.0.0:3426`，没有 `[::]:3426` |

`/health` 原文（02:16 复查仍一致）：

```json
{"ok":true,"host":"127.0.0.1","port":3426,"routes":{"nvidia":{"upstream":"https://integrate.api.nvidia.com/v1","keyPresent":true},"iteracompute":{"upstream":"https://api.iteracompute.com/v1","keyPresent":true}}}
```

**两条路由 `keyPresent` 都是 `true`。** 日志里也留下了新的启动行：

```
2026-11-10T17:53:03.886Z startup host=127.0.0.1 port=3426 nvidia=key-present iteracompute=key-present
```

### 1.4 手动触发轮转验证（没等它自然长到 1MB）

**做法**：往 `proxy.log` 追加带 `# rotation-test cycle=N synthetic-padding (not a request)` 标记的合成行，把它顶过阈值，然后 `GET /health` 让**代理自己**写一行来触发轮转（不是我手动 rename，走的是真实代码路径）。每轮比对归档字节、新文件行数、归档个数与顺序。连跑 **4 轮**，覆盖「1→2→3 个归档递增」和「第 4 轮淘汰最旧」两种情况。

| 轮次 | 触发前日志字节 | `.1` 与触发前逐字节相同 | 新 `proxy.log` 真实行数 | 归档个数 | 出现过 `.4` |
|---|---|---|---|---|---|
| 1 | 1049643 | **是**（1049643 字节全保留） | **恰好 1** | 1 = min(1,3) | 否 |
| 2 | 1049619 | **是** | **恰好 1** | 2 = min(2,3) | 否 |
| 3 | 1049619 | **是** | **恰好 1** | 3 = min(3,3) | 否 |
| 4 | 1049619 | **是** | **恰好 1** | 3（不再增长） | 否 |

每轮新文件都只有 **51 字节**（就是那一条触发用的 health 记录），远低于阈值。四轮保留与顺序检查：

```
PASS  exactly .1 .2 .3 retained  :: proxy.log,proxy.log.1,proxy.log.2,proxy.log.3
PASS  .1 holds newest cycle (4)  :: [4]
PASS  .2 holds cycle 3  :: [3]
PASS  .3 holds cycle 2  :: [2]
PASS  oldest (cycle 1) aged out as designed
PASS  4 real health lines collected, none dropped at a rotation boundary  :: collected=4
PASS  no key-shaped material anywhere in log family

ROTATION TEST PASS
```

**「不丢行」是逐字节证明的**，不是抽样：每轮触发前把整份日志读进内存，轮转后把 `.1` 读出来做全等比对，1049643 / 1049619 字节一个不差。四条真实的 health 记录（每轮触发那条）也全部被收集到，没有一条在轮转边界上消失。

**测试脚本自己踩过一个坑，说明一下免得看输出误判**：第一版轮询只要看到 `.1` 内容等于填充后的日志就立刻去读 `proxy.log`，但 rename 和 append 是**两次系统调用**，正好采样到 1.1 节说的那个空窗口，于是把「文件还没建出来」误报成 FAIL（第 1、4 轮各中一次）。改成「还要等新文件里落下恰好 1 行真实记录」再读，重跑全过。**这是测试脚本的时序问题，不是代理的轮转缺陷**——代理那两次调用之间没有任何 await，真实运行中不存在丢行。

### 1.5 请求进行中轮转（真实流式请求，不是模拟）

任务卡要求「不能打断正在跑的请求」，所以我没有只用 health 这种毫秒级请求验证，而是拿一条**真的会跑 90 多秒**的流式请求来跨轮转：

| 时刻（UTC） | 事件 |
|---|---|
| 17:59:23 前 | 发起 `nvidia/z-ai/glm-5.3-flash` 流式「你好」请求 |
| **17:59:23.884** | 请求**仍在进行中**，把日志顶过阈值并触发轮转（标记 `cycle=99`） |
| 同一时刻 | `netstat` 确认该请求活着：到上游 `2001:2::b6:443` 是 `Established`，回环 `127.0.0.1:3426 ← 57354` 也在 |
| **18:00:45.085** | 该请求正常结束，完成日志写进了**轮转后的新文件**：`nvidia model=z-ai/glm-5.3-flash status=200 ms=91902` |

客户端结果：

```
PASS nvidia/z-ai/glm-5.3-flash HTTP 200 ttfb=3072ms total=91972ms finish=stop
     reasoning_chars=383
SUMMARY 1/1 passed  base=http://127.0.0.1:3425/v1  stream=true
```

**HTTP 200、`finish=stop`、内容完整、日志完整**——轮转既没有打断这条正在跑的请求，也没有丢掉它的记录。台账侧同样对得上：`duration_ms=91930`、`ttft_ms=74912`、`host=127.0.0.1:3426`、`upstream_stop=stop`。

### 1.6 测试数据已清理，日志恢复成真实历史

合成填充和合成归档**全部删掉**了，没有留在生产日志里冒充历史：

```
cleanup: removed synthetic archives; proxy.log restored to 77 real lines, 5557 bytes
  (real before=73, collected during test=4, live=1)
  synthetic padding remaining = NO
  archives remaining = none
```

审计里专门有两条盯着这个 → `PASS no synthetic padding left in proxy.log`、`PASS no rotation archives left from the test`。当前 `proxy.log` 是**连续的真实历史**，从第二批 16:55:51 的首次启动一直到本批的重试记录，中间没有断层、没有假数据。

## 2. 任务 2：新仓库 `hlm428/magpie-key-proxy`

### 2.1 仓库与提交

| 项 | 值 |
|---|---|
| 地址 | **https://github.com/hlm428/magpie-key-proxy** |
| 可见性 | **PUBLIC**（按任务卡） |
| 默认分支 | `main`（新仓库自己的 main，任务卡明确说正常推） |
| 创建时间 | 2026-11-10T18:04:01Z（= 本地 11-11 02:04:01） |
| commit | **`eb3a017`**（完整 SHA 见仓库，`git rev-parse HEAD`） |
| 本地 == 远端 | `git rev-parse HEAD` 与 `origin/main` 完全相同 |
| 改动量 | 4 files changed, 379 insertions |

### 2.2 推了哪几个文件

| 文件 | 字节 | 说明 |
|---|---|---|
| `proxy.mjs` | 7463 | 代理本体，含本批新加的轮转 |
| `launch.vbs` | 488 | 隐藏窗口启动器，**与备份逐字节相同，本批没改** |
| `README.md` | 7115 | 中文说明（新写） |
| `.gitignore` | 33 | **我多加的第 4 个文件**，理由见下 |

`.gitignore` 内容就三行：`proxy.log`、`proxy.log.*`、`startup.out`。

**为什么多加它**：任务卡只点名三个文件，但这是个**公开库**，而工作副本里就躺着运行日志。没有 `.gitignore` 的话，以后任何一次 `git add .` 都可能把 `proxy.log` 推到公网。日志里虽然没有密钥（只有路由/模型名/状态码/耗时），但模型名和调用时间也是本机使用痕迹，不该公开。加这三行是防误提交的最小成本做法。如果你不想要这个文件，说一声我删掉重推。

staging 时是**逐个文件点名 `git add`**，没有用 `git add .` 或 `-A`。

### 2.3 D 盘那份与仓库如何保持一致

**D 盘的 `key-proxy\` 目录本身就是 git 工作副本**，不是「另拷一份进仓库」。所以「D 盘那份和仓库保持一致」是结构上成立的，不需要人工同步：

```
PASS  repo working tree clean (D drive == repo)  :: clean
PASS  local main == origin/main  :: eb3a017
```

以后改脚本就在 D 盘改、commit、push，两边天然一致。

### 2.4 README 写了什么

按任务卡要求的三块都写了，另外补了几处踩过的坑：

- **这是干嘛的**：magpie 把供应商密钥明文存进 `providers.json`，而且**不解析 `${ENV_VAR}` 占位符**（会把字面量当 Bearer 发出去 → 401）。这个代理就是为了「密钥就想要只放环境变量」和「magpie 就想要明文」之间的矛盾而存在的：magpie 里填占位符，代理从环境变量读真密钥补 `Authorization` 头再转发。
- **怎么用**：环境变量名 `NVIDIA_API_KEY` / `ITERACOMPUTE_API_KEY`（另有可选 `KEY_PROXY_PORT`）；监听 `127.0.0.1:3426`；按路径分流 `/nvidia/*` → `https://integrate.api.nvidia.com/v1`、`/iteracompute/*` → `https://api.iteracompute.com/v1`；`/health` 查状态；缺哪个环境变量哪条路由返回 503（不影响另一条）；轮换密钥后要重启代理。
- **密钥不落盘**：启动时从环境变量读进内存 `Map`，不写文件、不写日志、不回显在响应里；日志只有路由/模型名/状态码/耗时；连 `fetch` 抛异常都刻意不记录（异常文本可能引用请求细节）。
- 另补：**安全边界**（只听回环、**没有鉴权**所以本机任何进程都能用它花额度、上游域名硬编码、路径校验拒 `..`/`.`/控制字符、方法白名单、64 MiB body 上限）；**流式与超时**（四个超时值全列出来，写明 NVIDIA GLM 首 token 实测要等约 110 秒，**不要给这条链路设短超时**；以及 Node `fetch` 会自动解压所以必须剥掉 `content-encoding`/`content-length` 这个坑）；**日志与轮转**（本批新加，阈值/保留数/同步不丢行的理由）；**开机自启**（为什么用计划任务而不是 HKCU Run 键、`PT0S` 为什么必须、VBS 为什么不能含非 ASCII 字面量、完整的 `Register-ScheduledTask` PowerShell 片段、以及 VBS  detached 启动导致崩溃后无法靠 `RestartCount` 复活这个限制）；**`D:\node.exe` 是硬编码路径，换机器要改这一行**。

### 2.5 推前推后各扫一遍（正则 + 字面量，只输出 pass/fail）

| 扫描 | 覆盖 | 结果 |
|---|---|---|
| 推之前扫工作文件 | `proxy.mjs`、`launch.vbs`、`README.md`、`.gitignore` | **REPO FILE SCAN PASS (0 failures)** |
| 推之后扫**已提交的树** | `git ls-tree -r --name-only HEAD` 逐个 `git show HEAD:<f>` | **COMMITTED TREE SCAN PASS (0 failures)** |

两遍都是**双保险**：9 条正则（`nvapi-`、`ick_`、`sk-`、`ak[_-]`、`rc-`、`tp-`、`gho_`、`github_pat_`、`[a-f0-9]{40,}`）**加上**把两把真密钥从用户环境变量读进内存做**字面量包含比对**。只输出 pass/fail 与长度 **81 / 70**，不输出值。另确认**没有任何 `proxy.log*` 被跟踪**：

```
PASS  repo tracks exactly the 4 intended files  :: .gitignore, README.md, launch.vbs, proxy.mjs
PASS  no log tracked in repo
```

扫已提交的树这一步是必要的——工作文件干净不代表 commit 干净（比如误 stage 了别的东西）。两遍都过才算数。

## 3. 任务 3：验证

### 3.1 `/health` 与网关自身

- 代理 `/health` → `ok:true`，两条路由 `keyPresent` 均 `true`，`host=127.0.0.1`、`port=3426`（原文见 1.3）
- 网关 `GET /v1/models` → **HTTP 200，21 条**；`auto/glm-5.3-flash` 在、`iteracompute/qwen3.8-27b` 在、`nvidia/deepseek-ai/deepseek-v4.1-flash` **不在**（第三批摘掉的状态保持住了）

### 3.2 经网关实发「你好」

`POST http://127.0.0.1:3425/v1/chat/completions`，body 由 Node 生成的 UTF-8 `{"model":…,"messages":[{"role":"user","content":"你好"}],"max_tokens":512,"stream":false}`。

| 模型 | 结果 | 总耗时 | 返回内容 | tokens / cost |
|---|---|---|---|---|
| `auto/glm-5.3-flash` | **HTTP 200** | 40.99s | 「你好！很高兴见到你。我是Z.ai训练的GLM大语言模型，随时准备为你提供帮助。我可以回答问题、进行对话或协助你完成各种语言任务。有什么我能帮你解答或探讨的话题吗？」 | prompt 13 / completion 272（推理 225）/ cost 0.00015596 |
| `iteracompute/qwen3.8-27b` | **未通过：429 / 503** | 14–24s | 上游错误体，见 3.4 | — |

**1/2 通过。** 另外流式那条 `nvidia/z-ai/glm-5.3-flash` 在 1.5 节的跨轮转测试里也是 **200 / finish=stop**，算是额外的一次实发证据。

### 3.3 路由组落到谁身上（`magpie usage --csv` 实证）

不只看 200，还查了 magpie 自己的台账：

| requested_model | provider | host | served_model | status | duration_ms | tries |
|---|---|---|---|---|---|---|
| `group/auto-glm-5-3-flash` | **amd** | developer.amd.com.cn | `self-dploy/GLM-5.3-Flash` | 200 | 40947 | **2** |
| `iteracompute/qwen3.8-27b` | iteracompute | **127.0.0.1:3426** | `qwen3.8-27b` | 429 / 503 | 14208–23900 | 3–4 |
| `nvidia/z-ai/glm-5.3-flash`（1.5 节流式） | nvidia | **127.0.0.1:3426** | `z-ai/glm-5.3-flash` | 200 | 91930 | — |

- `tries=2` + provider 明确是 `amd`：第三批定的新顺序（scnet(off) → zcode → amd → kimi → nvidia）**仍在生效**，这次也没走到末位的 nvidia。
- 两条走代理的记录 `host` 都是 `127.0.0.1:3426`：**B 方案链路没被本批改动破坏**。

### 3.4 IteraCompute 为什么没通：上游容量故障，不是代理/密钥

这条验收我拿不到 200，但**不能就这么写成「失败」了事**，所以做了五条独立诊断：

1. **错误体是上游自己的话**，不是代理生成的：`{"message":"IteraCompute capacity is temporarily exhausted","type":"rate_limit_error","code":"provider_rate_limit"}` 与 `{"message":"IteraCompute service is temporarily unavailable","type":"api_error","code":"provider_api_error"}`。代理只会原样透传上游响应体，它自己不产这种文案。
2. **状态是 429/503，不是 401** → 注入的密钥**被上游接受了**。密钥错的话会是 401。
3. **绕过 magpie 直接打代理** `/iteracompute/chat/completions`，拿到**同样的上游错误体** → 不是 magpie 的问题。
4. **换成上游的 `Auto` 模型也 429**（日志 `18:02:34.447Z iteracompute model=Auto status=429`）→ 不是 `qwen3.8-27b` 这一个模型的问题，是平台级容量。
5. **最硬的一条**：`GET /iteracompute/models` 经代理 → **HTTP 200，4.84s，返回 29 个模型，其中确实有 `qwen3.8-27b`**。这条走的是**同一把注入密钥、同一个代理、同一个上游域名**，只是不消耗推理容量。它 200 就同时证明了：密钥有效、代理转发正常、上游网络可达。挂的只有 chat 推理容量这一块。

**时间线**：第三批 01:32 实测这条还是 **200 / 8.64s / cost 0**；本批 01:53 重启后开始持续 429/503。定点重试 6 次全失败：

|  attempt | 本地时间 | 结果 |
|---|---|---|
| 1 | 02:05:07 | 503 service temporarily unavailable |
| 2 | 02:06:54 | 429 capacity temporarily exhausted |
| 3 | 02:08:39 | 429 |
| 4 | 02:10:33 | 503 |
| 5 | 02:12:18 | 429 |
| 6 | 02:14:06 | 429 |

429 与 503 交替出现，符合上游容量打满后在「限流」和「不可用」之间摆动的表现。**结论：本批改动没有破坏 IteraCompute 链路，这一条验收要等上游恢复才能拿到 200。** 我另开了一个 3 分钟间隔、最多 8 次的后台观察（02:17 起），恢复了就补测并把结果补进本报告。

### 3.5 审计：42 项，全过

```
PASS  provider count still 16
PASS  nvidia models still only GLM (batch-3 state kept)
PASS  nvidia chat still the proxy / iteracompute chat still the proxy
PASS  keys still placeholders
PASS  nvidia knobs untouched / iteracompute knobs untouched
PASS  group order still scnet,zcode,amd,kimi,nvidia
PASS  routing still order / scnet still off
PASS  providers.json deep-equals post-batch-3 expectation (batch 4 changed nothing)
PASS  ZCode still 21 model entries / nvidia deepseek still absent / baseURL still gateway
PASS  ZCode config deep-equals post-batch-3 expectation (batch 4 changed nothing)
PASS  launch.vbs byte-identical to pre-batch-4
PASS  listen host still 127.0.0.1 / port still 3426
PASS  nvidia upstream unchanged / iteracompute upstream unchanged
PASS  upstream timeout still 30min (not widened) / requestTimeout still 0 (not widened)
PASS  headersTimeout still 60s / keepAliveTimeout still 75s / body cap still 64MiB
PASS  no shared token / auth added (qi said don't)
PASS  rotation threshold is 1 MiB / rotation keeps 3 archives
PASS  proxy.mjs diff is EXACTLY the rotation addition, nothing else
PASS  /health ok / both routes keyPresent=true / reports loopback only
PASS  exactly one 3426 listener, on 127.0.0.1 only
PASS  no synthetic padding left in proxy.log / no rotation archives left from the test
PASS  log lines all have the expected shape / log has no key-shaped material
PASS  no key material in any local file (regex + literal)  :: clean
PASS  literal scan armed  :: K1len=81 K2len=70
PASS  repo working tree clean (D drive == repo) / local main == origin/main
PASS  repo tracks exactly the 4 intended files / no log tracked in repo

AUDIT PASS (0 failures)
```

其中「**deep-equals 第三批预期状态**」这两条是关键：我把第三批开工前的备份读进来，只施加第三批那两处已知改动（nvidia `models` 数组、group `members` 顺序），得到的结果必须与当前 `providers.json` **完全相等**；ZCode 同理。这就证明了**本批对 magpie 和 ZCode 配置是零改动**，不是「我看着觉得没改」。

密钥扫描仍是双保险，覆盖 8 份本地文件（`proxy.mjs`、`launch.vbs`、`README.md`、`.gitignore`、`proxy.log`、`providers.json`、ZCode 两个文件），全部 clean。

## 4. 验收标准对照

- [x] `proxy.log` 已有轮转（**阈值 1 MiB / 保留 3 个**，写进报告了），手动触发验证通过（4 轮 + 一次真实请求进行中轮转）
- [x] 新仓库 `hlm428/magpie-key-proxy` 已建，`proxy.mjs`、`launch.vbs`、`README.md` 已推（另加 `.gitignore`），扫描无密钥（推前推后各一遍，均 PASS）
- [x] 代理重启后 `/health` 正常，两条路由 `keyPresent` 均 `true`
- [x] 经网关实测 `auto/glm-5.3-flash` → **200**
- [ ] 经网关实测 `iteracompute/qwen3.8-27b` → 200 —— **被上游容量故障挡住，6 次重试全 429/503**；代理与密钥有独立证据证明正常（3.4），后台观察中
- [x] 验证结果逐条写回，报告推 `qoder-inbox`，不碰 `main`

## 5. 需要 qi 知道的

1. **IteraCompute 上游挂了，Qwen 那条验收暂时拿不到 200。** 不是本批改动引起的（第三批 01:32 还是 200 / 8.64s / cost 0），也不是代理或密钥问题（`/models` 经同一代理同一密钥返回 200 / 29 个模型）。我开了后台观察，恢复了就补测。**要不要我一直盯到恢复为止，还是这批先结、恢复后单独补一条？**
2. **多加了一个 `.gitignore`**（任务卡只点名三个文件）。公开库必须挡住 `proxy.log` 被误提交。不想要的话我删掉重推。
3. **自然轮转大概几年才会发生一次**：现在每行约 70 字节、每天几十条，长到 1 MiB 需要很久。所以手动触发验证是必要的，不能靠等——这也是任务卡让我造大文件的原因，我造了 4 轮。
4. **没有加本地共享令牌**（按你 01:45 的决定）。审计里专门有一条确认没引入任何 token/auth 标识。所以代理仍然是「本机任何进程都能用它花额度」，README 的安全边界一节把这点明写了，没有粉饰。
5. **没有专门重启电脑做冷启动确认**（按你的决定）。计划任务本身这批实测拉起成功（`LastTaskResult=0`），但「登录触发」这条路径的冷启动仍待你下次重启时顺手看一眼。
6. **`launch.vbs` 一个字节都没改**（sha256 与备份相同）。它里面硬编码了 `D:\node.exe`，README 把这个前提写清楚了，换机器要改那一行。
7. **密钥红线**：本批所有产物（`proxy.mjs` / `launch.vbs` / `README.md` / `.gitignore` / `proxy.log` / 本报告 / 新仓库工作文件 / 新仓库已提交树）都过了正则 + 字面量双重扫描，全部 clean。两把密钥仍然只在用户环境变量和代理进程内存里，长度 81 / 70。
8. **`yuejian` 的 `main` 全程没碰**，仍是 `2dbd14bb`（推前推后各查一次，一致）。推之前发现 `qoder-inbox` 远端已经多了两条云笙发音的报告（`d174b1d`、`2029e6b`），我先 fast-forward 到 `2029e6b` 再加自己的报告，没有覆盖别人的东西。
9. **测试客户端那个已知小毛病仍在**：Node 在 Windows 上跑完打印 SUMMARY 之后偶发 libuv 断言（`src\win\async.c` line 94）导致非零退出码。测试结果本身有效，事后复查代理 `/health` 与网关都正常。这是测试脚本所在运行时的问题，不是 magpie 或代理的问题。

## 6. 备份与回滚

- 备份目录：`~/.config/magpie/auto-backups/proxy-pre-batch4-20261111-0147/`
  - `proxy.mjs` 6793 字节（轮转前）、`launch.vbs` 488 字节、`proxy.log` 1145 字节
- **回滚轮转**：把备份的 `proxy.mjs` 拷回 `D:\软件\magpie\key-proxy\`，重启计划任务即可（`Stop-Process` 旧 PID → `Start-ScheduledTask MagpieKeyProxy`）。日志格式没变，旧版本能继续追加同一个文件。
- **回滚仓库**：`git revert eb3a017`（不要 force push）。
- **magpie / ZCode 配置本批零改动**，无需回滚（审计用 deep-equal 证明）。