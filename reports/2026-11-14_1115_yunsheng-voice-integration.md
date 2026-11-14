# 云笙 34 句配音接入游戏——接手核查 + 全量测试报告

日期：2026-11-14（北京时间）。本单按 qi 2026-11-14 任务卡执行（Qoder 旧单作废，以本单为准）。

## 结论（一句话）

**接入已在本地完成并提交过，本次未重做、未新改任何游戏代码；按卡片「已经做完了：不重做，直接跳到测试」执行，全部测试通过。** main 仍未推送（按规矩等 qi 发话）。

## 接手时查了什么

- 读了 `HANDOFF.md`、`docs/GAME_SPEC.md`、`docs/CHANGELOG.md`，按仓库规矩办。
- `git log` / `git status`：`00b9195` 之后本地 main 上已有两笔「配音接入游戏」提交，工作区干净：
  - `613a800` feat: 阶段 B 云笙 34 句定稿配音接入 401 房间（文字触发播放）——只加 `YUNSHENG_VOICE` 映射 + `playLineVoice/stopVoice`，钩在 `showBubble`（点按/喂食/聊天）与 `renderDialog`（剧情）两处、`goExterior` 出房间停声；`js/app.js` +66 行，画面/布局/动画/台词文字/数值/存档零改动。
  - `337cc86` feat: 书热点「凶手太蠢了。」借 chat_08 整句发声（qi 选定）——映射加 1 条别名，`js/app.js` +4 行。
- 因此按卡片第二条路线：不重做，直接测试。

## 本地提交号（均为本地，未推任何远端）

| 提交 | 内容 |
| --- | --- |
| `613a800` | 34 句接入 401 房间（本单主体，卡片第 1–4 条全在此实现） |
| `337cc86` | 书热点别名 → chat_08（qi 2026-11-11 选定） |
| `00b9195` / `905d43d` / `f98d358` / `690967c` | qi 认可的发音重配与全量配音入库（本单之前已完成） |

本次测试与报告**没有新增游戏代码提交**（没有要修的东西）。

## 每类触发对应哪些句（34 句 = 10+10+10+4）

映射表在 `js/app.js` 的 `YUNSHENG_VOICE`（键 = 台词原文一字不差 → `assets/voice/yunsheng/<id>.mp3`）：

| 触发类 | 游戏入口 | 句 |
| --- | --- | --- |
| 点按 10 | 5 个点按区（头/脸/垂手/左肩/右肩，每区 2 句） | poke_head_1/2、poke_face_1/2、poke_hand_1/2、poke_shoulder_l_1/2、poke_shoulder_r_1/2 |
| 聊天 10 | 底部「聊天」钮，抽中即播 | chat_01–chat_10（chat_02「楼道那只猫又来了。」needCat，猫上线后生效） |
| 喂食 10 | 底部「喂」→ 黑咖啡/猫罐头/甜食/面包 | feed_coffee_1/2/3（黑咖啡）、feed_catcan_1/3（猫罐头，feed_catcan_2 needCat）、feed_sweets_1/2/3（甜食）、feed_bread_1（面包） |
| 咖啡剧情 4 | 「一起」→ 深夜送咖啡 | scene_coffee_open（「放那儿吧。」）、scene_coffee_choice_a / choice_b（二选一两支回复，每次演出只出其一支）、scene_coffee_end（「……还算合口味。」） |

另：书热点短句「凶手太蠢了。」不在 34 句定稿内，按 qi 选定借 chat_08 整句（别名键，34 个文件无一重复占用）。

## 测试结果

### 1. 仓库既有测试（仓库根目录，node）

| 测试 | 结果 |
| --- | --- |
| `node tests/test_voice.js`（配音接入断言，613a800 新增） | **117 通过，0 失败** |
| `node tests/smoke_phase_a.js`（冒烟） | **180 通过，0 失败** |
| `node tests/test_lights.js`（亮灯） | **44 通过，0 失败** |

### 2. 浏览器实测（Playwright + Edge 无头，本地静态 HTTP，时钟拨到当晚 19:30 使 401 亮灯；25 项断言全过）

**四类触发各试一次：有声、不重叠**——

