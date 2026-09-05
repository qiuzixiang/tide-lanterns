# 潮汐灯塔：规则、实现与素材来源

核对日期：2026-09-05。本文记录实际读取的来源与版本，不把规则研究误写为上游代码移植。产品规则见 [rule-contract.md](rule-contract.md)，分发许可见 [LICENSE](../LICENSE) 与 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

## 1. 规则权威来源

Simon Tatham's Portable Puzzle Collection 的 [Net 官方手册](https://www.chiark.greenend.org.uk/~sgtatham/puzzles/doc/net.html)。

本次实际读取的页面页尾版本为 **20260905.43eefe8**，响应内容 SHA-256 为 `13ec9a6f38f0e8ee8e3a38b32e6a9f453722bbac4fb60ca7de86830c4f918510`。该 URL 是会更新的官方页面；此版本与指纹标记本次读取内容，不能当作未来请求内容永远不变的保证。

手册明确：计算机先生成连接网络，再随机旋转各拼块；玩家只旋转拼块，使网络完全连通且没有闭环；与中央拼块相连的拼块高亮。锁定可随时解除，用来避免误转。回绕、屏障概率与是否确保唯一解是参数，默认题可以要求唯一解。

手册将 Simon Tatham 最初见到的实例归于 **Pavils Jurjans 的 FreeNet**，并提到其他 NetWalk 实现。这是规则历史致谢；本项目未使用这些第三方作品的程序、名称作为产品名称、商标或美术。

## 2. 实际核对的固定参考快照

