'use strict';
/* 月见公寓 阶段 A 冒烟测试（纯 node，无依赖，无头 DOM 桩）
   按 index.html 的真实 id 表建元素注册表，加载 4 个 data 文件 + js/app.js，
   驱动外观 / 点窗卡片 / 房间三互动 / 数值管道 / 软上限 / 戳太多 / 剧情逐拍 / 存档读写全路径。
   ZCode 内嵌浏览器不可用，本文件是阶段 A 的交互回归网（阶段 B/C 改动后必须重跑）。
   运行：node tests/smoke_phase_a.js */
const fs = require('fs');
const path = require('path');
const repo = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
if (!ids.includes('app') || !ids.includes('room-char')) { console.error('FAIL: index.html id 解析异常'); process.exit(1); }

function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    style: {}, dataset: {}, children: [], parent: null,
    src: '', alt: '', disabled: false, offsetWidth: 10, title: '', _attrs: {}, _listeners: {},
    appendChild(ch) { this.children.push(ch); ch.parent = this; return ch; },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    getAttribute(n) { return this._attrs[n] || null; },
    setAttribute(n, v) { this._attrs[n] = String(v); },
    fire(t) { (this._listeners[t] || []).forEach(fn => fn({ stopPropagation() { } })); }
  };
  el.classList = {
    _set: new Set(),
    add(c) { this._set.add(c); },
    remove(c) { this._set.delete(c); },
    toggle(c, force) {
      if (force === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); }
      else { force ? this._set.add(c) : this._set.delete(c); }
      return this._set.has(c);
    },
    contains(c) { return this._set.has(c); }
  };
  // className 与 DOM 同步 classList（全量替换语义）
  Object.defineProperty(el, 'className', {
    get() { return [...el.classList._set].join(' '); },
    set(v) { el.classList._set = new Set(String(v).split(/\s+/).filter(Boolean)); }
  });
  // textContent 与 DOM 一样做字符串化
  let _text = '';
  Object.defineProperty(el, 'textContent', {
    get() { return _text; },
    set(v) { _text = String(v); }
  });
  Object.defineProperty(el, 'id', {
    get() { return el._id || ''; },
    set(v) { el._id = v; registry[v] = el; } // 建 id 即入注册表，getElementById 找不到就报错
  });
  return el;
}

const registry = {};
ids.forEach(id => { const el = makeEl('div'); el.id = id; });
registry['app'].clientWidth = 390;
registry['app'].clientHeight = 844;

function matches(el, tok) {
  if (tok[0] === '#') return el._id === tok.slice(1);
  if (tok[0] === '.') return el.classList.contains(tok.slice(1));
  return el.tagName === tok.toUpperCase();
}
function querySelectorAll(sel) {
  const all = [];
  const walk = el => { all.push(el); el.children.forEach(walk); };
  Object.values(registry).forEach(walk);
  return all.filter(el => sel.split(',').some(part => {
    const toks = part.trim().split(/\s+/);
    if (!matches(el, toks[toks.length - 1])) return false;
    let anc = el.parent, ti = toks.length - 2;
    while (ti >= 0 && anc) { if (matches(anc, toks[ti])) ti--; anc = anc.parent; }
    return ti < 0;
  }));
}

global.document = {
  readyState: 'complete',
  getElementById(id) { if (!registry[id]) throw new Error('getElementById 找不到 id: ' + id); return registry[id]; },
  createElement: tag => makeEl(tag),
  addEventListener() { },
  querySelectorAll
};
global.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; } };
global.window = global;
global.addEventListener = () => { }; // window.addEventListener('resize', ...) 桩
global.setInterval = () => 0;
global.setTimeout = () => 0;
global.clearTimeout = () => { };

const files = [
  path.join(repo, 'data', 'lines_yunsheng.js'),
  path.join(repo, 'data', 'scenes_yunsheng.js'),
  path.join(repo, 'data', 'windows.js'),
  path.join(repo, 'data', 'passerby.js'),
  path.join(repo, 'js', 'app.js')
];
const code = files.map(f => fs.readFileSync(f, 'utf8')).join('\n;\n')
  + '\n;globalThis.__T = { save, rolls, usedLines, renderExterior, onWindowClick, showCard, closeCard, enterRoom, goExterior, doPoke, doFeed, doChat, gainAffection, startScene, advanceScene, chooseScene, finishScene, updateSceneEntry, writeSave, ensureToday, loadSave, setFace, lightOn, bandOf, yelanAsleep, patrolTonight, HOTSPOTS_401, PEOPLE };';
