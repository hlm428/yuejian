'use strict';
/* 月见公寓 · v1 任务1：公寓剖面图主界面
   读真实时间 → 按 GAME_SPEC §8.1 亮灯规则渲染剖面图；点房间只做提示（房间进交互从任务 2 开始）。 */

/* ---------- 存档接口（任务 4 完整实现，这里先留骨架） ---------- */
var SAVE_KEY = 'yuejian_save';
var SAVE_VERSION = 1;

function loadSave() {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || s.version !== SAVE_VERSION) return null;
    return s;
  } catch (e) { return null; }
}

function saveSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: SAVE_VERSION,
      savedAt: Date.now(),
      data: data || {}
    }));
  } catch (e) { /* 隐身模式等场景写入失败不致命 */ }
}

/* ---------- 时间与亮灯规则（SPEC §8.1） ---------- */
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
    case 'b1': return band === 'night0' || band === 'evening'; // 夜澜：白天睡觉，天黑出来
    case 'store': {                                            // 便利店 07:00 开、23:00 打烊
      var h = opts.hour;
      return h >= 7 && h < 23;
    }
    default: return false;
  }
}

/* 夜澜白天（05–17）人在睡觉：灯灭但人像保留（变暗），点击有专属提示 */
function yelanAsleep(band) {
  return band === 'early' || band === 'day';
}

/* ---------- 渲染 ---------- */
var ROOM_IDS = ['501', '401', '301', '302', 'store', 'b1'];
var ROOM_NAMES = { '501': '501 幸曦月', '401': '401 顾云笙', '301': '301 宋知夕', '302': '302 你的房间', 'store': '便利店', 'b1': '地下室 · 皇甫夜澜' };

function fmtClock(d) {
  var wk = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + wk + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function dateKeyOf(d) {
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* state 可注入 {hour, weekend} 用于验收不同时段；不传则用真实时间 */
var state = { hour: null, weekend: null };

function render() {
  var now = new Date();
  var h = (typeof state.hour === 'number') ? state.hour : now.getHours();
  var wk = (typeof state.weekend === 'boolean') ? state.weekend : isWeekend(now);
  var band = bandOf(h);
  var opts = { hour: h, weekend: wk, patrol: patrolTonight(dateKeyOf(now)) };

  document.getElementById('clock').textContent = fmtClock(now);

  ROOM_IDS.forEach(function (id) {
    var el = document.getElementById('room-' + id);
    if (!el) return;
    var on = lightOn(id, band, opts);
    el.classList.toggle('lit', on);
    el.classList.toggle('dim', !on);

    var img = el.querySelector('.portrait');
    var ph = el.querySelector('.placeholder');
    var broken = img && img.dataset.broken === '1';
    if (img) {
      var showPortrait = on || (id === 'b1' && yelanAsleep(band));
      if (id === 'b1') {
        var asleep = yelanAsleep(band);
        img.classList.toggle('asleep', !on && asleep);
        var tip = el.querySelector('.sleep-tip');
        if (tip) tip.classList.toggle('show', !on && asleep);
      }
      img.style.display = (broken || !showPortrait) ? 'none' : '';
      if (ph) ph.classList.toggle('show', broken && showPortrait);
    }
  });

  var st = document.getElementById('store-state');
  if (st) st.textContent = lightOn('store', band, opts) ? '营业中' : '打烊';
}

/* ---------- 交互 ---------- */
var toastTimer = null;
function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
}

function onRoomClick(id) {
  var now = new Date();
  var h = (typeof state.hour === 'number') ? state.hour : now.getHours();
  var band = bandOf(h);
  if (id === 'b1' && yelanAsleep(band)) {
    toast('地下室 · 她在睡觉');
    return;
  }
  if (id === '401') {
    toast('401 顾云笙 · 施工中，任务 2 开放');
    return;
  }
  toast(ROOM_NAMES[id] + ' · 施工中，后续任务开放');
}

/* ---------- 图片缺失兜底：柔和色块占位，不白屏（SPEC §4.3） ---------- */
function bindPortraitFallback() {
  var imgs = document.querySelectorAll('.portrait');
  Array.prototype.forEach.call(imgs, function (img) {
    img.addEventListener('error', function () {
      img.dataset.broken = '1';
      render(); // 显隐统一收口到 render：亮灯才显示占位，灭灯连占位一起藏
    });
  });
}

/* ---------- 启动 ---------- */
function init() {
  bindPortraitFallback();
  Array.prototype.forEach.call(document.querySelectorAll('.room'), function (el) {
    el.addEventListener('click', function () {
      onRoomClick(el.getAttribute('data-room'));
    });
  });
  render();
  setInterval(render, 30000); // 半分钟同步一次真实时间，跨过时段灯会自动变
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
