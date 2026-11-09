# HANDOFF · 月见公寓交接（2026-11-09，阶段 A 收口）

交接起点：main `cdc989b`，GitHub（gh）与 Entire（origin）双侧已同步，工作区干净。
设计硬规则：**见 [docs/GAME_SPEC.md](docs/GAME_SPEC.md)（已按 v3.2 定稿重写）与 [docs/月见公寓-游戏策划案-v3.2.md](docs/月见公寓-游戏策划案-v3.2.md)**。当前停在阶段 A 结束，**不开始阶段 B**（阶段 B 清单在 GAME_SPEC §17/§21，等 qi 发话）。

## 一、阶段 A 逐项状态

| 项 | 状态 | 说明 |
|---|---|---|
| 点按区 | ✅ 做完 | 外观 5 扇窗（7f/501/401/301/302，`data/windows.js` hotspot）+ 401 房间 4 个热点（黑咖啡/报告纸/推理小说/猫碗，`js/app.js` 的 `HOTSPOTS_401`，坐标 2026-11-10 按底图逐像素复测过，四框互不相交） |
| 去掉戳按钮 | ✅ 做完（2026-11-09） | 底部「戳」按钮已删，改成点立绘本人，且是 **5 个独立点按区**：头 / 脸 / 垂手 / 左肩 / 右肩（`#poke-head` 等 5 个按钮，矩形在 `js/app.js` 的 `POKE_ZONES`，按立绘实测 anatomy；左右肩以她本人左右为准）。每区专属台词池（合起来恰好覆盖 qi 定稿 10 句 poke，互不重叠），表情随台词 face：头/垂手 shy、脸/右肩 angry、左肩 smile/angry。`?debug=1` 时 5 个框带中文标签画在按钮上（CSS `.debug-zones`）。点她身边空气不算戳；点按区与 401 热点零相交（冒烟按 320×568/390×844/1280×900 三视口钉死）。戳的数值规则一字未动（+1、单日 >10 冷脸不涨不扣）。落点暖光扩散（指针落指尖、键盘落区中心）+ 一次轻微一缩（0.3s ease-out、脚不离地）；第一次进房间头顶飘「点她一下」引导，戳过即消失。按钮可 Tab 聚焦、Enter/Space 触发 |
| 一起剧情动画 | 🟡 基础版做完 | 「一起」→「深夜送咖啡」全流程可演：背景变暗 + 底部两小人（mc_side 镜像 + yunsheng_side，透明 PNG 直接叠）+ 对话框点一下继续 + 中途二选一 + 奖励（+8 计软上限、杯垫）+ 当天灰掉。小人没有动作动画（三视图站桩，动作小人 qi 未出图，姿势参考 v3.2 §6） |
| 401 整图 | ✅ 做完 | `assets/bg/room_401_yunsheng.png` 全屏 cover + 云笙大立绘底部对齐站桩（5 表情切换、4s 轻呼吸、戳单次轻微一缩） |
| BGM | ❌ 没做 | v3.2 §20 声音放后期，阶段 A 任务清单里没有，未实现、未放 `<audio>` |
| 换修好的立绘 | ✅ 做完（2026-11-09） | 已换 v4 透明版：云笙 5 张表情走 `gh/art/yunsheng-v4` 分支（去掉左右发丝白边，逐像素校验边缘 0 残留），其余 26 张为 v3 高清清边版：`assets/characters/` 27 张（1600×2450）+ `assets/chibi/` 4 张（1280×1984），共 31 张，全部 RGBA 带 alpha。**第三单又补 6 张女主 saira 新画风**（`zhixi_smile/shy`、`xiyue_smile/shy`、`yelan_smile/shy`，走 `gh/art/heroines-saira` 分支 ff-merge 8f9400d，均 RGBA 1600×2450、透明无白边，其余 21 张 blob 不变）。`css/style.css` 三处 `mix-blend-mode: multiply` 与 `#room-char`/`#scene-chibis img` 的 `brightness` 补偿已删，代码无其他改动 |
| 脚下阴影 | ✅ 做完（2026-11-10，第六单改三层 + 返修渲染期去白边） | 脚部实测表 `FEET_GEOM`（20 张立绘逐张量 sole/双脚中心 fc/每脚 [x0,x1,sole]，只读图不改图），`SOLE_LINE` 由它派生；地板落点 `FOOT_Y=0.80`。`applyFootAlign(face)` 按 `top=(FOOT_Y-sole*0.56)*100%` 定位包裹层并下发 `--sole`/`--fc`，`buildContactBands` 按每脚实测逐条下发接触线。三层阴影全叠在立绘下面（DOM 先影后人）：`#shadow-outer` 外影椭圆（−0.153w..+0.162w、α0.55）+ `#shadow-core` 内芯（−0.099w..+0.126w、α0.85，填暗两脚间地毯）+ `.contact-band` 每鞋底一条深带（α0.95），颜色 `#10101A`，尺寸走 `--wp`（layoutStages 按 stage 高下发）等比缩放。阴影不随戳动画移动（`shadow-hop` 已删，脚不离地）。**渲染期去白边**：立绘自带一圈不透明 1px 浅色描边，`edgeBandRecolor` 加载后过 canvas 把外沿两圈像素压成 `min(自身, 内层不透明均值)`，alpha 不动（轮廓软硬粗细不变），结果 blob URL 换给 `#room-char` 并按路径缓存；PNG 不改，file:// 画布污染时退回原图。立绘加载失败时阴影/点按区/引导一起撤 |
| 底部互动条 | ✅ 做完（2026-11-09） | 喂 / 聊天 / 一起 = 三个 56px 磨砂玻璃圆钮（rgba(18,14,32,0.55) + blur(10px) + 金细边），内联 SVG 细线图标（线宽 1.5、#F3E6CF：冒热气咖啡杯 / 对话气泡 / 月牙小星），文字在钮下 6px。悬停边亮、按下 0.94 弹回 120ms；「一起」暖金边 + 3s 呼吸柔光，当天演过挂 `unavailable` + aria-disabled 变暗停呼吸（钮仍可点开面板看「今天已经演过啦」）。房间底部 120px 压暗渐变铺在 `#screen-room::after`（z 5，立绘 z 6 之下），不挡脚和阴影；右上「心情·亲密度」芯片同款磨砂 + 金细边 |