(0, eval)(code);
const T = globalThis.__T;
if (!T || !T.doPoke) { console.error('FAIL: 无法从 app.js 取出函数'); process.exit(1); }

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) pass++; else { fail++; console.error('FAIL ' + name); } }
function txt(id) { return registry[id].textContent; }
function visible(id) { return !registry[id].classList.contains('hidden'); }
function aff() { return T.save.affection.yunsheng; }
function mood() { return T.save.mood.yunsheng; }
function gained() { return T.save.today.gained; }

// —— 1. 外观构建 ——
const stageKids = registry['stage'].children;
ok('外观：4 张贴片', stageKids.filter(e => e.tagName === 'IMG').length === 4);
ok('外观：贴片 src 指向 assets/exterior', stageKids.filter(e => e.tagName === 'IMG' && /assets\/exterior\/win_/.test(e.src)).length === 4);
ok('外观：4 个遮罩（302 始终亮不需要）+ 5 个点按区', stageKids.filter(e => e.classList.contains('win-dark')).length === 4 && stageKids.filter(e => e.classList.contains('win-hot')).length === 5);
ok('外观：302 无贴片无遮罩', !registry['patch-302'] && !registry['mask-302']);
ok('外观：layoutStages 尺寸', /px$/.test(registry['stage'].style.width) && /px$/.test(registry['stage'].style.height));
T.renderExterior();
ok('外观：时钟渲染', /\d+月\d+日/.test(txt('clock-chip')));

// —— 2. 302 卡片 ——
registry['hot-302'].fire('click');
ok('302 卡片弹出', visible('window-card') && visible('card-backdrop'));
ok('302 卡片文案', txt('card-name') === '你的房间' && txt('card-note') === '你的房间，阶段 C 再布置');
ok('302 无拜访按钮', registry['card-visit'].classList.contains('hidden'));
registry['card-close'].fire('click');
ok('302 卡片关闭', !visible('window-card'));

// —— 3. 其余三人卡片：拜访灰掉 ——
T.showCard('501');
ok('501 拜访灰掉', registry['card-visit'].disabled === true && txt('card-note') === '她的房间还在布置，过几天再来');
ok('501 头像 _smile', /xiyue_smile\.png$/.test(registry['card-avatar'].src));
ok('501 在干嘛按套', Object.values(T.PEOPLE['501'].doing).includes(txt('card-doing')));
T.closeCard();

// —— 4. 401 点窗：亮则卡片可拜访，灭则提示 ——
T.onWindowClick('401');
const band401 = T.bandOf(new Date().getHours());
const patrol = T.patrolTonight((() => { const d = new Date(); const p = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })());
if (T.lightOn('401', band401, { hour: new Date().getHours(), weekend: false, patrol })) {
  ok('401 亮：卡片可拜访', visible('window-card') && registry['card-visit'].disabled === false);
  registry['card-visit'].fire('click');
  ok('401 拜访进房间', visible('screen-room') && !visible('screen-exterior'));
} else {
  ok('401 灭：提示', ['她在实验室', '她被叫去现场了', '她不在家'].includes(txt('toast')));
  T.enterRoom();
  ok('直接进房间', visible('screen-room'));
}
ok('房间初始数值', txt('stat-mood') === '60' && txt('stat-aff') === '0');

// —— 5. 戳 ×3：+1/次，台词不重复 ——
T.doPoke(); T.doPoke(); T.doPoke();
ok('戳×3 亲密度=3', aff() === 3 && gained() === 3);
ok('戳×3 当天次数=3', T.save.today.pokes === 3);
ok('戳×3 台词互不重复', new Set(T.usedLines.poke).size === 3);
ok('表情切换到 5 表情之一', /yunsheng_(smile|shy|angry|eat|sleep)\.png$/.test(registry['room-char'].src));
ok('气泡显示', visible('bubble') && txt('bubble-text').length > 0);

