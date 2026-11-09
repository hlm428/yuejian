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

/* 数值叶子自愈：键集从 defaults 派生（阶段 B 加角色不用改这里），容器不是对象也在 helper 内兜住。
   契约：必须接住返回值——s.temper = healStats(s.temper, d.temper)，不接返回值时治愈结果会被丢弃。
   只用于 0–100 的数值组（affection / mood）；today / scenes 等非数值叶子仍走 loadSave 里的内联守卫，
   不要套用本函数（0–100 夹取会弄坏字符串 / 布尔叶子）。 */
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

/* 401 房间热点：一句话反应。矩形按 room_401_yunsheng.png（768×1376）逐像素复测（2026-11-10，替换目测值）：
   咖啡=杯+碟+热气柱，报告纸=桌面纸叠，小说=第四层书架带书名的那一排，猫碗=地上食盆；
   各留 ~4px 触摸余量，四框彼此不相交，且与 5 个点按区零相交（冒烟测试按三种视口钉死），
   否则点她肩膀会被热点抢走或反过来。 */
var HOTSPOTS_401 = [
  { id: 'coffee',  name: '黑咖啡', rect: { x: 0.1172, y: 0.4113, w: 0.0859, h: 0.0625 }, text: '续杯？' },
  { id: 'papers',  name: '报告纸', rect: { x: 0.2057, y: 0.4499, w: 0.1901, h: 0.0422 }, text: '别乱翻。' },
  { id: 'novel',   name: '推理小说', rect: { x: 0.5938, y: 0.3735, w: 0.1302, h: 0.0610 }, text: '凶手太蠢了。' },
  { id: 'catbowl', name: '猫碗', rect: { x: 0.7344, y: 0.6039, w: 0.0885, h: 0.0327 }, text: '空的。猫还没来。' }
];

// 杯垫位置（2026-11-10 qi 反馈后挪进桌面）：报告纸前缘右段、书右侧的空档；不压杯/纸/书
// 离桌前沿上棱实测 ≈19 底图像素 ≈ 杯垫可见高 20 的 0.96 倍（零遮挡前提下最大间隙位）；是否达标交 qi 验收
var COASTER_RECT = { x: 0.2266, y: 0.4753, w: 0.062, h: 0.03 };

/* 动作小人挂载点（qi 的美术未到位）：rect 为舞台比例初值，图到位后微调；资产命名约定见 HANDOFF。
   阶段 B 调 setRoomAction('report'|'sleep'|'feedcat'|'window'|null)；缺图 onerror 自动隐藏，不出破图。 */
var ACTION_SPOTS_401 = {
  report:  { asset: 'assets/chibi/yunsheng_report.png',  rect: { x: 0.10, y: 0.50, w: 0.22, h: 0.30 } }, // 赴桌写报告：桌前，脚落地板 0.80
  sleep:   { asset: 'assets/chibi/yunsheng_sleep.png',   rect: { x: 0.70, y: 0.60, w: 0.26, h: 0.16 } }, // 缩床睡觉：躺床面
  feedcat: { asset: 'assets/chibi/yunsheng_feedcat.png', rect: { x: 0.50, y: 0.46, w: 0.20, h: 0.22 } }, // 蹲地喂猫：猫窝左，脚落 0.68
  window:  { asset: 'assets/chibi/yunsheng_window.png',  rect: { x: 0.17, y: 0.14, w: 0.20, h: 0.28 } }  // 窗边发呆：桌后，脚落窗台 0.42
};
function setRoomAction(name) {
  var el = byId('room-action');
  var spot = name && ACTION_SPOTS_401[name];
  if (!spot) { el.classList.add('hidden'); return; }
  setRect(el, spot.rect);
  el.onload = function () { el.classList.remove('hidden'); };
  el.onerror = function () { el.classList.add('hidden'); };
  if (el.getAttribute('src') === spot.asset && el.complete && el.naturalWidth > 0) el.classList.remove('hidden');
  else el.src = spot.asset;
}

