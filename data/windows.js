// 月见公寓 主界面窗位（Hark 按 v8 底图实测，768×1376，比例 0~1）
// 人物层：x,y = PNG 左上角，w,h = PNG 宽高 / 底图宽高。同一扇窗三套位置相同。
// hotspot = 点按区矩形；glass = 窗玻璃多边形（灭窗遮罩只压暗这块，不盖墙/框/栏杆/天空）。
window.WINDOWS = window.WINDOWS || {};
window.WINDOWS["7f"] = {
    "A": {"file": "assets/exterior/win_7f_yelan_A.png", "x": 0.5573, "y": 0.0727, "w": 0.3698, "h": 0.1599},
    "B": {"file": "assets/exterior/win_7f_yelan_B.png", "x": 0.5573, "y": 0.0727, "w": 0.3698, "h": 0.1599},
    "C": {"file": "assets/exterior/win_7f_yelan_C.png", "x": 0.5573, "y": 0.0727, "w": 0.3698, "h": 0.1599},
    "hotspot": {"x": 0.5573, "y": 0.0727, "w": 0.3698, "h": 0.1599},
    "glass": [[0.5417, 0.0821], [0.9245, 0.1134], [0.9245, 0.2209], [0.5417, 0.2049]]
};
window.WINDOWS["501"] = {
    "A": {"file": "assets/exterior/win_501_xiyue_A.png", "x": 0.3086, "y": 0.3256, "w": 0.2695, "h": 0.1054},
    "B": {"file": "assets/exterior/win_501_xiyue_B.png", "x": 0.3086, "y": 0.3256, "w": 0.2695, "h": 0.1054},
    "C": {"file": "assets/exterior/win_501_xiyue_C.png", "x": 0.3086, "y": 0.3256, "w": 0.2695, "h": 0.1054},
    "hotspot": {"x": 0.3086, "y": 0.3256, "w": 0.2695, "h": 0.1054},
    "glass": [[0.3229, 0.3343], [0.5586, 0.3380], [0.5586, 0.4201], [0.3229, 0.4215]]
};
window.WINDOWS["401"] = {
    "A": {"file": "assets/exterior/win_401_yunsheng_A.png", "x": 0.3086, "y": 0.4419, "w": 0.2695, "h": 0.1017},
    "B": {"file": "assets/exterior/win_401_yunsheng_B.png", "x": 0.3086, "y": 0.4419, "w": 0.2695, "h": 0.1017},
    "C": {"file": "assets/exterior/win_401_yunsheng_C.png", "x": 0.3086, "y": 0.4419, "w": 0.2695, "h": 0.1017},
    "hotspot": {"x": 0.3086, "y": 0.4419, "w": 0.2695, "h": 0.1017},
    "glass": [[0.3216, 0.4491], [0.5560, 0.4513], [0.5560, 0.5334], [0.3216, 0.5320]]
};
window.WINDOWS["301"] = {
    "A": {"file": "assets/exterior/win_301_zhixi_A.png", "x": 0.3099, "y": 0.556, "w": 0.2695, "h": 0.0916},
    "B": {"file": "assets/exterior/win_301_zhixi_B.png", "x": 0.3099, "y": 0.556, "w": 0.2695, "h": 0.0916},
    "C": {"file": "assets/exterior/win_301_zhixi_C.png", "x": 0.3099, "y": 0.556, "w": 0.2695, "h": 0.0916},
    "hotspot": {"x": 0.3099, "y": 0.556, "w": 0.2695, "h": 0.0916},
    "glass": [[0.3203, 0.5618], [0.5534, 0.5632], [0.5534, 0.6461], [0.3203, 0.6453]]
};
window.WINDOWS["302"] = { "hotspot": {"x": 0.6198, "y": 0.5581, "w": 0.1615, "h": 0.0843} };  // 302 不放人
