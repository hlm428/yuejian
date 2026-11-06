'use strict';
/* 月见公寓 · §8.1 亮灯规则回归测试
   运行：node tests/test_lights.js   （纯 node，无依赖）
   验证对象：js/app.js 中的纯函数 bandOf / lightOn / yelanAsleep / patrolTonight。
   任务 2/任务 7 改动这些函数后必须重跑本测试。 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

// DOM / localStorage 桩：app.js 顶层引用了它们，但本测试只取纯规则函数
const noop = () => {};
global.document = { readyState: 'loading', addEventListener: noop, getElementById: () => null, querySelectorAll: () => [] };
global.localStorage = { getItem: () => null, setItem: noop };
global.window = global;
global.setInterval = noop;

(0, eval)(src + '\n;globalThis.__T = { bandOf, lightOn, yelanAsleep, patrolTonight, isWeekend };');
const T = globalThis.__T;
if (!T || !T.lightOn) { console.error('FAIL: 无法从 app.js 取出规则函数'); process.exit(1); }

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; }
  else { fail++; console.error(`FAIL ${name}: got=${got} want=${want}`); }
}
function L(id, h, opts) { return T.lightOn(id, T.bandOf(h), opts); }
const wkday = { hour: 10, weekend: false, patrol: false };
const wkend = { hour: 10, weekend: true, patrol: false };

// —— h=2（00–05，夜）——
eq('02 301灭', L('301', 2, wkday), false);
eq('02 401亮(非出警)', L('401', 2, wkday), true);
eq('02 401灭(出警)', L('401', 2, { hour: 2, weekend: false, patrol: true }), false);
eq('02 501灭', L('501', 2, wkday), false);
eq('02 302亮', L('302', 2, wkday), true);
eq('02 店灭', L('store', 2, { hour: 2, weekend: false, patrol: false }), false);
eq('02 夜澜亮', L('b1', 2, wkday), true);

// —— h=6（05–08，清晨）——
eq('06 301亮', L('301', 6, wkday), true);
eq('06 401亮', L('401', 6, wkday), true);
eq('06 501灭', L('501', 6, wkday), false);
eq('06 店灭(未开门)', L('store', 6, { hour: 6, weekend: false, patrol: false }), false);
eq('06 夜澜灭', L('b1', 6, wkday), false);
eq('06 夜澜睡觉', T.yelanAsleep(T.bandOf(6)), true);
eq('02 夜澜不睡', T.yelanAsleep(T.bandOf(2)), false);

// —— h=10（08–17，白天工作日）——
eq('10 301灭(甜品店)', L('301', 10, wkday), false);
eq('10 401灭(实验室)', L('401', 10, wkday), false);
eq('10 501亮', L('501', 10, wkday), true);
eq('10 501周末灭', L('501', 10, wkend), false);
eq('10 店亮', L('store', 10, wkday), true);
eq('10 夜澜灭', L('b1', 10, wkday), false);
eq('10 夜澜睡觉', T.yelanAsleep(T.bandOf(10)), true);

// —— h=20（17–24，晚上）——
['301', '401', '501', '302', 'b1'].forEach(id => eq(`20 ${id}亮`, L(id, 20, wkday), true));
eq('20 店亮', L('store', 20, { hour: 20, weekend: false, patrol: false }), true);

// —— h=23（便利店 23:00 打烊）与 07:00 开门边界 ——
eq('23 店灭(打烊)', L('store', 23, { hour: 23, weekend: false, patrol: false }), false);
eq('23 301亮', L('301', 23, wkday), true);
eq('07 店亮(刚开门)', L('store', 7, { hour: 7, weekend: false, patrol: false }), true);

// —— 出警伪随机：确定性与覆盖 ——
eq('出警同日一致', T.patrolTonight('2026-11-07'), T.patrolTonight('2026-11-07'));
let hasPatrolDay = false, hasQuietDay = false;
for (let d = 1; d <= 30; d++) {
  const k = '2026-11-' + String(d).padStart(2, '0');
  if (T.patrolTonight(k)) hasPatrolDay = true; else hasQuietDay = true;
}
eq('30天里既有出警日也有安静日', hasPatrolDay && hasQuietDay, true);

console.log(`亮灯规则断言：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