其余阶段 A 内容（任务全部要求项）均完成并经 5 轮 entire review：外观主界面（底图 + 12 贴片 + 每次打开随机抽 A/B/C + §8.1 亮灯 + 灭窗遮罩 + 卡片 + 灭窗提示）、401 房间（戳/喂/聊天 + 杯垫 + 数值管道：心情倍率/软上限 20/单日戳 >10 不涨）、存档（`yuejian_save_v1`，半截/手改/坏档全部自愈不崩）、深夜送咖啡（每天限演一次）。**第三单：灭窗遮罩改只压暗窗玻璃**——`data/windows.js` 每扇窗新增 `glass` 玻璃多边形（7f/501/401/301 四扇，302 常亮无遮罩），`applyGlassClip()` 取外接框定位 + `clip-path: polygon()` 裁到玻璃范围，不再连墙体/窗框/栏杆/天空一起盖（外景底图与其他房间未动）。

## 二、没做完的（具体到文件/函数）与下一步

阶段 A 内**没有半截代码**——所有已开工的东西都是做完、测过、提交的。遗留事项（均等 qi 素材/决定，不是烂尾）：

1. **杯垫**：✅ 已出图（2026-11-10）。`assets/props/coaster.png`（256×128 RGBA；ImageGen 配额 403 不可用，改程序绘制，禁令仅对此道具解除）。`index.html` 的 `#coaster` 已是 `<img>`，CSS 椭圆占位删除；位置 `js/app.js` 的 `COASTER_RECT`（2026-11-10 qi 反馈后挪进桌面内侧：书右、纸叠前缘右段空档，离桌前沿 ≈1 个杯垫高、不压杯/纸/书，待 qi 验收）。qi 不满意换同名文件即可。
2. **401 热点坐标**：✅ 已复测（2026-11-10）。`js/app.js` `HOTSPOTS_401` 四个矩形按 768×1376 底图加像素网格逐张量出（咖啡=杯+碟+热气、报告纸=桌面纸叠、小说=第四层带书名那排、猫碗=地上食盆），各留 ~4px 触摸余量、彼此不相交；浏览器 elementFromPoint 与实点四件全验证。qi 试玩若仍觉得不准，改 rect 即可。
3. **动作小人 / BGM / 猫 / 私信等**：全部属阶段 B 及以后（v3.2 §22），**下一步是等 qi 验收阶段 A，然后才开始阶段 B**。动作小人已接三张（2026-11-10，缪子 ce15178 交图后）：`js/app.js` 的 `ACTION_SPOTS_401`（report 靠书桌 / sleep 躺床 / feedcat 蹲猫碗旁，rect 按图实测、图底=脚底）+ `setRoomAction(name|null)`（演动作时站桩让位、撤动作恢复）+ `index.html` 的 `#room-action`；三张同款渲染期去白边（alpha/PNG 不动）。**window 那张自带白天窗户与夜间 401 冲突：不接、不裁、不改，等缪子重出**；缺图 onerror 自动隐藏不出破图。

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
node tests/smoke_phase_a.js   → 冒烟测试：131 通过，0 失败
```

改 `js/app.js` 的纯函数或任何互动/存档逻辑后必须两个都重跑。改台词/剧本/窗位不用跑（但改 data 后建议跑一遍冒烟防 id/令牌拼错——冒烟里有 data-item ↔ 台词令牌一致性断言）。

## 五、已知 bug 与占位

- **已知功能性 bug：无**（5 轮 entire review，轨迹 5→4→2→2→3 条，后三轮均 approve with nits，全部修复；测试 175 条断言全绿（亮灯 44 + 冒烟 131）。2026-11-09 顺手修掉一个旧缺陷：立绘加载失败时 JS 只写 `dataset.broken` 没挂 `.broken` 类，CSS 的 `#room-char.broken { visibility: hidden }` 一直是死规则，浏览器会露出 alt 破图标——现在 `markPortraitBroken()` 统一挂类。
- **占位（qi 素材到位即替换）**：动作小人（qi 出图）；杯垫已用程序绘制道具图顶替，qi 可换 `assets/props/coaster.png` 同名文件。
- **有意为之的阶段 A 限制（不是 bug）**：路人窗常亮不随机（passerby.js 阶段 C 用）；便利店只走规则函数无视觉遮罩；除 401 外三人「拜访」灰掉；302 卡片无按钮；云笙出警概率是实现层定的 1/7（`patrolTonight`，qi 可改）。
- 内嵌浏览器（ZCode）打不开是已知环境问题：试玩用系统浏览器双击 `index.html`，或起本地静态服务器。

## 六、提交规矩（重要：顺序别反）

1. 改动 → `git add` → commit（中文信息，说清做了什么）。
2. **先跑审查再推**：`entire review general --base <上一个提交hash>`（必须在双推**之前**跑——推完 main==origin/main 就没有 diff 可审，会空转报 0 commits；要覆盖多笔提交就把 --base 指到更早）。结论有 high/med 缺陷就修复再推；low 级 nit 可记 CHANGELOG 带走。
3. 双推：`git push origin main`（Entire）+ `git push gh main`（GitHub）。
4. `docs/CHANGELOG.md` 记一笔（含怎么试玩）。
5. 新环境注意：git 身份配 repo-local `hlm428 <fuhe9350@gmail.com>`；remote `origin` = `entire://aws-ap-southeast-1.entire.io/et/yuejian/yuejian`，`gh` = `https://github.com/hlm428/yuejian.git`；tool：entire 0.13.1。
