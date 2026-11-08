# HANDOFF · 月见公寓交接（2026-11-09，阶段 A 收口）

交接起点：main `cdc989b`，GitHub（gh）与 Entire（origin）双侧已同步，工作区干净。
设计硬规则：**见 [docs/GAME_SPEC.md](docs/GAME_SPEC.md)（已按 v3.2 定稿重写）与 [docs/月见公寓-游戏策划案-v3.2.md](docs/月见公寓-游戏策划案-v3.2.md)**。当前停在阶段 A 结束，**不开始阶段 B**（阶段 B 清单在 GAME_SPEC §17/§21，等 qi 发话）。

## 一、阶段 A 逐项状态

| 项 | 状态 | 说明 |
|---|---|---|
| 点按区 | ✅ 做完 | 外观 5 扇窗（7f/501/401/301/302，`data/windows.js` hotspot）+ 401 房间 4 个热点（黑咖啡/报告纸/推理小说/猫碗，`js/app.js` 的 `HOTSPOTS_401`，坐标是目测值可调） |
| 去掉戳按钮 | ✅ 做完（2026-11-09） | 底部「戳」按钮已删，改成点立绘本人，且是 **5 个独立点按区**：头 / 脸 / 垂手 / 左肩 / 右肩（`#poke-head` 等 5 个按钮，矩形在 `js/app.js` 的 `POKE_ZONES`，按立绘实测 anatomy；左右肩以她本人左右为准）。每区专属台词池（合起来恰好覆盖 qi 定稿 10 句 poke，互不重叠），表情随台词 face：头/垂手 shy、脸/右肩 angry、左肩 smile/angry。`?debug=1` 时 5 个框带中文标签画在按钮上（CSS `.debug-zones`）。点她身边空气不算戳；点按区与 401 热点零相交（冒烟按 320×568/390×844/1280×900 三视口钉死）。戳的数值规则一字未动（+1、单日 >10 冷脸不涨不扣）。落点暖光扩散（指针落指尖、键盘落区中心）+ 小跳；第一次进房间头顶飘「点她一下」引导，戳过即消失。按钮可 Tab 聚焦、Enter/Space 触发 |
| 一起剧情动画 | 🟡 基础版做完 | 「一起」→「深夜送咖啡」全流程可演：背景变暗 + 底部两小人（mc_side 镜像 + yunsheng_side，透明 PNG 直接叠）+ 对话框点一下继续 + 中途二选一 + 奖励（+8 计软上限、杯垫）+ 当天灰掉。小人没有动作动画（三视图站桩，动作小人 qi 未出图，姿势参考 v3.2 §6） |
| 401 整图 | ✅ 做完 | `assets/bg/room_401_yunsheng.png` 全屏 cover + 云笙大立绘底部对齐站桩（5 表情切换、呼吸动画、戳小跳） |
| BGM | ❌ 没做 | v3.2 §20 声音放后期，阶段 A 任务清单里没有，未实现、未放 `<audio>` |
| 换修好的立绘 | ✅ 做完（2026-11-09） | 已换 v4 透明版：云笙 5 张表情走 `gh/art/yunsheng-v4` 分支（去掉左右发丝白边，逐像素校验边缘 0 残留），其余 26 张为 v3 高清清边版：`assets/characters/` 27 张（1600×2450）+ `assets/chibi/` 4 张（1280×1984），共 31 张，全部 RGBA 带 alpha。`css/style.css` 三处 `mix-blend-mode: multiply` 与 `#room-char`/`#scene-chibis img` 的 `brightness` 补偿已删，代码无其他改动 |
| 脚下阴影 | ✅ 做完（2026-11-09） | 两层，中心都压在实测鞋底线（画布 95.88% 高、51.6% 宽，5 张表情一致）：`#char-contact` 接触阴影（双鞋合宽 15%、6px 高、rgba(10,5,20,0.7)、blur 2px，上半被鞋面盖住，鞋底与阴影零缝隙）+ `#char-shadow` 环境阴影（原大椭圆，透明度降到 0.3）。尺寸全相对 `#char-wrap`，缩放不走位。小跳时两层同用 `shadow-hop` 反向位移留在地上并收窄变淡（关键帧与 `hop` 同时长同百分比）。立绘加载失败时阴影/点按区/引导一起撤 |
| 底部互动条 | ✅ 做完（2026-11-09） | 喂 / 聊天 / 一起 = 三个 56px 磨砂玻璃圆钮（rgba(18,14,32,0.55) + blur(10px) + 金细边），内联 SVG 细线图标（线宽 1.5、#F3E6CF：冒热气咖啡杯 / 对话气泡 / 月牙小星），文字在钮下 6px。悬停边亮、按下 0.94 弹回 120ms；「一起」暖金边 + 3s 呼吸柔光，当天演过挂 `unavailable` + aria-disabled 变暗停呼吸（钮仍可点开面板看「今天已经演过啦」）。房间底部 120px 压暗渐变铺在 `#screen-room::after`（z 5，立绘 z 6 之下），不挡脚和阴影；右上「心情·亲密度」芯片同款磨砂 + 金细边 |

其余阶段 A 内容（任务全部要求项）均完成并经 5 轮 entire review：外观主界面（底图 + 12 贴片 + 每次打开随机抽 A/B/C + §8.1 亮灯 + 灭窗遮罩 + 卡片 + 灭窗提示）、401 房间（戳/喂/聊天 + 杯垫 + 数值管道：心情倍率/软上限 20/单日戳 >10 不涨）、存档（`yuejian_save_v1`，半截/手改/坏档全部自愈不崩）、深夜送咖啡（每天限演一次）。

## 二、没做完的（具体到文件/函数）与下一步