- 点按：气泡「无聊。」→ `poke_head_1`，播放中 `currentTime` 实测前进（0 → 0.314s），真在放。
- 聊天：立刻顶掉点按那句——`src` 已切到新句、`currentTime` 归零、新句正常起播；又抽到长句 chat_08（3.8s）播放中再点按，同样立即停旧起新。
- 喂食：黑咖啡 → 「……放那儿吧。」→ `feed_coffee_1` 有声。
- 咖啡剧情：一次演出走 A 支，`scene_coffee_open` / `scene_coffee_choice_a` / `scene_coffee_end` 三句全有声；清档重演走 B 支，`scene_coffee_choice_b` 有声（四句全覆盖）。
- 不重叠机制实证：全程 `window.Audio` 实例始终只有 **1 个**（全局复用，播新句 = 换 src + 归零，旧播放自然中断）；出房间 `goExterior` 也会 `stopVoice`。
- 书热点别名：点推理小说，文字「凶手太蠢了。」不改，chat_08 整句出声。

**缺文件静音（临时改名测试，测完已改回）**——

- 把 `chat_01.mp3` 改名 `.bak` 后：抽到「今天的报告写了六千字。」，气泡文字正常显示，音频静默跳过（audio error 状态被 `catch` + `play().catch` 吞掉），**无 JS 异常、无弹窗、游戏不卡**，之后点按其他句照常出声。
- 网络层有且仅一条该文件的 404（资源缺失的客观记录，浏览器网络面板可见；游戏 JS 层零报错）。
- 文件已改回，sha256 前后一致（`0f05a424e313d55d…` 前 16 位），恢复后该句照常有声。

**全程**：无未捕获 JS 异常（pageerror=0）、无 alert/confirm 弹窗、无 JS 来源 console.error；mp3 请求 23 次 200、1 次 404（即上面那条改名测试）。

**画面未动的证据**：`613a800`/`337cc86` diff 只有 `js/app.js`、`tests/test_voice.js` 与 mp3 文件，`css/`、`index.html`、`data/`、立绘与背景 PNG 一字未碰；冒烟 180 条（含点按区/卡片/布局断言）全绿佐证。

![点按触发播放中](../shots/2026-11-14_yunsheng-voice-poke.png)

## 没推 main 的本地提交（gh/main = `2dbd14b`，本地领先 9 笔）

```
337cc86 feat: 书热点「凶手太蠢了。」借 chat_08 整句发声（qi 选定）
613a800 feat: 阶段 B 云笙 34 句定稿配音接入 401 房间（文字触发播放）
00b9195 chore: qi 全部认可云笙 34 句配音（含痒。原音频），全部保留
905d43d chore: 记录 qi 认可发音重配 7 句，痒。保留原音频不改台词
f98d358 fix: 云笙配音发音核查后重配 7 句错读台词
690967c feat: 云笙统一设置全量配音入库（34 句，保留已认可五句）
25a94d2 test: 云笙统一节奏五句试音及未达标记录
85fd4c9 fix: 云笙配音按 qi 定稿全量重配（节奏调整，旧版作废）
00f3320 feat: 云笙配音素材入库（MiMo voiceclone 34 句 + 声线种子 + 台词 json）
```

按规矩这 9 笔都不推，qi 说推再推（推送时按 HANDOFF 第六条先跑 entire review 再双推）。

## 没做成 / 限制（如实报）

- 「有声」判定在无头浏览器里：音频解码播放管线真实走通（`currentTime` 前进、HTTP 200、无报错），但**音色听感最终以 qi 试听为准**（34 句 qi 已全部认可过，入库文件即认可版本，未重生成）。
- needCat 两句（chat_02、feed_catcan_2）猫玩法上线前抽不到，未触发实测；映射键与文件都在位，文字一出现即播，机制与已实测的 32 句完全相同。
- 本次没有跑 entire review：没有新提交，且 review 以推 main 为前提（HANDOFF 第六条），等 qi 决定推送时一起跑。

## 怎么复测（qi 本机）

进 `yuejian` 仓库根：`node tests/test_voice.js`、`node tests/smoke_phase_a.js`、`node tests/test_lights.js`；或系统浏览器开 `index.html`（401 晚上亮灯，点窗进房），点她头/脸/垂手/两肩、聊天、喂黑咖啡、点书、演「一起」，控制台应零报错；快速连点不同部位，前一句应立刻被顶掉不叠音。
