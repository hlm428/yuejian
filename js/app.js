'use strict';
/* 月见公寓 · 阶段 A：公寓外观主界面 + 401 云笙房间 + 触发剧情（深夜送咖啡）
   主界面 = v8 定稿外观（底图 + 12 张窗贴片 + data/windows.js 窗位 + data/passerby.js 路人窗，阶段 A 路人窗常亮不点按）。
   亮灯纯函数 bandOf / lightOn / yelanAsleep / patrolTonight 自任务 1 逻辑不动（规则 SPEC §8.1），
   仅夜澜窗 id 由 'b1'（旧剖面图地下室）改为 '7f'（v3.2 定稿：顶层 7F 整层）。
   存档键 yuejian_save_v1（带 v: 1 版本字段），每次变化即存。 */

/* ---------- 存档（阶段 A 字段：亲密度 / 心情 / 今天 / 杯垫 / 触发剧情 / 上次打开时间） ---------- */
var SAVE_KEY = 'yuejian_save_v1';
var SAVE_V = 1;
var DAILY_SOFT_CAP = 20;   // 每天亲密度软上限（qi 已定，SPEC §6）
var POKE_DAILY_LIMIT = 10; // 单日戳超过 10 次不再涨亲密度（冷脸反应，第二天恢复，不扣好感）

function defaultSave() {
  return {
    v: SAVE_V,
    affection: { yunsheng: 0, zhixi: 0, xiyue: 0, yelan: 0 },
    mood: { yunsheng: 60, zhixi: 60, xiyue: 60, yelan: 60 },
    today: { date: '', gained: 0, pokes: 0, capMsgShown: false },
    coaster: false,   // 云笙桌上的杯垫（喂黑咖啡后出现，重开还在）
    scenes: {},       // 触发剧情：{ yunsheng_coffee: '2026-11-08' } = 深夜送咖啡哪天演过
    lastOpened: ''
  };
}

/* 数值叶子自愈：键集从 defaults 派生（阶段 B 加角色不用改这里）；
   容器本身不是对象也一并兜住并返回新对象——将来任何调用点写 s.temper = healStats(s.temper, d.temper)
   都不会因为忘了判容器而在 try/catch 里炸出「整档作废」 */
function healStats(target, defaults) {
  var t = isPlainObj(target) ? target : {};
  Object.keys(defaults).forEach(function (p) {
    if (typeof t[p] !== 'number' || !isFinite(t[p])) t[p] = defaults[p];
    t[p] = Math.max(0, Math.min(100, t[p]));
  });
  return t;
}

function loadSave() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || s.v !== SAVE_V) return null;
    // 字段级自愈：容器和数值叶子逐项校验——半截或手改的存档不崩、不往数值管道里进 NaN/undefined
    var d = defaultSave();
    s.affection = healStats(s.affection, d.affection);
    s.mood = healStats(s.mood, d.mood);
    if (!isPlainObj(s.today)) s.today = {};
    if (typeof s.today.date !== 'string') s.today.date = '';
    if (typeof s.today.gained !== 'number' || !isFinite(s.today.gained) || s.today.gained < 0) s.today.gained = 0;
    if (typeof s.today.pokes !== 'number' || !isFinite(s.today.pokes) || s.today.pokes < 0) s.today.pokes = 0;
    if (typeof s.today.capMsgShown !== 'boolean') s.today.capMsgShown = false;
    if (!isPlainObj(s.scenes)) s.scenes = {};
    if (typeof s.coaster !== 'boolean') s.coaster = false;
    return s;
  } catch (e) { return null; } // 版本不对或坏了就用新档，不要崩
}