// —— 6. 喂：黑咖啡 +3/心情+5/杯垫；甜食 0/-10 ——
T.doFeed('black_coffee');
ok('喂黑咖啡：aff+3 mood65 杯垫', aff() === 6 && mood() === 65 && T.save.coaster === true && visible('coaster'));
T.doFeed('sweets');
ok('喂甜食：aff 不变 mood55', aff() === 6 && mood() === 55);
T.doFeed('cat_can');
ok('喂猫罐头：aff+3 mood60', aff() === 9 && mood() === 60);
T.doFeed('bread');
ok('喂面包：aff+3 mood65', aff() === 12 && mood() === 65);
const feedPool = globalThis.LINES.yunsheng.neighbor.feed.filter(l => !l.needCat);
ok('needCat 喂句不抽', feedPool.length === 9);
// 喂面板接线：index.html 按钮 data-item 与台词数据令牌必须一一对应（拼错令牌会被兜底 toast 掩盖）
const feedBtnItems = [...html.matchAll(/data-item="([^"]+)"/g)].map(m => m[1]);
const feedLineItems = [...new Set(feedPool.map(l => l.item))];
ok('喂按钮 data-item 与台词令牌一一对应', feedBtnItems.length === 4 && feedLineItems.length === 4
  && feedLineItems.every(i => feedBtnItems.includes(i)) && feedBtnItems.every(i => feedLineItems.includes(i)));
// 兜底分支：台词数据缺该物品 → 提示且数值不动（当前数据到不了，防阶段 B 改数据后静默失效）
const affBeforeFallback = aff(), gainedBeforeFallback = gained(), moodBeforeFallback = mood();
T.doFeed('no_such_item');
ok('喂未知物品走兜底提示且数值不动', txt('toast') === '云笙没有回应。' && aff() === affBeforeFallback && gained() === gainedBeforeFallback && mood() === moodBeforeFallback);

// —— 7. 聊天：+2，不重复 ——
T.doChat(); T.doChat();
ok('聊天×2 aff=16', aff() === 16 && gained() === 16);
ok('聊天不重复', new Set(T.usedLines.chat).size === 2);

// —— 8. 软上限 20：过后砍半并弹一次提示 ——
while (gained() < 20) T.doChat();        // +2/次 直到 ≥20
const afterCap = gained();
ok('软上限达到', afterCap >= 20);
T.doChat();
const deltaCap = gained() - afterCap;
ok('过上限后砍半（floor(2/2)=1）', deltaCap === 1 && T.save.today.capMsgShown === true);

// —— 9. 戳太多：第 11 次起不涨（重置当天计数再测，避免软上限分支把本断言变空转）——
T.save.today = { date: T.save.today.date, gained: 0, pokes: 0, capMsgShown: false };
for (let i = 0; i < 10; i++) T.doPoke();
ok('前 10 次戳每次 +1（mood 65 → ×1）', gained() === 10 && T.save.today.pokes === 10);
T.doPoke(); // 第 11 次：若删掉 >POKE_DAILY_LIMIT 分支此断言必挂
ok('第 11 次戳不涨', gained() === 10 && T.save.today.pokes === 11);

// —— 10. 立绘兜底：报错出占位，换到能加载的表情图撤占位 ——
registry['room-char'].fire('error');
ok('立绘报错出占位', visible('char-placeholder') && registry['room-char'].dataset.broken === '1');
T.setFace('smile');
ok('setFace 重置 broken 并隐藏占位', registry['room-char'].dataset.broken === undefined && !visible('char-placeholder'));
registry['room-char'].fire('error');
ok('再次报错占位回来', visible('char-placeholder'));
registry['room-char'].fire('load');
ok('load 成功撤占位', !visible('char-placeholder') && registry['room-char'].dataset.broken === undefined);