阶段 A 内**没有半截代码**——所有已开工的东西都是做完、测过、提交的。遗留事项（均等 qi 素材/决定，不是烂尾）：

1. **杯垫占位**：无美术资产，CSS 椭圆顶替。位置在 `js/app.js` 的 `COASTER_RECT`（约 153 行），样式在 `css/style.css` 的 `#coaster`。qi 出图后：加 `<img>` 换掉 div 即可。
2. **401 热点坐标**：`js/app.js` `HOTSPOTS_401` 四个矩形是按底图目测的（没有 windows.js 那种实测数据），qi 试玩点不准就改 rect。
3. **动作小人 / BGM / 猫 / 私信等**：全部属阶段 B 及以后（v3.2 §22），**下一步是等 qi 验收阶段 A，然后才开始阶段 B**。

## 三、项目结构（哪个文件管什么）

```
index.html            两个 screen（#screen-exterior 外观 / #screen-room 房间）+ 窗卡片 + 喂/一起弹层 + 剧情覆盖层；所有 id 是 js 的接口
js/app.js             全部逻辑：纯函数 bandOf/lightOn/yelanAsleep/patrolTonight/isWeekend/isPortraitBroken
                      （亮灯规则 SPEC §8.1，夜澜窗 id='7f'）+ 存档 loadSave/healStats/writeSave
                      + 外观渲染 renderExterior + 卡片 showCard + 房间互动 doPoke/doFeed/doChat
                      + 数值管道 gainAffection/moodMul + 剧情播放器 startScene/advanceScene/chooseScene
css/style.css         布局与动画；cover 舞台尺寸由 layoutStages() 按底图 768×1376 计算；立绘已换透明版，multiply/brightness workaround 全部移除
data/lines_yunsheng.js   云笙「邻居」阶段 40 句（poke/feed/sleep/chat 各 10，按 SPEC §18；needCat 两句猫出现才抽）
data/scenes_yunsheng.js  触发剧情「深夜送咖啡」剧本（台词按 qi 定稿，一个字没动）
data/windows.js       4 扇专属窗 + 302 的实测窗位（0~1 比例，底图 768×1376）
data/passerby.js      路人窗 20 扇 + 古董店点按区（阶段 C 用；现在只加载不渲染，路人窗常亮靠底图）
assets/characters/    27 张立绘（1600×2450，RGBA 透明）
assets/exterior/      bg_exterior_empty.png 底图 + 12 张窗内贴片（透明 RGBA）
assets/bg/            5 张房间背景（768×1376，阶段 A 只用 room_401_yunsheng.png）
assets/chibi/         4 张 Q 版小人（1280×1984，RGBA 透明）
tests/test_lights.js  亮灯规则回归（纯 node）
tests/smoke_phase_a.js 无头 DOM 冒烟（按 index.html 真实 id 表驱动 app.js 全交互）
docs/GAME_SPEC.md     唯一设定依据（优先级：美术资产 > 定稿设定 > 参考级）
存档                  localStorage key `yuejian_save_v1`，结构 {v:1, affection{四人}, mood{四人},
                      today{date,gained,pokes,capMsgShown}, coaster, scenes{yunsheng_coffee:'YYYY-MM-DD'}, lastOpened}
```

## 四、怎么跑测试（2026-11-09 实测结果，仓库根目录执行）

```
node tests/test_lights.js     → 亮灯规则断言：44 通过，0 失败
node tests/smoke_phase_a.js   → 冒烟测试：113 通过，0 失败
```

改 `js/app.js` 的纯函数或任何互动/存档逻辑后必须两个都重跑。改台词/剧本/窗位不用跑（但改 data 后建议跑一遍冒烟防 id/令牌拼错——冒烟里有 data-item ↔ 台词令牌一致性断言）。

## 五、已知 bug 与占位

- **已知功能性 bug：无**（5 轮 entire review，轨迹 5→4→2→2→3 条，后三轮均 approve with nits，全部修复；测试 157 条断言全绿（亮灯 44 + 冒烟 113）。2026-11-09 顺手修掉一个旧缺陷：立绘加载失败时 JS 只写 `dataset.broken` 没挂 `.broken` 类，CSS 的 `#room-char.broken { visibility: hidden }` 一直是死规则，浏览器会露出 alt 破图标——现在 `markPortraitBroken()` 统一挂类。
- **占位（qi 素材到位即替换）**：杯垫 CSS 椭圆；401 热点目测坐标。
- **有意为之的阶段 A 限制（不是 bug）**：路人窗常亮不随机（passerby.js 阶段 C 用）；便利店只走规则函数无视觉遮罩；除 401 外三人「拜访」灰掉；302 卡片无按钮；云笙出警概率是实现层定的 1/7（`patrolTonight`，qi 可改）。
- 内嵌浏览器（ZCode）打不开是已知环境问题：试玩用系统浏览器双击 `index.html`，或起本地静态服务器。

## 六、提交规矩（重要：顺序别反）

1. 改动 → `git add` → commit（中文信息，说清做了什么）。
2. **先跑审查再推**：`entire review general --base <上一个提交hash>`（必须在双推**之前**跑——推完 main==origin/main 就没有 diff 可审，会空转报 0 commits；要覆盖多笔提交就把 --base 指到更早）。结论有 high/med 缺陷就修复再推；low 级 nit 可记 CHANGELOG 带走。
3. 双推：`git push origin main`（Entire）+ `git push gh main`（GitHub）。
4. `docs/CHANGELOG.md` 记一笔（含怎么试玩）。
5. 新环境注意：git 身份配 repo-local `hlm428 <fuhe9350@gmail.com>`；remote `origin` = `entire://aws-ap-southeast-1.entire.io/et/yuejian/yuejian`，`gh` = `https://github.com/hlm428/yuejian.git`；tool：entire 0.13.1。