function isPlainObj(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function writeSave() {
  try {
    save.lastOpened = new Date().toISOString();
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) { /* 隐身模式等写入失败不致命 */ }
}

var save = loadSave() || defaultSave();

/* 跨天：日期变了就重置当天计数（戳的次数 / 已获得亲密度 / 上限提示），冷脸第二天恢复 */
function ensureToday() {
  var k = dateKeyOf(new Date());
  if (save.today.date !== k) {
    save.today = { date: k, gained: 0, pokes: 0, capMsgShown: false };
    writeSave();
  }
}

/* ---------- 时间与亮灯规则（SPEC §8.1，任务 1 逻辑不动） ---------- */
/* 时段：00–05 / 05–08 / 08–17 / 17–24 */
function bandOf(h) {
  if (h < 5) return 'night0';
  if (h < 8) return 'early';
  if (h < 17) return 'day';
  return 'evening';
}

/* 云笙 00–05「偶尔灭，表示出警」：按日期确定性伪随机（同一天结果一致，约 1/7 的日子出警）。
   出警概率/规则 qi 未定数值，实现层先取 1/7，CHANGELOG 有记录，可调。 */
function patrolTonight(dateKey) {
  var hash = 5381;
  for (var i = 0; i < dateKey.length; i++) {
    hash = ((hash << 5) + hash + dateKey.charCodeAt(i)) >>> 0;
  }
  return hash % 7 === 0;
}

function isWeekend(d) {
  var w = d.getDay();
  return w === 0 || w === 6;
}

function lightOn(roomId, band, opts) {
  switch (roomId) {
    case '302': return true;                                   // 302 始终亮
    case '301': return band === 'early' || band === 'evening'; // 知夕：白天在甜品店
    case '401':                                                // 云笙：白天实验室，深夜可能出警
      if (band === 'night0') return !opts.patrol;
      return band === 'early' || band === 'evening';
    case '501':                                                // 曦月：白天练琴，周末白天回本家
      if (band === 'day') return !opts.weekend;
      return band === 'evening';
    case '7f': return band === 'night0' || band === 'evening'; // 夜澜：顶层 7F，白天睡觉，天黑出来
    case 'store': {                                            // 便利店 07:00 开、23:00 打烊（底图先常亮，遮罩阶段 C）
      var h = opts.hour;
      return h >= 7 && h < 23;
    }
    default: return false;
  }
}

/* 夜澜白天（05–17）人在睡觉：灯灭人不在窗前，点击有专属提示 */
function yelanAsleep(band) {
  return band === 'early' || band === 'day';
}

/* ---------- 数据配置 ---------- */
var WINDOW_IDS = ['7f', '501', '401', '301', '302'];
var PEOPLE = {
  '7f':  { room: '顶层 7F', who: '皇甫夜澜', char: 'yelan',
           doing: { A: '在沙发上举着红果汁', B: '在书架旁看书', C: '举杯看着月亮' } },
  '501': { room: '501', who: '幸曦月', char: 'xiyue',
           doing: { A: '正在弹琴', B: '在扶手椅上喝红茶', C: '在插白玫瑰' } },
  '401': { room: '401', who: '顾云笙', char: 'yunsheng',
           doing: { A: '在台灯下写报告', B: '站在桌边打电话', C: '抱着灰猫坐在沙发上' } },
  '301': { room: '301', who: '宋知夕', char: 'zhixi',
           doing: { A: '在窗边吃草莓蛋糕', B: '坐在床上朝你挥手', C: '趴在床上戴耳机玩手机' } },
  '302': { room: '302', who: '你' }
};

/* 401 房间热点：一句话反应。矩形坐标是实现层按 room_401_yunsheng.png（768×1376）目测估计的，
   没有 windows.js 那样的实测数据——CHANGELOG 有记录，qi 试玩后可调。 */
var HOTSPOTS_401 = [
  { id: 'coffee',  name: '黑咖啡', rect: { x: 0.115, y: 0.425, w: 0.11,  h: 0.085 }, text: '续杯？' },
  { id: 'papers',  name: '报告纸', rect: { x: 0.21,  y: 0.425, w: 0.23,  h: 0.085 }, text: '别乱翻。' },
  { id: 'novel',   name: '推理小说', rect: { x: 0.585, y: 0.24,  w: 0.20,  h: 0.28  }, text: '凶手太蠢了。' },
  { id: 'catbowl', name: '猫碗', rect: { x: 0.72,  y: 0.585, w: 0.135, h: 0.075 }, text: '空的。猫还没来。' }
];

var COASTER_RECT = { x: 0.245, y: 0.484, w: 0.062, h: 0.03 }; // 杯垫出现位置（桌上，报告纸前方）

/* ---------- 运行状态 ---------- */
var rolls = {};       // 每人本次打开游戏抽到的动作套：'7f'/'501'/'401'/'301' → 0/1/2（A/B/C），不存档
var usedLines = {};   // 同一会话台词不重复：{ poke: [下标], chat: [下标] }
var bubbleTimer = null;
var toastTimer = null;
var cardId = null;
var sceneState = null; // 触发剧情播放状态

function rand3() { return Math.floor(Math.random() * 3); } // 每进一次游戏重抽一次

function byId(id) { return document.getElementById(id); }

function setRect(el, r) {
  el.style.left = (r.x * 100) + '%';
  el.style.top = (r.y * 100) + '%';
  el.style.width = (r.w * 100) + '%';
  el.style.height = (r.h * 100) + '%';
}

function fmtClock(d) {
  var wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + wk + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function dateKeyOf(d) {
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* ---------- toast / 气泡 ---------- */
function toast(msg) {
  var el = byId('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2400);
}

function showBubble(text) {
  var el = byId('bubble');
  byId('bubble-text').textContent = text;
  el.classList.remove('hidden');
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(hideBubble, 2800);
}
function hideBubble() {
  var el = byId('bubble');
  if (el) el.classList.add('hidden');
}

/* ---------- 外观：贴片 / 遮罩 / 点按区 ---------- */
function buildExterior() {
  var stage = byId('stage');
  WINDOW_IDS.forEach(function (id) {
    var w = window.WINDOWS[id];
    if (!w) return;
    if (w.A) { // 302 窗内不放人（windows.js 只给 hotspot）
      var img = document.createElement('img');
      img.className = 'patch';
      img.id = 'patch-' + id;
      img.alt = PEOPLE[id].who || '';
      img.draggable = false;
      img.src = w[['A', 'B', 'C'][rolls[id]]].file; // 本次抽到的动作套；同窗三套位置相同，只换文件
      setRect(img, w.A);
      stage.appendChild(img);
    }
    if (id !== '302') { // 302 始终亮，永远不需要灭窗遮罩
      var mask = document.createElement('div');
      mask.className = 'win-dark';
      mask.id = 'mask-' + id;
      setRect(mask, w.hotspot); // 灭窗遮罩 = hotspot 矩形
      stage.appendChild(mask);
    }

    var hot = document.createElement('div');
    hot.className = 'win-hot';
    hot.id = 'hot-' + id;
    setRect(hot, w.hotspot);
    hot.addEventListener('click', function () { onWindowClick(id); });
    stage.appendChild(hot);
  });
}

/* 亮灯 + 当前真实时间渲染；302 始终亮（无贴片无遮罩），路人窗阶段 A 常亮（底图自带，不渲染） */
function renderExterior() {
  var now = new Date();
  var h = now.getHours();
  var band = bandOf(h);
  var opts = { hour: h, weekend: isWeekend(now), patrol: patrolTonight(dateKeyOf(now)) };
  byId('clock-chip').textContent = fmtClock(now);
  WINDOW_IDS.forEach(function (id) {
    if (id === '302') return;
    var on = lightOn(id, band, opts);
    var patch = byId('patch-' + id);
    if (patch) patch.style.display = (on && patch.dataset.broken !== '1') ? '' : 'none'; // 窗亮显示抽到的贴片（挂掉的贴片保持隐藏）
    var mask = byId('mask-' + id);
    if (mask) mask.style.display = on ? 'none' : '';   // 窗灭盖深蓝灰遮罩
  });
}

/* 点窗：亮的弹卡片，灭的一句提示（v3.2 §4 / 阶段 A 提示词） */
function onWindowClick(id) {
  var now = new Date();
  var h = now.getHours();
  var band = bandOf(h);
  var opts = { hour: h, weekend: isWeekend(now), patrol: patrolTonight(dateKeyOf(now)) };
  if (id === '302') { showCard('302'); return; }
  if (lightOn(id, band, opts)) { showCard(id); return; }
  if (id === '7f' && yelanAsleep(band)) { toast('她在睡觉，别吵她'); return; }
  if (id === '401') {
    if (band === 'day') { toast('她在实验室'); return; }
    if (band === 'night0' && opts.patrol) { toast('她被叫去现场了'); return; }
    toast('她不在家'); return;
  }
  if (id === '301' && band === 'day') { toast('她在甜品店'); return; }
  if (id === '501' && band === 'day' && opts.weekend) { toast('她回本家了'); return; }
  toast('她不在家');
}

/* ---------- 窗卡片 ---------- */
function showCard(id) {
  cardId = id;
  var p = PEOPLE[id];
  var avatar = byId('card-avatar');
  if (id === '302') {
    avatar.src = 'assets/characters/mc_front.png';
    avatar.alt = '你';
  } else {
    avatar.src = 'assets/characters/' + p.char + '_smile.png'; // 头像用 _smile 立绘小图
    avatar.alt = p.who;
  }
  byId('card-name').textContent = (id === '302') ? '你的房间' : p.who;
  byId('card-room').textContent = p.room;
  byId('card-doing').textContent = id === '302' ? '' : p.doing[['A', 'B', 'C'][rolls[id]]];

  var visit = byId('card-visit');
  var note = byId('card-note');
  if (id === '302') {
    visit.classList.add('hidden'); // 302 没有拜访按钮
    note.textContent = '你的房间，阶段 C 再布置';
    note.classList.remove('hidden');
  } else if (id === '401') {
    visit.classList.remove('hidden');
    visit.disabled = false;
    note.classList.add('hidden');
  } else {
    visit.classList.remove('hidden');
    visit.disabled = true; // 其余三人拜访灰掉
    note.textContent = '她的房间还在布置，过几天再来';
    note.classList.remove('hidden');
  }
  byId('window-card').classList.remove('hidden');
  byId('card-backdrop').classList.remove('hidden');
}

function closeCard() {
  cardId = null;
  byId('window-card').classList.add('hidden');
  byId('card-backdrop').classList.add('hidden');
}

/* ---------- 屏幕切换 ---------- */
function enterRoom() {
  ensureToday();
  closeCard();
  byId('screen-exterior').classList.add('hidden');
  byId('screen-room').classList.remove('hidden');
  setFace('smile');
  updateStats();
  updateCoaster();
  updateSceneEntry();
  closePopups();
  hideBubble();
}

function goExterior() {
  closePopups();
  hideBubble();
  closeScene();
  byId('screen-room').classList.add('hidden');
  byId('screen-exterior').classList.remove('hidden');
  renderExterior();
}

/* ---------- 401 房间 ---------- */
var ROOM_FACES = ['smile', 'shy', 'angry', 'eat', 'sleep']; // 只在 5 张表情图之间切换，_full 不用在房间里

function setFace(face) {
  if (ROOM_FACES.indexOf(face) < 0) face = 'smile';
  var img = byId('room-char');
  delete img.dataset.broken; // 新表情图重新参与兜底判定
  byId('char-placeholder').classList.add('hidden');
  img.src = 'assets/characters/yunsheng_' + face + '.png';
}

function buildRoomHotspots() {
  var stage = byId('room-stage');
  HOTSPOTS_401.forEach(function (hs) {
    var el = document.createElement('div');
    el.className = 'room-hot';
    el.title = hs.name;
    setRect(el, hs.rect);
    el.addEventListener('click', function () { showBubble(hs.text); });
    stage.appendChild(el);
  });
}

function updateCoaster() {
  var el = byId('coaster');
  if (save.coaster) { setRect(el, COASTER_RECT); el.classList.remove('hidden'); }
  else { el.classList.add('hidden'); }
}

function updateStats() {
  byId('stat-mood').textContent = save.mood.yunsheng;
  byId('stat-aff').textContent = save.affection.yunsheng;
}

function hopChar() {
  var el = byId('char-wrap');
  el.classList.remove('hop');
  void el.offsetWidth; // 重置动画
  el.classList.add('hop');
}

/* ---------- 台词抽取 ---------- */
/* 戳 / 聊天：同一会话不重复（一轮抽完重置）。needCat 的句子楼道猫出现后才会说（阶段 A 猫未出现，跳过）。 */
function pickLine(kind) {
  var pool = window.LINES.yunsheng.neighbor[kind];
  var used = usedLines[kind] || (usedLines[kind] = []);
  var cand = [];
  for (var i = 0; i < pool.length; i++) {
    if (pool[i].needCat) continue;
    if (used.indexOf(i) >= 0) continue;
    cand.push(i);
  }
  if (!cand.length) {
    used = usedLines[kind] = [];
    for (var j = 0; j < pool.length; j++) {
      if (!pool[j].needCat) cand.push(j);
    }
  }
  var pick = cand[Math.floor(Math.random() * cand.length)];
  used.push(pick);
  return pool[pick];
}

/* 喂：按东西随机抽一句（needCat 不抽，猫还没出现） */
function pickFeed(item) {
  var pool = window.LINES.yunsheng.neighbor.feed;
  var cand = [];
  for (var i = 0; i < pool.length; i++) {
    if (pool[i].needCat) continue;
    if (pool[i].item !== item) continue;
    cand.push(pool[i]);
  }
  if (!cand.length) return null;
  return cand[Math.floor(Math.random() * cand.length)];
}

/* ---------- 数值管道 ---------- */
/* 心情 ≥70 亲密度 ×1.5，<30 ×0.5，其余 ×1（向下取整）；每天获得到 20 之后只涨一半（向下取整）。 */
function moodMul(m) { return m >= 70 ? 1.5 : (m < 30 ? 0.5 : 1); }

function gainAffection(base) {
  ensureToday();
  var pastCap = save.today.gained >= DAILY_SOFT_CAP; // 本次互动之前是否已到软上限
  var g = Math.floor(base * moodMul(save.mood.yunsheng));
  if (pastCap) g = Math.floor(g / 2);
  if (g > 0) {
    save.affection.yunsheng = Math.min(100, save.affection.yunsheng + g);
    save.today.gained += g;
  }
  if (pastCap && !save.today.capMsgShown) { // 每天只弹一次
    save.today.capMsgShown = true;
    toast('云笙：「今天已经很开心了，明天再来吧。」');
  }
  writeSave();
  updateStats();
  return g;
}

/* ---------- 三个互动（阶段 A 不做送东西、哄睡） ---------- */
function doPoke() {
  ensureToday();
  save.today.pokes += 1;
  var line = pickLine('poke');
  setFace(line.face);
  hopChar(); // 小跳一下
  showBubble(line.text);
  if (save.today.pokes > POKE_DAILY_LIMIT) { // 戳太多：当天不再涨，不扣好感
    writeSave();
    updateStats();
    return;
  }
  gainAffection(1);
}

function doFeed(item) {
  ensureToday();
  var line = pickFeed(item);
  if (!line) { toast('云笙没有回应。'); return; } // 台词数据缺该物品时的兜底，正常数据到不了这里
  setFace(line.face);
  showBubble(line.text);
  if (item === 'sweets') {
    save.mood.yunsheng = Math.max(0, save.mood.yunsheng - 10); // 甜食：心情 −10（下限 0），亲密度 +0
  } else {
    save.mood.yunsheng = Math.min(100, save.mood.yunsheng + 5); // 黑咖啡/猫罐头/面包：心情 +5（上限 100）
    gainAffection(3);
  }
  if (item === 'black_coffee' && !save.coaster) { // 喂黑咖啡后桌上出现杯垫（存档记下来）
    save.coaster = true;
    updateCoaster();
    toast('桌上多了一个杯垫');
  }
  writeSave();
  updateStats();
}

function doChat() {
  ensureToday();
  var line = pickLine('chat');
  setFace(line.face);
  showBubble(line.text);
  gainAffection(2);
}

/* ---------- 弹出面板（喂 / 一起） ---------- */
function closePopups() {
  byId('feed-panel').classList.add('hidden');
  byId('together-panel').classList.add('hidden');
}

function togglePanel(id) {
  var el = byId(id);
  var wasHidden = el.classList.contains('hidden');
  closePopups();
  if (wasHidden) el.classList.remove('hidden');
}

/* ---------- 触发剧情：深夜送咖啡（每天限演一次；不限制真实时间） ---------- */
function updateSceneEntry() {
  var playedToday = save.scenes.yunsheng_coffee === dateKeyOf(new Date());
  byId('scene-entry').disabled = playedToday;
  byId('scene-state').textContent = playedToday ? '今天已经演过啦' : '可以演';
}

function startScene() {
  closePopups();
  hideBubble();
  var scene = (window.SCENES.yunsheng || [])[0];
  if (!scene) return;
  sceneState = { scene: scene, idx: 0, display: null };
  byId('scene-overlay').classList.remove('hidden');
  renderBeat();
}

/* 把一拍渲染到对话框；display 优先（二选一后插播的主控台词 / 她的回复） */
function renderDialog(speaker, text, note, showHint) {
  byId('scene-speaker').textContent = speaker;
  byId('scene-text').textContent = text;
  byId('scene-text').classList.remove('hidden');
  var noteEl = byId('scene-note');
  if (note) { noteEl.textContent = note; noteEl.classList.remove('hidden'); }
  else { noteEl.classList.add('hidden'); }
  byId('scene-hint').classList.toggle('hidden', !showHint);
  byId('scene-choices').classList.add('hidden');
}

function renderBeat() {
  if (!sceneState) return;
  var d = sceneState.display;
  if (d) { renderDialog(d.speaker, d.text, d.note, true); return; }
  var beat = sceneState.scene.beats[sceneState.idx];
  if (!beat) { finishScene(); return; }
  if (beat.type === 'choice') {
    byId('scene-speaker').textContent = '你';
    byId('scene-text').classList.add('hidden');
    byId('scene-note').classList.add('hidden');
    byId('scene-hint').classList.add('hidden');
    byId('scene-choice-a').textContent = beat.options[0].label;
    byId('scene-choice-b').textContent = beat.options[1].label;
    byId('scene-choices').classList.remove('hidden');
    return;
  }
  renderDialog(beat.name || '旁白', beat.text, beat.note, true);
}

function advanceScene() {
  if (!sceneState) return;
  var d = sceneState.display;
  if (d) { // 正在插播：主控那句 → 她的回复 → 回正片
    if (d.next === 'reply') {
      sceneState.display = { speaker: d.reply.name, text: d.reply.text, note: d.reply.note, next: 'resume' };
      renderBeat();
    } else {
      sceneState.display = null;
      sceneState.idx += 1;
      if (sceneState.idx >= sceneState.scene.beats.length) finishScene();
      else renderBeat();
    }
    return;
  }
  var beat = sceneState.scene.beats[sceneState.idx];
  if (!beat || beat.type === 'choice') return; // 二选一必须点按钮
  sceneState.idx += 1;
  if (sceneState.idx >= sceneState.scene.beats.length) finishScene();
  else renderBeat();
}

function chooseScene(i) {
  if (!sceneState) return;
  var beat = sceneState.scene.beats[sceneState.idx];
  if (!beat || beat.type !== 'choice') return;
  var opt = beat.options[i];
  sceneState.display = { speaker: '你', text: opt.label, note: '', next: 'reply', reply: opt.reply };
  renderBeat();
}

function finishScene() {
  var scene = sceneState.scene;
  var g = gainAffection(scene.reward.affection); // +8 计入当天软上限（心情倍率照常生效）
  var newCoaster = scene.reward.coaster && !save.coaster;
  if (newCoaster) {
    save.coaster = true;
    updateCoaster();
  }
  if (g > 0 && newCoaster) toast('亲密度 +' + g + '，桌上多了一个杯垫');
  else if (g > 0) toast('亲密度 +' + g);
  else if (newCoaster) toast('桌上多了一个杯垫');
  save.scenes[scene.id] = dateKeyOf(new Date()); // 记下哪天演过
  writeSave();
  closeScene();
  updateStats();
  updateSceneEntry();
}

function closeScene() {
  sceneState = null;
  var el = byId('scene-overlay');
  if (el) el.classList.add('hidden');
}

/* ---------- 图片缺失兜底：柔和占位，不白屏（SPEC §4.3） ---------- */
/* 判定谓词单独抽出，tests/test_lights.js 直接覆盖 */
function isPortraitBroken(img) {
  return img.complete && img.naturalWidth === 0 && !img.dataset.broken;
}

function bindPortraitFallback() {
  var imgs = document.querySelectorAll('.patch, #room-char');
  Array.prototype.forEach.call(imgs, function (img) {
    img.addEventListener('error', function () {
      img.dataset.broken = '1';
      if (img.id === 'room-char') byId('char-placeholder').classList.remove('hidden');
      else img.style.display = 'none';
    });
    if (img.id === 'room-char') { // 换到能正常加载的表情图后撤掉占位，不让它卡在立绘上面
      img.addEventListener('load', function () {
        delete img.dataset.broken;
        byId('char-placeholder').classList.add('hidden');
      });
    }
    // 解析期就已失败的图（error 早于本监听挂上，双击 file:// 打开时可能发生）：同趟补扫
    if (isPortraitBroken(img)) {
      img.dataset.broken = '1';
      if (img.id === 'room-char') byId('char-placeholder').classList.remove('hidden');
      else img.style.display = 'none';
    }
  });
}

/* ---------- cover 舞台尺寸：底图 768×1376，按 cover 计算恰好铺满 #app、居中裁边 ---------- */
function layoutStages() {
  var app = byId('app');
  var aw = app.clientWidth;
  var ah = app.clientHeight;
  var s = Math.max(aw / 768, ah / 1376);
  var w = 768 * s;
  var h = 1376 * s;
  var left = (aw - w) / 2;
  var top = (ah - h) / 2;
  ['stage', 'room-stage'].forEach(function (id) {
    var el = byId(id);
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  });
}

/* ---------- 启动 ---------- */
function bindEvents() {
  byId('card-close').addEventListener('click', closeCard);
  byId('card-backdrop').addEventListener('click', closeCard);
  byId('card-visit').addEventListener('click', function () {
    if (cardId === '401') enterRoom();
  });

  byId('btn-back').addEventListener('click', goExterior);
  byId('btn-poke').addEventListener('click', function () { closePopups(); doPoke(); });
  byId('btn-feed').addEventListener('click', function () { togglePanel('feed-panel'); });
  byId('btn-chat').addEventListener('click', function () { closePopups(); doChat(); });
  byId('btn-together').addEventListener('click', function () { togglePanel('together-panel'); });

  var feedBtns = document.querySelectorAll('#feed-panel .feed-grid button');
  Array.prototype.forEach.call(feedBtns, function (btn) {
    btn.addEventListener('click', function () {
      closePopups();
      doFeed(btn.getAttribute('data-item'));
    });
  });

  byId('scene-entry').addEventListener('click', function () {
    if (!byId('scene-entry').disabled) startScene();
  });

  byId('scene-box').addEventListener('click', advanceScene);
  // 二选一按钮：阻止冒泡，避免点选的同一击立刻把插播台词也翻过去
  byId('scene-choice-a').addEventListener('click', function (e) { e.stopPropagation(); chooseScene(0); });
  byId('scene-choice-b').addEventListener('click', function (e) { e.stopPropagation(); chooseScene(1); });
}

function init() {
  ensureToday();
  // 每进一次游戏重抽一次 A/B/C（Math.floor(Math.random()*3)，四人可不同，不存档）
  rolls = { '7f': rand3(), '501': rand3(), '401': rand3(), '301': rand3() };
  buildExterior();
  buildRoomHotspots();
  bindPortraitFallback();
  bindEvents();
  layoutStages();
  window.addEventListener('resize', layoutStages);
  renderExterior();
  setInterval(renderExterior, 30000); // 半分钟同步一次真实时间，跨过时段灯会自动变
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
