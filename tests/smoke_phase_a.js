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
    style: { setProperty(k, v) { this[k] = v; } }, dataset: {}, children: [], parent: null,
    src: '', alt: '', disabled: false, offsetWidth: 10, title: '', _attrs: {}, _listeners: {},
    appendChild(ch) { this.children.push(ch); ch.parent = this; return ch; },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    getAttribute(n) { return this._attrs[n] || null; },
    setAttribute(n, v) { this._attrs[n] = String(v); },
    removeAttribute(n) { delete this._attrs[n]; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
    fire(t, ev) { (this._listeners[t] || []).forEach(fn => fn({ stopPropagation() { }, ...ev })); }
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
  // innerHTML 置空 = 清空子节点（接触线每次重build 前会清容器）
  Object.defineProperty(el, 'innerHTML', {
    get() { return ''; },
    set(v) { if (String(v) === '') el.children.length = 0; }
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
  + '\n;globalThis.__T = { save, rolls, usedLines, renderExterior, onWindowClick, showCard, closeCard, enterRoom, goExterior, doPoke, doFeed, doChat, gainAffection, startScene, advanceScene, chooseScene, finishScene, updateSceneEntry, writeSave, ensureToday, loadSave, setFace, lightOn, bandOf, yelanAsleep, patrolTonight, HOTSPOTS_401, PEOPLE, POKE_ZONES, pickPokeLine, pickLine, applyZoneRects, applyFootAlign, SOLE_LINE, FOOT_Y, FEET_GEOM, edgeBandRecolor, ACTION_SPOTS_401, setRoomAction };';
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
ok('外观：7 个遮罩（7f 单面、其余每窗 2 块玻璃开口，302 始终亮不需要）+ 5 个点按区', stageKids.filter(e => e.classList.contains('win-dark')).length === 7 && stageKids.filter(e => e.classList.contains('win-hot')).length === 5);
ok('外观：302 无贴片无遮罩', !registry['patch-302'] && !registry['mask-302']);
ok('外观：layoutStages 尺寸', /px$/.test(registry['stage'].style.width) && /px$/.test(registry['stage'].style.height));

// —— 1b. 灭窗遮罩贴玻璃（审查回归：曾整块盖 hotspot，连墙体/窗框/栏杆/天空一起压暗；
//        验收回归：301/7f 下边界曾漏到花箱/栏杆。每块玻璃开口一个遮罩，窗棂不压）——
const GLASS_VERTS = { '7f': [4], '501': [5, 4], '401': [5, 4], '301': [5, 4] };
['7f', '501', '401', '301'].forEach(id => {
  window.WINDOWS[id].glass.forEach((g, i) => {
    const xs = g.map(p => p[0]), ys = g.map(p => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const gw = Math.max(...xs) - x0, gh = Math.max(...ys) - y0;
    const m = registry['mask-' + id + (i ? '-' + i : '')];
    ok(`灭窗 ${id}#${i}：遮罩 clip-path 裁到玻璃 ${GLASS_VERTS[id][i]} 顶点多边形`, !!m && /^polygon\(/.test(m.style.clipPath || '') && (m.style.clipPath.match(/%/g) || []).length === 2 * GLASS_VERTS[id][i]);
    ok(`灭窗 ${id}#${i}：遮罩 rect = glass 外接框（非整块 hotspot）`, m.style.left === (x0 * 100) + '%' && m.style.top === (y0 * 100) + '%'
      && m.style.width === (gw * 100) + '%' && m.style.height === (gh * 100) + '%');
    ok(`灭窗 ${id}#${i}：glass 坐标合法（${GLASS_VERTS[id][i]} 点、0~1、正面积）`, g.length === GLASS_VERTS[id][i] && g.every(p => p[0] >= 0 && p[0] <= 1 && p[1] >= 0 && p[1] <= 1) && gw > 0 && gh > 0);
  });
});
ok('灭窗 301：右半玻璃底 = 玫瑰顶（<0.62），左半底仍窗框内（<0.65），花箱栏杆不压',
  Math.max(...window.WINDOWS['301'].glass[1].map(p => p[1])) < 0.62
  && Math.max(...window.WINDOWS['301'].glass[0].map(p => p[1])) < 0.65);

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

// —— 5. 点她本人 = 戳 ×3：+1/次，5 个独立点按区 ——
ok('戳按钮已删除', !ids.includes('btn-poke') && !/id="btn-poke"/.test(html));
ok('底部只剩 喂/聊天/一起', ['btn-feed', 'btn-chat', 'btn-together'].every(id => ids.includes(id))
  && [...html.matchAll(/<button class="act[^"]*"/g)].length === 3);
ok('5 个分区按钮入库（整体点击区已拆）', ['poke-head', 'poke-face', 'poke-hand', 'poke-shoulderL', 'poke-shoulderR'].every(id => ids.includes(id))
  && !ids.includes('char-hit') && ids.includes('shadow-outer') && ids.includes('shadow-core') && ids.includes('char-contacts') && ids.includes('char-tap'));
ok('进房间飘戳引导', visible('poke-hint'));
registry['poke-head'].fire('click');
ok('点她本人触发戳', aff() === 1 && T.save.today.pokes === 1);
ok('戳有落点反馈与小跳', registry['char-tap'].classList.contains('go') && registry['char-wrap'].classList.contains('hop'));
ok('戳过引导消失', !visible('poke-hint'));
registry['poke-face'].fire('click'); registry['poke-hand'].fire('click');
ok('戳×3 亲密度=3', aff() === 3 && gained() === 3);
ok('戳×3 当天次数=3', T.save.today.pokes === 3);
ok('戳×3 各区台词互不重复', ['poke_head', 'poke_face', 'poke_hand'].every(k => (T.usedLines[k] || []).length === 1));
ok('表情切换到 5 表情之一', /yunsheng_(smile|shy|angry|eat|sleep)\.png$/.test(registry['room-char'].src));
ok('气泡显示', visible('bubble') && txt('bubble-text').length > 0);
T.goExterior(); T.enterRoom();
ok('戳过后再进房间不再飘引导', !visible('poke-hint'));

// —— 5b. 五区独立点按全链路：各区台词/表情随各区池，同区两次不重复 ——
const pokePool = globalThis.LINES.yunsheng.neighbor.poke;
const zoneIdx = Object.values(T.POKE_ZONES).flatMap(z => z.lines);
ok('5 区池互不重叠且恰好覆盖 qi 定稿 10 句', zoneIdx.length === pokePool.length && new Set(zoneIdx).size === pokePool.length);
const affBeforeZones = aff(), todayBeforeZones = { ...T.save.today };
Object.keys(T.POKE_ZONES).forEach(z => { delete T.usedLines['poke_' + z]; }); // 第 5 节已点过 头/脸/手，清掉再测两轮不重复
for (const [z, cfg] of Object.entries(T.POKE_ZONES)) {
  const texts = cfg.lines.map(i => pokePool[i].text);
  const seen = [];
  for (let k = 0; k < 2; k++) {
    registry['poke-' + z].fire('click');
    const t = txt('bubble-text');
    seen.push(t);
    const line = pokePool.find(l => l.text === t);
    ok(`点${cfg.label}：台词属本区`, texts.includes(t));
    ok(`点${cfg.label}：表情随台词 face`, !!line && registry['room-char'].src === 'assets/characters/yunsheng_' + line.face + '.png');
  }
  ok(`点${cfg.label}：同区两次不重复`, seen[0] !== seen[1]);
}
// 落点反馈两条分支都钉住：指针（detail>0 + clientX/Y）落在指尖；键盘（无 detail）落在该区中心
registry['poke-head'].fire('click', { detail: 1, clientX: 180, clientY: 300 });
ok('鼠标/触摸落点反馈在指尖处', registry['char-tap'].style.left === '180px' && registry['char-tap'].style.top === '300px');
registry['poke-face'].fire('click');
ok('键盘激活落点在该区中心', Math.abs(parseFloat(registry['char-tap'].style.left) - 50.5) < 0.01
  && Math.abs(parseFloat(registry['char-tap'].style.top) - 12.4) < 0.01);
T.save.affection.yunsheng = affBeforeZones; T.save.today = todayBeforeZones; T.writeSave(); // 分区覆盖不影响后续数值断言

// 5b+. 空池兜底：数据全标 needCat 时抽词不抛 TypeError（审查回归）
const pPool = globalThis.LINES.yunsheng.neighbor.poke;
const savedNeed = T.POKE_ZONES.head.lines.map(i => pPool[i].needCat);
T.POKE_ZONES.head.lines.forEach(i => { pPool[i].needCat = true; });
delete T.usedLines['poke_head'];
let emptyPick = null;
try { emptyPick = T.pickPokeLine('head'); } catch (e) { emptyPick = { threw: e }; }
T.POKE_ZONES.head.lines.forEach((i, k) => { pPool[i].needCat = savedNeed[k]; });
ok('分区空池兜底不炸', emptyPick && !emptyPick.threw && typeof emptyPick.text === 'string' && typeof emptyPick.face === 'string');
const cPool = globalThis.LINES.yunsheng.neighbor.chat;
const savedChat = cPool.map(l => l.needCat);
cPool.forEach(l => { l.needCat = true; });
delete T.usedLines['chat'];
let emptyChat = null;
try { emptyChat = T.pickLine('chat'); } catch (e) { emptyChat = { threw: e }; }
cPool.forEach((l, k) => { l.needCat = savedChat[k]; });
ok('整池空兜底不炸', emptyChat && !emptyChat.threw && typeof emptyChat.text === 'string');

// —— 5c. ?debug=1 显示 5 个框（矩形与按钮同源下发） ——
global.location = { search: '?debug=1' };
T.applyZoneRects();
ok('debug=1 挂 debug-zones（5 框可见）', registry['char-wrap'].classList.contains('debug-zones'));
ok('5 区矩形已下发到按钮', Math.abs(parseFloat(registry['poke-head'].style.left) - 41.5) < 0.01
  && Math.abs(parseFloat(registry['poke-hand'].style.width) - 4.5) < 0.01
  && /%$/.test(registry['poke-shoulderL'].style.height));
// 校准回归：5 区两两不重叠（第四单逐表情点测的前提）
{
  const zs = Object.keys(T.POKE_ZONES);
  let overlap = null;
  for (let i = 0; i < zs.length && !overlap; i++) {
    for (let j = i + 1; j < zs.length && !overlap; j++) {
      const a = T.POKE_ZONES[zs[i]].rect, b = T.POKE_ZONES[zs[j]].rect;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlap = zs[i] + '/' + zs[j];
    }
  }
  ok('5 区两两不重叠', overlap === null);
}
global.location = { search: '?debug=1&x=2' };
T.applyZoneRects();
ok('debug=1 带其他参数也识别', registry['char-wrap'].classList.contains('debug-zones'));
global.location = { search: '' };
T.applyZoneRects();
ok('无 debug 参数框撤掉', !registry['char-wrap'].classList.contains('debug-zones'));
delete global.location;

// —— 5d. 点按区与房间热点零相交（审查回归：整体命中区曾压住报告纸/小说热点，抢点击）——
function appRects(aw, ah) { // 与 layoutStages + #char-wrap CSS 同一套几何：舞台 cover 768×1376，立绘高 56%、宽按 1600/2450，top 按脚底线
  const s = Math.max(aw / 768, ah / 1376);
  const sw = 768 * s, sh = 1376 * s, sl = (aw - sw) / 2, st = (ah - sh) / 2;
  const wh = sh * 0.56, ww = wh * 1600 / 2450, wl = sl + (sw - ww) / 2;
  const wt = st + (T.FOOT_Y - T.SOLE_LINE.smile * 0.56) * sh;
  return {
    zones: Object.values(T.POKE_ZONES).map(z => ({ x: wl + z.rect.x * ww, y: wt + z.rect.y * wh, w: z.rect.w * ww, h: z.rect.h * wh })),
    hots: T.HOTSPOTS_401.map(h => ({ x: sl + h.rect.x * sw, y: st + h.rect.y * sh, w: h.rect.w * sw, h: h.rect.h * sh }))
  };
}
function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
for (const [aw, ah] of [[320, 568], [360, 640], [390, 844]]) { // #app 宽被 CSS 封顶 390，更宽的视口几何与 390 同构，改钉中间高度
  const r = appRects(aw, ah);
  ok(`${aw}×${ah}：5 点按区与 4 房间热点零相交`, r.zones.every(z => r.hots.every(h => !overlap(z, h))));
}
const zoneRects = Object.values(T.POKE_ZONES).map(z => z.rect);
ok('5 点按区彼此不重叠', zoneRects.every((a, i) => zoneRects.every((b, j) => i === j || !overlap(a, b))));
const hotRects = T.HOTSPOTS_401.map(h => h.rect);
ok('4 房间热点彼此不重叠（旧目测值咖啡压报告纸）', hotRects.every((a, i) => hotRects.every((b, j) => i === j || !overlap(a, b))));

// —— 5e. 动作小人挂载点：定位跟表、缺图自动隐藏、null/未知名字撤 ——
(function () {
  const el = registry['room-action'];
  T.setRoomAction(null);
  ok('setRoomAction(null) 撤动作小人', el.classList.contains('hidden'));
  T.setRoomAction('report');
  const r = T.ACTION_SPOTS_401.report.rect;
  ok('动作挂载点定位跟 ACTION_SPOTS_401', el.style.left === (r.x * 100) + '%' && el.style.top === (r.y * 100) + '%'
    && el.style.width === (r.w * 100) + '%' && el.style.height === (r.h * 100) + '%');
  ok('挂载点指向约定资产名', el.src === T.ACTION_SPOTS_401.report.asset);
  el.onerror();
  ok('qi 图未到位自动隐藏（不出破图）', el.classList.contains('hidden'));
  el.onload();
  ok('图加载完成才显示', !el.classList.contains('hidden'));
  T.setRoomAction('nope');
  ok('未知动作名按撤处理', el.classList.contains('hidden'));
})();

// —— 5b. 脚底线对齐：top 与 --sole 按各自实测脚底线下发，落点 FOOT_Y 全表情同一 ——
['smile', 'shy', 'angry', 'eat', 'sleep'].forEach(f => {
  T.applyFootAlign(f);
  const s = T.SOLE_LINE[f];
  ok(`脚底对齐 ${f}：top=(FOOT_Y-sole*0.56) 且 --sole 下发`, registry['char-wrap'].style.top === ((T.FOOT_Y - s * 0.56) * 100).toFixed(3) + '%'
    && String(registry['screen-room'].style['--sole']) === String(s));
});
ok('脚落点在地毯区间（401 底图实测 0.686–0.90）', T.FOOT_Y > 0.686 && T.FOOT_Y < 0.90);
// —— 5b+. 三层脚下阴影：先画影再画人；--fc 下发；接触线条数与几何 = 各立绘实测 ——
ok('阴影三层都在立绘之前（先画影再画人）',
  html.indexOf('id="shadow-outer"') < html.indexOf('id="room-char"')
  && html.indexOf('id="shadow-core"') < html.indexOf('id="room-char"')
  && html.indexOf('id="char-contacts"') < html.indexOf('id="room-char"'));
['smile', 'shy', 'angry', 'eat', 'sleep'].forEach(f => {
  T.applyFootAlign(f);
  const g = T.FEET_GEOM['yunsheng_' + f];
  const bands = registry['char-contacts'].children;
  ok(`阴影 ${f}：--fc 下发且接触线条数 = 实测落地脚数`, String(registry['screen-room'].style['--fc']) === String(g.fc) && bands.length === g.feet.length);
  const b = bands[0];
  ok(`阴影 ${f}：首条接触线几何 = 实测脚 0（x/宽/sole 上下 0.011w/0.013w）`,
    b.style.left === (g.feet[0][0] * 100) + '%'
    && b.style.width === ((g.feet[0][1] - g.feet[0][0]) * 100) + '%'
    && b.style.top === 'calc(' + (g.feet[0][2] * 100) + '% - 0.011 * var(--wp, 200px))'
    && b.style.height === 'calc(0.024 * var(--wp, 200px))');
});
T.applyFootAlign('smile');

// —— 5c. 渲染期去白边：只压外沿浅色描边的颜色，alpha 与内层本色一律不动 ——
(function () {
  const w = 7, h = 7;
  const p = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const inside = x >= 1 && x <= 5 && y >= 1 && y <= 5;
    const ring = inside && (x === 1 || x === 5 || y === 1 || y === 5);
    const c = ring ? 200 : 40; // 外沿一圈浅色描边，内层深色本色
    p[i] = c; p[i + 1] = c; p[i + 2] = c; p[i + 3] = inside ? 255 : 0;
  }
  const alphaBefore = Array.from(p).filter((_, i) => i % 4 === 3);
  T.edgeBandRecolor(p, w, h);
  const r = (1 * w + 1) * 4;
  ok('去白边：外沿浅色描边压成内层深色', p[r] < 60 && p[r + 1] < 60 && p[r + 2] < 60);
  ok('去白边：alpha 一个像素都不动（轮廓不变硬不变粗）',
    Array.from(p).filter((_, i) => i % 4 === 3).every((v, i) => v === alphaBefore[i]));
  ok('去白边：内层本色像素不被改', p[(3 * w + 3) * 4] === 40 && p[(3 * w + 3) * 4 + 3] === 255);
})();

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
const affBefore11 = aff();
T.doPoke(); // 第 11 次：若删掉 >POKE_DAILY_LIMIT 分支此断言必挂
ok('第 11 次戳不涨', gained() === 10 && T.save.today.pokes === 11);
ok('第 11 次戳不扣好感', aff() === affBefore11);

// —— 10. 立绘兜底：报错出占位（阴影/点击区同撤），换到能加载的表情图全部撤占位 ——
T.setFace('eat'); // 钉住当前表情（第 9 节随机停在 angry/shy/smile），下面的同 src 断言才确定
registry['room-char'].fire('error');
ok('立绘报错出占位', visible('char-placeholder') && registry['room-char'].dataset.broken === '1');
ok('立绘报错时阴影与点击区一并撤掉', registry['char-wrap'].classList.contains('broken'));
ok('立绘报错时 img 挂 .broken（否则露 alt 破图标）', registry['room-char'].classList.contains('broken'));
T.setFace('smile');
ok('setFace 加载途中保持兜底（不闪破图标）', visible('char-placeholder') && registry['room-char'].classList.contains('broken'));
registry['room-char'].fire('load');
ok('load 后撤占位并恢复阴影与点击区', !visible('char-placeholder') && registry['room-char'].dataset.broken === undefined && !registry['char-wrap'].classList.contains('broken') && !registry['room-char'].classList.contains('broken'));
registry['room-char'].fire('error');
ok('再次报错占位回来', visible('char-placeholder') && registry['char-wrap'].classList.contains('broken'));
T.setFace('smile'); // 同 src：浏览器不会重发 load/error，清掉 broken 会露 alt 破图标（审查回归）
ok('同 src 重设不清 broken', visible('char-placeholder') && registry['char-wrap'].classList.contains('broken'));
registry['room-char'].fire('load');
ok('load 成功撤占位', !visible('char-placeholder') && registry['room-char'].dataset.broken === undefined && !registry['char-wrap'].classList.contains('broken'));

// —— 11. 触发剧情：深夜送咖啡 ——
T.save.scenes = {}; T.writeSave();
T.updateSceneEntry();
ok('剧情入口可演', registry['scene-entry'].disabled === false && txt('scene-state') === '可以演');
ok('未演时「一起」圆钮可用', registry['btn-together'].disabled === false && !registry['btn-together'].classList.contains('unavailable'));
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
ok('演完「一起」圆钮变暗停呼吸（unavailable + aria-disabled）', registry['btn-together'].classList.contains('unavailable') && registry['btn-together'].getAttribute('aria-disabled') === 'true');
ok('演完圆钮仍可点开面板看「今天已经演过啦」', registry['btn-together'].disabled === false);

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
global.localStorage._s['yuejian_save_v1'] = JSON.stringify({ v: 1, today: { date: 123, gained: -5, pokes: '12', capMsgShown: 'yes' } }); // today 叶子校验（date 用非字符串钉住重置逻辑）
const healed4 = T.loadSave();
ok('today 叶子校验（date/gained/pokes/capMsg 归正）', !!healed4 && healed4.today.date === '' && healed4.today.gained === 0 && healed4.today.pokes === 0 && healed4.today.capMsgShown === false);
global.localStorage._s['yuejian_save_v1'] = JSON.stringify({ v: 1, affection: 'junk', mood: 5, coaster: true }); // 容器本身不是对象：逐字段治愈而非整档作废
const healed5 = T.loadSave();
ok('容器非对象也逐字段治愈', !!healed5 && typeof healed5.affection === 'object' && healed5.affection.yunsheng === 0 && typeof healed5.mood === 'object' && healed5.mood.yunsheng === 60 && healed5.coaster === true);
global.localStorage._s['yuejian_save_v1'] = '{bad json';
ok('坏档不崩→新档', T.loadSave() === null);
global.localStorage._s['yuejian_save_v1'] = JSON.stringify({ v: 99 });
ok('版本不对→新档', T.loadSave() === null);

// —— 13. 返回公寓 ——
T.goExterior();
ok('返回外观', visible('screen-exterior') && !visible('screen-room'));

console.log(`冒烟测试：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