/* 云笙 5 个独立点按区（第一单第 3 步，第四单按 v4 立绘 1600×2450 像素复校）：
   矩形 = 相对立绘（#char-wrap 即立绘盒）的百分比；skin/轮廓取证：
   发顶 0.0086、脸 0.085–0.163、颈 0.20–0.22、垂手 skin 0.6138–0.6406 / 0.459–0.513、
   肩线行 0.19 轮廓 0.358–0.649。eat 抬手持食无垂手，垂手区按其余四表情实测。
   lines 是 data/lines_yunsheng.js poke 池的下标——5 区互不重叠、合起来恰好覆盖 qi 定稿 10 句，
   表情随台词 face 走：头/垂手 shy、脸/右肩 angry、左肩 smile/angry。左右肩以她本人左右为准（左肩在画面右侧）。
   ?debug=1 时 5 个框直接画在按钮上（CSS .debug-zones），qi 试玩后可调矩形。 */
var POKE_ZONES = {
  head:      { label: '头',   rect: { x: 0.415, y: 0.009, w: 0.17,  h: 0.071 }, lines: [2, 8] },
  face:      { label: '脸',   rect: { x: 0.44,  y: 0.085, w: 0.13,  h: 0.078 }, lines: [0, 4] },
  hand:      { label: '垂手', rect: { x: 0.606, y: 0.452, w: 0.045, h: 0.068 }, lines: [5, 6] },
  shoulderL: { label: '左肩', rect: { x: 0.545, y: 0.168, w: 0.095, h: 0.047 }, lines: [9, 7] },
  shoulderR: { label: '右肩', rect: { x: 0.362, y: 0.168, w: 0.093, h: 0.047 }, lines: [1, 3] }
};

/* ---------- 运行状态 ---------- */
var rolls = {};       // 每人本次打开游戏抽到的动作套：'7f'/'501'/'401'/'301' → 0/1/2（A/B/C），不存档
var MASK_ELS = {};    // '7f'/… → 该窗所有玻璃遮罩元素（每块开口一个）
var usedLines = {};   // 同一会话台词不重复：{ poke: [下标], chat: [下标] }
var bubbleTimer = null;
var toastTimer = null;
var cardId = null;
var sceneState = null; // 触发剧情播放状态
var pokedThisSession = false; // 戳按钮已取消：本次会话第一次进房间飘引导，戳过就不再飘

function rand3() { return Math.floor(Math.random() * 3); } // 每进一次游戏重抽一次

function byId(id) { return document.getElementById(id); }

function setRect(el, r) {
  el.style.left = (r.x * 100) + '%';
  el.style.top = (r.y * 100) + '%';
  el.style.width = (r.w * 100) + '%';
  el.style.height = (r.h * 100) + '%';
}

