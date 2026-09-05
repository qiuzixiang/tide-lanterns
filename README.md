# 潮汐灯塔 · Tide Lanterns

转动一段航路，让温暖的光回到远方的灯塔。

[在线游玩](https://tide-lanterns.vercel.app/) · [源代码](https://github.com/qiuzixiang/tide-lanterns)

《潮汐灯塔》是一款独立浏览器逻辑游戏，玩法基于 Simon Tatham 的 **Net**。它从原小游戏合集的「风暴灯塔网」发展而来，独立设计画面、战役、教程、收藏与每日航线。与《星际漂流》分开部署、独立存档。

## 在海上做什么

- 旋转光缆模块，让所有航标接回主灯塔；接口相对、没有断口、不越界、没有闭环才算完成。
- 48 个战役，分为初灯港湾、白鸥浅滩、珊瑚回廊、雾笛群礁、月潮外海、黎明灯链六章。
- 额外 120 张航图，每日轮换；自由航行提供 4×4、5×5、6×6 三档，每档 40 张。
- 全部 168 个拓扑经过旋转和镜像归一化去重，两套独立第二解搜索均完整验证唯一。
- 双向旋转、锁定笔记、撤销/重做、方向提示、真实三卡图解、六件群岛纪念物。
- 没有强制计时、惩罚性签到或付费；音效默认关闭，可启用并减少动态效果。
- 设备本地存档，损坏数据回退，不清除其他游戏的数据。首次完成奖励按关卡 ID 幂等结算。

每日内容来自有限题库，每 120 天循环；难度描述依据具体题面结构，并非玩家留存或难度实测。

## 开发

需要 Node.js 22+、npm；本地预览命令使用 Python 3。

```sh
npm ci
npm test
npm run build
npm run dev
```

打开 `http://127.0.0.1:4196`。`npm run generate` 会重建离线题库；常规构建和游戏运行不生成或求解题目。

## 文件

- `src/engine.mjs`：纯规则与独立约束求解器。
- `src/campaign.mjs`：固定离线题面与章节、每日/自由航线索引。
- `tools/generate-campaign.mjs`：种子生成、拓扑约束、第二套独立 oracle。
- `src/storage.mjs`：动作重放、存档校验与唯一结算。
- `src/app.mjs`：交互、图解、灯光传播与单页弹层。
- `styles.css`：桌面与窄屏布局，Chrome 61 基线与安全区处理。
- `tools/build.mjs`：独立网站和小红书离线包共用源码构建，最终经典脚本目标 ES2017 / Chrome 61。
- `docs/`：规则契约、来源、生成验证、美术说明与发布证据。

构建网站输出在 `dist/`；小红书输出在 `releases/xiaohongshu/`，ZIP 根目录为 `index.html`，只包含离线脚本、样式、图片与静态许可文本。不使用外网、Worker、模块加载、剪贴板、账号或小红书桥接权限。

## 验证和来源

具体规则与生成证据见 `docs/rule-contract.md`、`docs/campaign-validation.md`。页面视觉与发布状态以 `docs/release-checklist.md` 和发布记录为准。桌面模拟通过不代表 Android 8.1 / Chrome 61 或 iOS 真机通过。

规则原型、参考文档和 MIT 许可见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) 与 [LICENSE](./LICENSE)。群岛插画由内置 ImageGen 生成，棋盘和教程来自真实规则状态，其他图形为代码绘制。完整提示词见 `docs/art-notes.md`。
