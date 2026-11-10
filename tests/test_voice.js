'use strict';
/* 月见公寓 · 阶段 B 云笙配音接入回归测试
   运行：node tests/test_voice.js   （纯 node，无依赖）
   验证对象：js/app.js 的 YUNSHENG_VOICE 映射与 playLineVoice / stopVoice，
   对照 data/lines_yunsheng.js、data/scenes_yunsheng.js 原文逐字核对（qi 要求一字不差）。
   规则：新一句立刻停上一句；缺失/失败静默；只在点击回调里播；没配音的文字不出声。 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const noop = () => {};
const els = {};
function fakeEl() {
  return { textContent: '', style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop } };
}
global.document = {
  readyState: 'loading', addEventListener: noop,
  getElementById: id => els[id] || (els[id] = fakeEl()),
  querySelectorAll: () => []
};
global.localStorage = { getItem: () => null, setItem: noop };
global.window = global;
global.setInterval = noop;
global.setTimeout = () => 0;   // 气泡 2.8s 自动隐藏不拖住进程
global.clearTimeout = noop;

// 数据文件先行（与 index.html 的加载顺序一致），再 eval app.js
(0, eval)(fs.readFileSync(path.join(root, 'data', 'lines_yunsheng.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(root, 'data', 'scenes_yunsheng.js'), 'utf8'));
const src = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
(0, eval)(src + '\n;globalThis.__T = { YUNSHENG_VOICE, playLineVoice, stopVoice, showBubble, renderDialog, goExterior, POKE_ZONES, HOTSPOTS_401 };');
const T = globalThis.__T;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) pass++;
  else { fail++; console.error('FAIL ' + name); }
}

// —— Audio 桩：记录 play/pause 事件顺序 ——
const events = [];
let playBehavior = 'resolve'; // resolve | reject | throw
global.Audio = class {
  constructor() { this.src = ''; this.currentTime = 5; events.push('new'); }
  play() {
    events.push('play:' + this.src);
    if (playBehavior === 'throw') throw new Error('模拟播放失败');
    if (playBehavior === 'reject') return Promise.reject(new Error('模拟缺失文件'));
    return Promise.resolve();
  }
  pause() { events.push('pause'); }
};

const L = global.window.LINES.yunsheng.neighbor;
const scene = global.window.SCENES.yunsheng[0];
const V = T.YUNSHENG_VOICE;

// —— A. 映射完整性：34 句台词 + 1 条书热点别名（共 35 键，仍只用 34 个音频文件）——
ok('映射共 35 键（34 句 + 书热点别名）', Object.keys(V).length === 35);
ok('仍只用 34 个定稿音频文件', new Set(Object.values(V)).size === 34);
['poke', 'chat', 'feed'].forEach(kind => {
  L[kind].forEach((ln, i) => ok(`${kind}[${i}]「${ln.text}」有配音映射`, typeof V[ln.text] === 'string'));
});
const sceneTexts = [];
scene.beats.forEach(b => {
  if (b.type === 'line' && b.speaker === 'yunsheng') sceneTexts.push(b.text);
  if (b.type === 'choice') b.options.forEach(o => sceneTexts.push(o.reply.text));
});
ok('剧情云笙 4 句齐全', sceneTexts.length === 4);
sceneTexts.forEach(t => ok(`剧情「${t}」有配音映射`, typeof V[t] === 'string'));

// 点按区 → 文件命名对应（头/脸/垂手/左肩/右肩，下标与 qi 任务单一致）
const zoneFilePrefix = { head: 'poke_head_', face: 'poke_face_', hand: 'poke_hand_', shoulderL: 'poke_shoulder_l_', shoulderR: 'poke_shoulder_r_' };
Object.keys(T.POKE_ZONES).forEach(z => {
  T.POKE_ZONES[z].lines.forEach(i => {
    const id = V[L.poke[i].text];
    ok(`点按区 ${z} 台词「${L.poke[i].text}」→ ${zoneFilePrefix[z]}*`, typeof id === 'string' && id.indexOf(zoneFilePrefix[z]) === 0);
  });
});

// 省略号区分：喂「……放那儿吧。」≠ 剧情「放那儿吧。」；「……还算合口味。」≠「还算合口味。」
ok('喂/剧情 放那儿吧 各对各的文件', V['……放那儿吧。'] === 'feed_coffee_1' && V['放那儿吧。'] === 'scene_coffee_open');
ok('喂/剧情 还算合口味 各对各的文件', V['还算合口味。'] === 'feed_coffee_2' && V['……还算合口味。'] === 'scene_coffee_end');
ok('书热点短句与聊天整句同播 chat_08', V['凶手太蠢了。'] === 'chat_08' && V['推理小说看到一半，凶手太蠢了。'] === 'chat_08');

// —— B. 34 个音频文件都在 assets/voice/yunsheng/ ——
Object.keys(V).forEach(text => {
  const f = path.join(root, 'assets', 'voice', 'yunsheng', V[text] + '.mp3');
  ok('文件存在 ' + V[text] + '.mp3', fs.existsSync(f) && fs.statSync(f).size > 0);
});

// —— C. 没配音的文字不在映射里（文字照常、不出声）——
L.sleep.forEach((ln, i) => ok(`sleep[${i}] 无配音`, !(ln.text in V)));
T.HOTSPOTS_401.forEach(h => {
  if (h.id === 'novel') ok('书热点「凶手太蠢了。」借 chat_08 发声（qi 定）', V[h.text] === 'chat_08');
  else ok(`热点「${h.text}」无配音`, !(h.text in V));
});
scene.beats.forEach(b => {
  if (b.type === 'line' && b.speaker === 'narration') ok('旁白无配音 ' + b.text.slice(0, 8) + '…', !(b.text in V));
  if (b.type === 'choice') b.options.forEach(o => ok('主控选项无配音 ' + o.label.slice(0, 8) + '…', !(o.label in V)));
});
ok('兜底句「……嗯？」无配音', !('……嗯？' in V));

// —— D. 播放行为 ——
ok('加载期不创建 Audio（不自动播）', events.length === 0);

T.playLineVoice('别戳。');
ok('有映射 → 播对应文件', events.indexOf('play:assets/voice/yunsheng/poke_face_1.mp3') !== -1);

events.length = 0;
T.playLineVoice('续杯？'); // 热点句，无配音
ok('无映射 → 停上一句、不出声', events.length === 1 && events[0] === 'pause');

events.length = 0;
T.playLineVoice('无聊。');
T.playLineVoice('戳够了就走。');
ok('新一句先停上一句再播（不重叠）',
  events[0] === 'pause' &&
  events[1] === 'play:assets/voice/yunsheng/poke_head_1.mp3' &&
  events[2] === 'pause' &&
  events[3] === 'play:assets/voice/yunsheng/poke_hand_2.mp3');

playBehavior = 'reject';
let threw = false;
try { T.playLineVoice('别戳。'); } catch (e) { threw = true; }
ok('play() 拒绝（文件缺失等）不抛错', !threw);
playBehavior = 'throw';
threw = false;
try { T.playLineVoice('别戳。'); } catch (e) { threw = true; }
ok('play() 同步抛错也不弹出', !threw);
playBehavior = 'resolve';

events.length = 0;
T.playLineVoice('别戳。');
T.stopVoice();
ok('stopVoice 暂停播放', events.indexOf('pause') !== -1);

// —— E. 两个文字入口都接上了 ——
events.length = 0;
T.showBubble('我在看报告。');
ok('showBubble（点按/聊天/喂食/热点）触发配音', events.indexOf('play:assets/voice/yunsheng/poke_shoulder_r_2.mp3') !== -1);
events.length = 0;
T.showBubble('空的。猫还没来。');
ok('showBubble 热点句只停不播', events.length === 1 && events[0] === 'pause');

events.length = 0;
T.renderDialog('云笙', '……多事。', '（她端起来喝了一口）', true);
ok('renderDialog 剧情句触发配音', events.indexOf('play:assets/voice/yunsheng/scene_coffee_choice_a.mp3') !== -1);
events.length = 0;
T.renderDialog('旁白', '你把咖啡放在她手边。', '', true);
ok('renderDialog 旁白只停不播', events.length === 1 && events[0] === 'pause');
events.length = 0;
T.renderDialog('你', '趁热喝，凉了就不好喝了。', '', true);
ok('renderDialog 主控句只停不播', events.length === 1 && events[0] === 'pause');

events.length = 0;
T.playLineVoice('……今天，谢谢你。');
T.goExterior();
ok('回公寓（goExterior）停掉正在播的', events.indexOf('pause') !== -1);

console.log(`配音接入断言：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);