/* 灭窗遮罩贴玻璃：rect 取多边形外接框，clip-path 百分比相对外接框 */
function applyGlassClip(el, pts) {
  var xs = pts.map(function (p) { return p[0]; });
  var ys = pts.map(function (p) { return p[1]; });
  var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
  var w = Math.max.apply(null, xs) - x0, h = Math.max.apply(null, ys) - y0;
  setRect(el, { x: x0, y: y0, w: w, h: h });
  el.style.clipPath = 'polygon(' + pts.map(function (p) {
    return ((p[0] - x0) / w * 100).toFixed(2) + '% ' + ((p[1] - y0) / h * 100).toFixed(2) + '%';
  }).join(', ') + ')';
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
      MASK_ELS[id] = w.glass.map(function (poly, i) {
        var mask = document.createElement('div');
        mask.className = 'win-dark';
        mask.id = 'mask-' + id + (i ? '-' + i : ''); // 每块玻璃开口一个遮罩，窗棂/墙体不被压暗
        applyGlassClip(mask, poly); // 灭窗只压暗窗玻璃多边形，不盖墙/框/栏杆/天空
        stage.appendChild(mask);
        return mask;
      });
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
    var mask = MASK_ELS[id];
    if (mask) mask.forEach(function (m) { m.style.display = on ? 'none' : ''; });   // 窗灭盖深蓝遮罩
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
  byId('poke-hint').classList.toggle('hidden', pokedThisSession);
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
var currentFaceSrc = 'assets/characters/yunsheng_smile.png'; // 与 index.html 初始 src 一致

/* 脚部实测表（20 张立绘逐张脱本量得，只读图不改图）：sole = 脚底线（alpha>200 最底行 +1）/ 高；
   fc = 双脚中心 x / 宽；feet = 每只脚 [x0, x1, 该脚底线] / 宽、/ 高（沿鞋底轮廓做接触线用）。
   五位姑娘共用同一套三层阴影，脚底线按各自立绘实测；裙摆只量到一条落地的按一条算。 */
var FEET_GEOM = {
  yunsheng_smile: { sole: 0.9600, fc: 0.5103, feet: [[0.4437, 0.5181, 0.9600], [0.4913, 0.5881, 0.9420]] },
  yunsheng_shy:   { sole: 0.9600, fc: 0.5103, feet: [[0.4437, 0.5181, 0.9600], [0.4913, 0.5881, 0.9420]] },
  yunsheng_angry: { sole: 0.9600, fc: 0.5103, feet: [[0.4437, 0.5181, 0.9600], [0.4913, 0.5881, 0.9420]] },
  yunsheng_eat:   { sole: 0.9588, fc: 0.5098, feet: [[0.4450, 0.5175, 0.9588], [0.4900, 0.5869, 0.9408]] },
  yunsheng_sleep: { sole: 0.9600, fc: 0.5103, feet: [[0.4437, 0.5181, 0.9600], [0.4913, 0.5881, 0.9420]] },
  zhixi_smile:    { sole: 0.9616, fc: 0.5176, feet: [[0.4431, 0.5256, 0.9616], [0.4781, 0.5769, 0.9555], [0.5225, 0.5794, 0.9514]] },
  zhixi_shy:      { sole: 0.9616, fc: 0.5176, feet: [[0.4431, 0.5256, 0.9616], [0.4781, 0.5769, 0.9555], [0.5225, 0.5794, 0.9514]] },
  zhixi_angry:    { sole: 0.9633, fc: 0.5064, feet: [[0.4425, 0.5262, 0.9633], [0.4781, 0.5787, 0.9567]] },
  zhixi_eat:      { sole: 0.9633, fc: 0.5062, feet: [[0.4425, 0.5256, 0.9633], [0.4781, 0.5787, 0.9567]] },
  zhixi_sleep:    { sole: 0.9633, fc: 0.5064, feet: [[0.4425, 0.5262, 0.9633], [0.4781, 0.5787, 0.9567]] },
  xiyue_smile:    { sole: 0.9433, fc: 0.5037, feet: [[0.4506, 0.5569, 0.9433]] },
  xiyue_shy:      { sole: 0.9433, fc: 0.5037, feet: [[0.4506, 0.5569, 0.9433]] },
  xiyue_angry:    { sole: 0.9453, fc: 0.5050, feet: [[0.4506, 0.5594, 0.9453]] },
  xiyue_eat:      { sole: 0.9449, fc: 0.5050, feet: [[0.4500, 0.5600, 0.9449]] },
  xiyue_sleep:    { sole: 0.9453, fc: 0.5050, feet: [[0.4506, 0.5594, 0.9453]] },
  yelan_smile:    { sole: 0.9596, fc: 0.5101, feet: [[0.4275, 0.4813, 0.9596], [0.5387, 0.5931, 0.9445]] },
  yelan_shy:      { sole: 0.9596, fc: 0.5101, feet: [[0.4275, 0.4813, 0.9596], [0.5387, 0.5931, 0.9445]] },
  yelan_angry:    { sole: 0.9600, fc: 0.5094, feet: [[0.4263, 0.4806, 0.9600], [0.5375, 0.5931, 0.9457]] },
  yelan_eat:      { sole: 0.9600, fc: 0.5094, feet: [[0.4263, 0.4806, 0.9600], [0.5375, 0.5931, 0.9457]] },
  yelan_sleep:    { sole: 0.9596, fc: 0.5092, feet: [[0.4263, 0.4806, 0.9596], [0.5375, 0.5925, 0.9457]] }
};

/* 脚底线 = 立绘实测「alpha>200 最底行」+1 / 2450（与 FEET_GEOM 同源，云笙五表情）；
   FOOT_Y = 脚落点（舞台高度比例，401 底图地毯实测 0.686–0.90 取地毯中部）。切表情按各自脚底线
   对齐同一落点：脚踩地、人不跳位、大小不变；不用固定像素（舞台随视口缩放，固定 px 会让人悬空）。 */
var SOLE_LINE = {};
Object.keys(FEET_GEOM).forEach(function (k) {
  if (k.indexOf('yunsheng_') === 0) SOLE_LINE[k.slice(9)] = FEET_GEOM[k].sole;
});
var FOOT_Y = 0.80;
var WRAP_H_FRAC = 0.56; // 与 #char-wrap height:56% 同源
var currentChar = 'yunsheng'; // 房间内当前立绘角色（阴影/脚底线按 char_face 查 FEET_GEOM）

function feetGeom(face) {
  return FEET_GEOM[currentChar + '_' + face] || FEET_GEOM['yunsheng_' + face] || FEET_GEOM.yunsheng_smile;
}

/* 接触线：沿每只鞋底轮廓一条深带（sole 上 0.011w ~ 下 0.013w），条数 = 实测落地脚数 */
function buildContactBands(face) {
  var box = byId('char-contacts');
  box.innerHTML = '';
  feetGeom(face).feet.forEach(function (f) {
    var d = document.createElement('div');
    d.className = 'contact-band';
    d.style.left = (f[0] * 100) + '%';
    d.style.width = ((f[1] - f[0]) * 100) + '%';
    d.style.top = 'calc(' + (f[2] * 100) + '% - 0.011 * var(--wp, 200px))';
    d.style.height = 'calc(0.024 * var(--wp, 200px))';
    box.appendChild(d);
  });
}

function applyFootAlign(face) {
  var s = SOLE_LINE[face] || SOLE_LINE.smile;
  var wrap = byId('char-wrap');
  wrap.style.top = ((FOOT_Y - s * WRAP_H_FRAC) * 100).toFixed(3) + '%';
  // 变量挂 screen-room：阴影（wrap 内）与戳戳提示（wrap 外）都要继承它
  byId('screen-room').style.setProperty('--sole', s);
  byId('screen-room').style.setProperty('--fc', feetGeom(face).fc);
  buildContactBands(face);
}

/* ---------- 渲染期去白边：立绘外沿一圈浅色描边压成内层本色 ----------
   立绘 PNG 一个像素不动；只在加载后过一遍 canvas：把贴着透明区的外沿一圈像素
   （不透明描边 + 它外侧的半透明像素）的颜色压到 min(自身, 内层不透明像素均值)，
   alpha 一律不动 —— 轮廓的软硬和粗细完全不变，只是白圈变成鞋子/衣服自己的深色。
   file:// 下画布会被污染，取不到像素就放弃处理，退回原图显示。 */
var EDGE_FX_CACHE = {};
var EDGE_FX_BUSY = {};
var EDGE_FX_OK = (function () {
  try {
    var c = document.createElement('canvas');
    return !!(c.getContext && c.getContext('2d'));
  } catch (e) { return false; }
})();

function edgeBandRecolor(p, w, h) {
  var n = w * h, i, x, y, dx, dy, xx, yy, j;
  var T = new Uint8Array(n), R1 = new Uint8Array(n), BD = new Uint8Array(n);
  for (i = 0; i < n; i++) T[i] = p[i * 4 + 3] < 8 ? 1 : 0;
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      i = y * w + x;
      if (T[i] || p[i * 4 + 3] === 0) continue;
      for (dy = -1; dy <= 1 && !R1[i]; dy++) {
        yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (dx = -1; dx <= 1; dx++) {
          xx = x + dx; if (xx < 0 || xx >= w) continue;
          if (T[yy * w + xx]) { R1[i] = 1; BD[i] = 1; break; }
        }
      }
    }
  }
  for (y = 0; y < h; y++) { // 描边内侧再收一圈（半透明或不透明的浅色第二像素同属白边）
    for (x = 0; x < w; x++) {
      i = y * w + x;
      if (BD[i] || p[i * 4 + 3] === 0) continue;
      for (dy = -1; dy <= 1 && !BD[i]; dy++) {
        yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (dx = -1; dx <= 1; dx++) {
          xx = x + dx; if (xx < 0 || xx >= w) continue;
          if (R1[yy * w + xx]) { BD[i] = 1; break; }
        }
      }
    }
  }
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      i = y * w + x;
      if (!BD[i]) continue;
      var sr = 0, sg = 0, sb = 0, cnt = 0, r;
      for (r = 2; r <= 3 && !cnt; r++) { // 内层参考色：非白边圈的不透明像素
        for (dy = -r; dy <= r; dy++) {
          yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (dx = -r; dx <= r; dx++) {
            xx = x + dx; if (xx < 0 || xx >= w) continue;
            j = yy * w + xx;
            if (BD[j] || p[j * 4 + 3] < 255) continue;
            sr += p[j * 4]; sg += p[j * 4 + 1]; sb += p[j * 4 + 2]; cnt++;
          }
        }
      }
      if (!cnt) continue; // 细发丝这类找不到内层的，原样留着
      if (sr / cnt < p[i * 4]) p[i * 4] = sr / cnt;
      if (sg / cnt < p[i * 4 + 1]) p[i * 4 + 1] = sg / cnt;
      if (sb / cnt < p[i * 4 + 2]) p[i * 4 + 2] = sb / cnt;
    }
  }
}

