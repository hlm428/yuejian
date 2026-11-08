'use strict';
/* 月见公寓 · 云笙台词数据（「邻居」阶段 40 句，按 GAME_SPEC §18 原文录入，qi 以后可改）
   格式：{ text, face, item?, needCat? }。face 对应 assets/characters/yunsheng_<face>.png。
   item 只用四种令牌：black_coffee / cat_can / sweets / bread——甜食与甜品统一用 sweets（三句随机抽一）。
   needCat: true 表示楼道猫出现后才会说（阶段 A 猫未出现，抽取时跳过）。
   统一初始化（SPEC §16.8）：每个 data 文件开头都做两行兜底初始化 */
window.LINES = window.LINES || {};
window.LINES.yunsheng = window.LINES.yunsheng || {};

window.LINES.yunsheng.neighbor = {
    poke: [
        { text: '别戳。', face: 'angry' },
        { text: '……你手很闲？', face: 'angry' },
        { text: '无聊。', face: 'shy' },
        { text: '我在看报告。', face: 'angry' },
        { text: '再戳我就关门了。', face: 'angry' },
        { text: '……痒。', face: 'shy' },
        { text: '戳够了就走。', face: 'shy' },
        { text: '你每天都这么闲？', face: 'angry' },
        { text: '……随便你。', face: 'shy' },
        { text: '下次记得敲门。', face: 'smile' }
    ],
    feed: [
        { text: '……放那儿吧。', face: 'eat', item: 'black_coffee' },
        { text: '还算合口味。', face: 'eat', item: 'black_coffee' },
        { text: '给我这个干什么。无聊。', face: 'shy', item: 'cat_can' },
        { text: '……楼道那只猫会吃。', face: 'shy', item: 'cat_can', needCat: true },
        { text: '我不吃甜的。', face: 'angry', item: 'sweets' },
        { text: '拿走。无聊。', face: 'angry', item: 'sweets' },
        { text: '……谢谢。', face: 'eat', item: 'bread' },
        { text: '第二杯了。你是想让我通宵？', face: 'eat', item: 'black_coffee' },
        { text: '说了不吃甜的。', face: 'angry', item: 'sweets' },
        { text: '……就这一次。', face: 'shy', item: 'cat_can' }
    ],
    sleep: [
        { text: '我不困。', face: 'sleep' },
        { text: '报告还没写完。', face: 'sleep' },
        { text: '……别关灯。', face: 'sleep' },
        { text: '无聊。让我再写一行。', face: 'sleep' },
        { text: '……你先睡。', face: 'shy' },
        { text: '明天还要去现场。', face: 'sleep' },
        { text: '……被子盖好就行。', face: 'shy' },
        { text: '别盯着我睡。', face: 'shy' },
        { text: '……晚安。', face: 'smile' },
        { text: '……谢了。', face: 'smile' }
    ],
    chat: [
        { text: '今天的报告写了六千字。', face: 'smile' },
        { text: '楼道那只猫又来了。', face: 'shy', needCat: true },
        { text: '黑咖啡，不加糖。', face: 'smile' },
        { text: '夜澜的棋下得还行。', face: 'smile' },
        { text: '实验室的灯坏了两天，没人修。', face: 'angry' },
        { text: '……你居然还记得我不吃甜的。', face: 'shy' },
        { text: '明天半夜可能要去现场。', face: 'sleep' },
        { text: '推理小说看到一半，凶手太蠢了。', face: 'smile' },
        { text: '无聊的问题就别问了。', face: 'angry' },
        { text: '……今天，谢谢你。', face: 'shy' }
    ]
};
