# 发布记录

2026-09-05。

## 当前状态

独立游戏开发完成：48 个战役关、6 个章节与额外 120 道离线航图，214 项自动测试通过。浏览器已解锁，实际走查见 `layout-review.md`。

## Vercel

- 独立项目：`qiuzixiangs-projects/tide-lanterns`。
- 生产地址：https://tide-lanterns.vercel.app/
- 本次部署：https://tide-lanterns-42bgoix6l-qiuzixiangs-projects.vercel.app
- 部署 ID：`dpl_HD2ftgme9pLFHRuXKYykEetKRk8x`，平台 READY、生产 alias 完成。
- 通过已登录 Vercel CLI 发布；构建命令 `npm test && npm run build`。
- 2026-09-05 09:46:24 UTC，匿名 GET 核对全部 12 个生产资源，HTTP 200 且与本地 dist 逐字节一致。记录见 `releases/vercel-resource-check.json`。
- Vercel CLI `git connect` 已返回 Connected，关联 `qiuzixiang/tide-lanterns`。初次 READY 部署来自 CLI。后续已实际核对 Git 自动部署 `dpl_CfWiXyzpCaafSFrjSp3mGMhMc262` 的构建日志：克隆 `github.com/qiuzixiang/tide-lanterns` 的 `main`、提交 `d9ae4f2`，214 项测试通过、构建完成、部署 Ready。这证明 Git 关联的真实自动构建链路；之后文档提交触发的部署在最终交付记录另列。

## GitHub

公开独立仓库：https://github.com/qiuzixiang/tide-lanterns 。源码通过已登录的原生 GitHub 网页分目录提交，包含根入口、源码、素材、构建工具、测试、文档与发布清单。远端 main 采用网页提交历史，与本地开发分支的初始提交 SHA 不同。已匿名取回提交 `695c29367f6415c658612e8a1de3c5697a490325`：30/30 核心文件与本地逐字节一致，独立执行 `npm ci`、`npm test`（214/214）及 `npm run build` 成功，12 个 dist 文件与已发布构建一致。随后追加文档和包校验记录；最终提交在交付记录中列出。

## 小红书

最终 ZIP 已上传并部署成功。用户在浏览器中完成最终提交后，原生 Chrome 实际读取小工具列表并截图确认：**潮汐灯塔 V1.0.0 · 审核中**。此状态不是审核通过或已经公开可用。

- 名称：潮汐灯塔
- 简介：旋转航路点亮整片群岛
- 版本：1.0.0
- 图标：`assets/icon-512.png`
- 权限：不需要权限
- ZIP：`releases/tide-lanterns-xiaohongshu-1.0.0.zip`
- 大小：288,261 字节，12 个文件
- SHA-256：`a2a9e5c00b4ea103233ebb5006c4298c56fd311b503cab4564ae20aeefa31958`
- 官方审计：`PASS: 12 file(s), 0 warning(s)`。
- 平台：https://creator.xiaohongshu.com/new/red-app
- 最终包平台模拟器完成教程、旋转、撤销/重做、第一关两步通关；通关状态为 9 个航标、2 次转动、0 提示。
- 宿主返回后再次点“使用”，模拟器出现空页/页面不见了，未通过此路线验收。重新上传同一包后正常初次进入；不将平台 iframe 未正确重新加载归因于应用代码。
- 最新恢复预览：https://creator.xiaohongshu.com/miniapp-simulator/90860da6-cb72-41d0-b820-0ddaf467d50b/index.html （平台临时预览，不是公开发布地址）。
- 表单协议链接实际指向《小工具服务协议》；用户自行完成最后的协议及提交步骤，助手没有代为勾选。未触碰撤回按钮，未发布推广笔记。

## 验证范围

原生 Chrome 已实际检查桌面核心流程及 320×450、375×450、375×812 iframe。320×450 的第 33 关 6×6 棋盘在常驻滚动条下六列完整，页面可纵向滚到全部工具；教程和许可等长弹层可内部滚动，底部按钮可见。窄屏检查页仅在本地 qa，不进入 Git 与部署。

Chrome 61、Android 8.1、iOS 真机及真实移动性能未实测。不得将桌面尺寸模拟或自动行为测试称为真机通过。