function swapEdgeFx(assetSrc) {
  if (currentFaceSrc !== assetSrc) return;
  var img = byId('room-char');
  if (isPortraitBroken(img)) return;
  var url = EDGE_FX_CACHE[assetSrc];
  if (url && img.src !== url) img.src = url;
}

function applyEdgeFx(assetSrc) {
  if (!EDGE_FX_OK) return;
  if (EDGE_FX_CACHE[assetSrc]) { swapEdgeFx(assetSrc); return; }
  if (EDGE_FX_BUSY[assetSrc]) return;
  EDGE_FX_BUSY[assetSrc] = 1;
  var probe = new Image();
  probe.onload = function () {
    delete EDGE_FX_BUSY[assetSrc];
    var w = probe.naturalWidth, h = probe.naturalHeight;
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d');
    ctx.drawImage(probe, 0, 0);
    var id;
    try { id = ctx.getImageData(0, 0, w, h); } catch (e) { return; } // 画布被污染
    edgeBandRecolor(id.data, w, h);
    ctx.putImageData(id, 0, 0);
    var use = function (url) { EDGE_FX_CACHE[assetSrc] = url; swapEdgeFx(assetSrc); };
    if (cv.toBlob) cv.toBlob(function (b) { use(URL.createObjectURL(b)); }, 'image/png');
    else use(cv.toDataURL('image/png'));
  };
  probe.onerror = function () { delete EDGE_FX_BUSY[assetSrc]; };
  probe.src = assetSrc;
}

