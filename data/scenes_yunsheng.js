'use strict';
/* 月见公寓 · 触发剧情数据：云笙「深夜送咖啡」（v3.2 §26 qi 已定的第一场）
   剧本按 Aaron 2026-11-08 提供的定稿脚本录入，一个字没动（括号里的舞台提示放进 note， qi 以后可改）。
   speaker: 'narration' = 旁白；'yunsheng' = 云笙；choice.options[].label = 主控说的那句（玩家二选一）。
   统一初始化（SPEC §16.8）：每个 data 文件开头都做两行兜底初始化 */
window.LINES = window.LINES || {};
window.LINES.yunsheng = window.LINES.yunsheng || {};

window.SCENES = window.SCENES || {};
window.SCENES.yunsheng = [
    {
        id: 'yunsheng_coffee',
        title: '深夜送咖啡',
        room: '401',
        beats: [
            { type: 'line', speaker: 'narration', name: '旁白',
              text: '深夜十一点，401 的台灯还亮着。云笙坐在桌前写报告，杯子里的黑咖啡已经见底了。你端着刚煮好的黑咖啡走进来。' },
            { type: 'line', speaker: 'yunsheng', name: '云笙',
              text: '放那儿吧。', note: '（头也不抬）' },
            { type: 'line', speaker: 'narration', name: '旁白',
              text: '你把咖啡放在她手边。她闻到香味，笔停了一下。' },
            { type: 'choice', options: [
                { label: '趁热喝，凉了就不好喝了。',
                  reply: { speaker: 'yunsheng', name: '云笙', text: '……多事。', note: '（她端起来喝了一口）' } },
                { label: '写不完也没关系，明天再写。',
                  reply: { speaker: 'yunsheng', name: '云笙', text: '……明天还有明天的报告。', note: '（她还是端起来喝了一口）' } }
            ] },
            { type: 'line', speaker: 'yunsheng', name: '云笙',
              text: '……还算合口味。' }
        ],
        reward: { affection: 8, coaster: true }
    }
];