// —— 11. 触发剧情：深夜送咖啡 ——
T.save.scenes = {}; T.writeSave();
T.updateSceneEntry();
ok('剧情入口可演', registry['scene-entry'].disabled === false && txt('scene-state') === '可以演');
T.startScene();
ok('剧情开场：旁白', visible('scene-overlay') && txt('scene-speaker') === '旁白' && /深夜十一点/.test(txt('scene-text')));
T.advanceScene();
ok('第 2 幕：云笙放那儿吧（头也不抬）', txt('scene-speaker') === '云笙' && txt('scene-text') === '放那儿吧。' && txt('scene-note') === '（头也不抬）');
T.advanceScene();
ok('第 3 幕：旁白放咖啡', /你把咖啡放在她手边/.test(txt('scene-text')));
T.advanceScene();
ok('第 4 幕：二选一', visible('scene-choices') && txt('scene-choice-a') === '趁热喝，凉了就不好喝了。' && txt('scene-choice-b') === '写不完也没关系，明天再写。');
T.chooseScene(0);
ok('选 A：主控台词插播', txt('scene-speaker') === '你' && txt('scene-text') === '趁热喝，凉了就不好喝了。');
T.advanceScene();
ok('云笙回复：多事', txt('scene-text') === '……多事。' && txt('scene-note') === '（她端起来喝了一口）');
T.advanceScene();
ok('结尾：还算合口味', txt('scene-text') === '……还算合口味。');
const affBeforeScene = aff();
T.advanceScene();
const sceneMarked = T.save.scenes.yunsheng_coffee !== undefined;
ok('剧终：关闭 + 记档', visible('scene-overlay') === false && sceneMarked);
// 第 9 节重置后 gained=10；奖励 +8 基数 × 心情 65（×1）= +8 → 18，确定性断言（数值管道一动就挂）
ok('剧情奖励入账（+8 计入管道）', aff() === affBeforeScene + 8 && T.save.today.gained === 18);
T.updateSceneEntry();
ok('演完当天灰掉', registry['scene-entry'].disabled === true && txt('scene-state') === '今天已经演过啦');

// —— 12. 存档落盘 + 读档 + 坏档兜底 ——
T.writeSave();
const raw = JSON.parse(global.localStorage._s['yuejian_save_v1']);
ok('存档 v:1 字段齐', raw.v === 1 && typeof raw.affection === 'object' && typeof raw.today === 'object' && raw.coaster === true && raw.scenes.yunsheng_coffee !== undefined && !!raw.lastOpened);
ok('loadSave 读回一致', T.loadSave().affection.yunsheng === raw.affection.yunsheng);
global.localStorage._s['yuejian_save_v1'] = JSON.stringify({ v: 1, affection: { yunsheng: 5 } }); // 半截存档：缺 today/scenes/mood 大半
const healed = T.loadSave();
ok('半截存档字段级自愈', !!healed && healed.today.gained === 0 && healed.today.pokes === 0 && healed.today.capMsgShown === false && typeof healed.scenes === 'object' && typeof healed.mood === 'object' && healed.affection.yunsheng === 5);
global.localStorage._s['yuejian_save_v1'] = JSON.stringify({ v: 1, affection: {}, mood: { yunsheng: '60' } }); // 叶子缺口：缺键 + 类型错
const healed2 = T.loadSave();
ok('叶子缺键/类型错自愈', !!healed2 && healed2.affection.yunsheng === 0 && healed2.mood.yunsheng === 60 && healed2.mood.zhixi === 60 && typeof healed2.affection.xiyue === 'number');
global.localStorage._s['yuejian_save_v1'] = JSON.stringify({ v: 1, affection: { yunsheng: 150 }, mood: { yunsheng: -5 } }); // 越界值夹取
const healed3 = T.loadSave();
ok('越界数值夹取 0–100', !!healed3 && healed3.affection.yunsheng === 100 && healed3.mood.yunsheng === 0);
global.localStorage._s['yuejian_save_v1'] = JSON.stringify({ v: 1, today: { date: '2026-11-08', gained: -5, pokes: '12', capMsgShown: 'yes' } }); // today 叶子校验
const healed4 = T.loadSave();
ok('today 叶子校验（负数/类型错归零）', !!healed4 && healed4.today.gained === 0 && healed4.today.pokes === 0 && healed4.today.capMsgShown === false);
global.localStorage._s['yuejian_save_v1'] = '{bad json';
ok('坏档不崩→新档', T.loadSave() === null);
global.localStorage._s['yuejian_save_v1'] = JSON.stringify({ v: 99 });
ok('版本不对→新档', T.loadSave() === null);

// —— 13. 返回公寓 ——
T.goExterior();
ok('返回外观', visible('screen-exterior') && !visible('screen-room'));

console.log(`冒烟测试：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