function setFace(face) {
  if (ROOM_FACES.indexOf(face) < 0) face = 'smile';
  applyFootAlign(face);
  var img = byId('room-char');
  var src = 'assets/characters/' + currentChar + '_' + face + '.png';
  if (src === currentFaceSrc) { // 同 src 浏览器不会重发 load/error：清掉 broken 会露 alt 破图标，保持现状
    if (isPortraitBroken(img)) markPortraitBroken(true);
    applyEdgeFx(src); // 首帧走这里：初始表情的白边也要去
    return;
  }
  currentFaceSrc = src;
  img.src = src; // broken 态交给 load/error 事件撤：先清会在新图加载途中闪破图标
  applyEdgeFx(src);
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

/* 戳的落点反馈：鼠标/触摸落在指尖处（clientX/Y 换算到包裹层坐标），键盘激活（detail 0）落在该区中心 */
function tapFeedback(e, zone) {
  var ring = byId('char-tap');
  var x = '50%', y = '42%';
  if (e && e.detail > 0 && typeof e.clientX === 'number') {
    var r = byId('char-wrap').getBoundingClientRect();
    x = (e.clientX - r.left) + 'px';
    y = (e.clientY - r.top) + 'px';
  } else if (zone && POKE_ZONES[zone]) {
    var zr = POKE_ZONES[zone].rect;
    x = ((zr.x + zr.w / 2) * 100) + '%';
    y = ((zr.y + zr.h / 2) * 100) + '%';
  }
  ring.style.left = x;
  ring.style.top = y;
  ring.classList.remove('go');
  void ring.offsetWidth;
  ring.classList.add('go');
}

/* 5 区矩形统一下发 + debug 框开关（?debug=1）。矩形只此一处定义，按钮与调试框永远一致。 */
function applyZoneRects() {
  Object.keys(POKE_ZONES).forEach(function (z) { setRect(byId('poke-' + z), POKE_ZONES[z].rect); });
  var debug = !!(window.location && /[?&]debug=1(?:&|$)/.test(window.location.search || ''));
  byId('char-wrap').classList.toggle('debug-zones', debug);
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
  if (!cand.length) return { text: '……嗯？', face: 'smile' }; // 数据全标 needCat 时的兜底，避免抽到 undefined 炸掉戳/聊
  var pick = cand[Math.floor(Math.random() * cand.length)];
  used.push(pick);
  return pool[pick];
}

/* 分区戳：只在该区专属下标里抽，同一会话该区不重复（一轮抽完重置）；表情随台词 face。 */
function pickPokeLine(zone) {
  var pool = window.LINES.yunsheng.neighbor.poke;
  var idxs = POKE_ZONES[zone].lines;
  var key = 'poke_' + zone;
  var used = usedLines[key] || (usedLines[key] = []);
  var cand = idxs.filter(function (i) { return !pool[i].needCat && used.indexOf(i) < 0; });
  if (!cand.length) {
    used = usedLines[key] = [];
    cand = idxs.filter(function (i) { return !pool[i].needCat; });
  }
  if (!cand.length) return { text: '……嗯？', face: 'smile' }; // 同上：空池兜底，不让戳点击抛 TypeError
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
function doPoke(zone) {
  ensureToday();
  save.today.pokes += 1;
  pokedThisSession = true;
  byId('poke-hint').classList.add('hidden');
  var line = zone ? pickPokeLine(zone) : pickLine('poke'); // 不带分区 = 全池（数值测试/兜底用）
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
  var btn = byId('btn-together');
  byId('scene-entry').disabled = playedToday;
  // 圆钮演过变暗停呼吸但保持可点：disable 会把「今天已经演过啦」这句解释永远关在面板外
  btn.classList.toggle('unavailable', playedToday);
  if (playedToday) btn.setAttribute('aria-disabled', 'true'); else btn.removeAttribute('aria-disabled');
  byId('scene-state').textContent = playedToday ? '今天已经演过啦' : '可以演';
}

function startScene() {
  closePopups();
  hideBubble();
  byId('poke-hint').classList.add('hidden');
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

/* 立绘在/不在的统一开关：占位块、脚下阴影、点击区三者同进同退。
   img 本身也要挂 .broken（CSS 里 visibility:hidden），否则浏览器会渲染 alt 破图标。 */
function markPortraitBroken(broken) {
  var img = byId('room-char');
  if (broken) img.dataset.broken = '1'; else delete img.dataset.broken;
  img.classList.toggle('broken', broken);
  byId('char-placeholder').classList.toggle('hidden', !broken);
  byId('char-wrap').classList.toggle('broken', broken);
}

function bindPortraitFallback() {
  var imgs = document.querySelectorAll('.patch, #room-char');
  Array.prototype.forEach.call(imgs, function (img) {
    var isChar = img.id === 'room-char';
    img.addEventListener('error', function () {
      if (isChar) markPortraitBroken(true);
      else { img.dataset.broken = '1'; img.style.display = 'none'; }
    });
    if (isChar) { // 换到能正常加载的表情图后撤掉占位，不让它卡在立绘上面
      img.addEventListener('load', function () { markPortraitBroken(false); });
    }
    // 解析期就已失败的图（error 早于本监听挂上，双击 file:// 打开时可能发生）：同趟补扫
    if (isPortraitBroken(img)) {
      if (isChar) markPortraitBroken(true);
      else { img.dataset.broken = '1'; img.style.display = 'none'; }
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
  // --wp = 立绘盒宽（px）：阴影三层与模糊量以 w 为单位，随视口缩放。
  // 用 stage 高度推算（隐藏时 getBoundingClientRect 为 0 不可靠）：盒高 = 56% stage 高，宽 = 盒高 × 1600/2450。
  var sh = parseFloat(byId('room-stage').style.height) || 0;
  byId('screen-room').style.setProperty('--wp', (sh * WRAP_H_FRAC * 1600 / 2450).toFixed(2) + 'px');
}

/* ---------- 启动 ---------- */
function bindEvents() {
  byId('card-close').addEventListener('click', closeCard);
  byId('card-backdrop').addEventListener('click', closeCard);
  byId('card-visit').addEventListener('click', function () {
    if (cardId === '401') enterRoom();
  });

  byId('btn-back').addEventListener('click', goExterior);
  Object.keys(POKE_ZONES).forEach(function (z) {
    byId('poke-' + z).addEventListener('click', function (e) {
      closePopups();
      tapFeedback(e, z);
      doPoke(z);
    });
  });
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
  applyZoneRects();
  bindPortraitFallback();
  bindEvents();
  layoutStages();
  applyFootAlign('smile'); // 初始表情也对齐，不等第一次 setFace
  window.addEventListener('resize', layoutStages);
  renderExterior();
  setInterval(renderExterior, 30000); // 半分钟同步一次真实时间，跨过时段灯会自动变
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