仓库：[ebnbin/puzzles](https://github.com/ebnbin/puzzles)。固定提交：[`5a9e1795a3324e0f6433b79fbe31cbd9b12048a3`](https://github.com/ebnbin/puzzles/commit/5a9e1795a3324e0f6433b79fbe31cbd9b12048a3)，提交时间 **2026-08-19T02:01:47Z**，Git tree `9afb07e54a2eb08b8acdb4262542a50971e6ab91`。

本次通过 GitHub 提交 API 核对提交身份；以下每个固定提交 raw 文件均成功读取，并与本次通读的本地研究副本逐字节比较一致。未把历史文档中的提交号直接当成已核对证据，也未声称该提交是最新版本。

| 固定路径 | 用途 | 字节 | SHA-256 |
| --- | --- | ---: | --- |
| [doc-zh/net.html](https://github.com/ebnbin/puzzles/blob/5a9e1795a3324e0f6433b79fbe31cbd9b12048a3/doc-zh/net.html) | 中文规则、操作和参数 | 5,608 | `04bc525bec0d3f9b875a45f68639dc8adef23e81bce43da2246666f3fef953f9` |
| [vendor/sgtpuzzles/net.c](https://github.com/ebnbin/puzzles/blob/5a9e1795a3324e0f6433b79fbe31cbd9b12048a3/vendor/sgtpuzzles/net.c) | 规则与状态语义参考 | 101,374 | `42e4c9bc14839d03fc55c9cc1c332ab9e91b0e3e18d70870faf19944c1d4d599` |
| [src/games/net.ts](https://github.com/ebnbin/puzzles/blob/5a9e1795a3324e0f6433b79fbe31cbd9b12048a3/src/games/net.ts) | 触摸锁定与键盘接线研究 | 1,603 | `7a9319ef8c3ec5a08ca2239ebaed37b93b7acc61b2e2eff2658a8b458ac3ac08` |
| [LICENCE](https://github.com/ebnbin/puzzles/blob/5a9e1795a3324e0f6433b79fbe31cbd9b12048a3/LICENCE) | ebnbin 网页前端 MIT 与范围声明 | 1,448 | `a7bba79061c8faabd8613ee1c89d0a03c7da7f5a802f4a0de7bc310be68295c7` |
| [vendor/sgtpuzzles/LICENCE](https://github.com/ebnbin/puzzles/blob/5a9e1795a3324e0f6433b79fbe31cbd9b12048a3/vendor/sgtpuzzles/LICENCE) | Portable Puzzle Collection 独立 MIT | 1,333 | `43c5b4a4304e7f9d162cda91028ea83f640cd56341744057b9aeed3f10ae55ab` |

`net.c` 已核对的部分包括方向与旋转宏、`default_params`、求解器的边界/回路约束、`compute_active`、锁定输入与 `execute_move` 的完成路径。`net.ts` 是调用上游引擎的网页适配层，不是独立 Net 规则引擎；本项目没有移植该适配层，也不依赖其 React、WebAssembly 或上游运行时。

## 3. 与本游戏契约的对应

| 来源语义 | 潮汐灯塔的范围与处理 |
| --- | --- |
| 原位旋转拼块 | 顺时针/逆时针旋转航标岛；不能移格或改变端口形状 |
| 完全连通且无闭环 | 未配对接口、越界接口、不可达格与回路均不能通关 |
| 相互对接才能传播高亮 | 从主灯塔沿双方端口对应的正交边传播灯光，动画不参与连通判定 |
| 可解锁的锁定笔记 | 防误转工具，不改变合法解与完成条件 |
| 非回绕与零屏障 | 采用此参数子集；不支持边缘传送，也没有额外屏障题型 |
| 默认确保唯一解 | 本游戏每道发布题须独立搜索第二解并完整结束；不读预存答案来证明唯一 |
| 原型提供其他可选操作/参数 | 未实现的回绕、移动高亮源、屏障等不在本版功能承诺内 |

原 C 引擎使用 `R=1 / U=2 / L=4 / D=8`；本项目继承的 JavaScript 模型使用 `N=1 / E=2 / S=4 / W=8`。双方表达相同方向关系，但数值编码不同，不能直接混用上游题目、位掩码或动作序列。任何后续导入功能都必须显式转换并独立验证；本版不提供上游题码导入。

“无环、全部端口匹配、全连接”在本引擎中显式检查；不能仅复制上游完成函数的一段可达性代码，忽略其生成和状态不变量。本次规则核对不替代潮汐灯塔最终引擎、关卡和存档测试。

## 4. 实际代码衍生关系

直接前身是本项目已有合集 **Ten Realms Arcade** 的 [games/storm-lanterns/logic.mjs](https://github.com/qiuzixiang/ten-realms-arcade/blob/959a1307f0675f2ca8f25c9f7be0d27330eaa7fd/games/storm-lanterns/logic.mjs)。本次在原合集本地 Git 核对该文件最近提交为 `959a1307f0675f2ca8f25c9f7be0d27330eaa7fd`，提交时间 `2026-08-31T13:09:40+08:00`，文件无未提交改动；文件 SHA-256 为 `407c3bf6711ba553923da6f9fb565e6bea60884930dd04454ec7c984fc65da26`。

潮汐灯塔的 JavaScript 规则引擎在该已有实现上继续开发，不声称本轮完全从零编写，也不把 Net 规则称作原创。原合集按公开 Net 规则独立制作；本次上游 C、TS 与文档用于语义研究和核对，未作为产品运行时代码、生成器移植源码或美术文件复制进来。本文及第三方声明保留许可文本属于许可记录，不代表捆绑那些引擎。

根 [LICENSE](../LICENSE) 完整保留直接前身的 `Copyright (c) 2026 Ten Realms Arcade contributors` 和 MIT 正文。新项目中另有来源的素材或库应单独记录；构建工具依赖不自动等同于随游戏分发的运行时依赖。

## 5. 新主题与素材记录边界

潮汐灯塔的新主题、美术布局、章节文案、收藏与交互反馈不来自上述上游美术。实际图片文件、使用工具、生成提示、后处理和授权来源应随美术交付另附记录；本文件不替尚未冻结的素材填写不存在的生成或版权证据。

最终网页及小红书包须在可访问的“关于/来源”视图展示准确致谢与完整 MIT。小红书只支持静态扩展名白名单，不直接打包 `.md` 或无扩展名 `LICENSE`；可以把完整许可保存为包内 `licenses.json` 并由构建期写入页内内容，运行时不使用网络读取。来源 URL 在小红书内用普通文字，避免站外导航。最终核对见 [release-checklist.md](release-checklist.md)。
