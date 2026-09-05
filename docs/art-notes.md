# 潮汐灯塔 · 美术资产来源

本项目视觉资产均为此次《潮汐灯塔》独立制作，未复用《星际漂流》的图片、图标或装饰。

## 群岛主插画

- 交付：`assets/archipelago.webp`，1672 × 941，194,976 字节（约 190 KiB）。
- 工具：OpenAI 内置 `image_gen.imagegen`，默认内置模式；没有使用 CLI / API 回退。
- 原始 PNG：`/Users/qiu/.codex/generated_images/01a06f99-bc99-73c2-9d10-76ad8ad73925/exec-9f2c2cbf-4694-477f-a277-46230e08b46e.png`。
- 原图留在生成目录，不加入游戏发布包。项目内使用上面的 WebP。
- 文件处理：使用环境已提供的 Sharp 将 PNG 编码为 WebP，quality 84、effort 6；不裁切、不缩放、不重画、不改变构图。
- 实际检查：已查看生成原图和项目 WebP。右中灯塔、左上深海留白、两侧群岛与奶油帆船符合构图需求；无字、UI、棋盘、网格或科幻元素。压缩后细波纹、灯光与纸质肌理保持清楚。

### 完整提示词

```text
Use case: stylized-concept.
Asset type: premium independent puzzle game's wide landscape key art and background, 16:9 composition for Tide Lanterns.
Primary request: a refined, gentle archipelago lighthouse illustration, a warm hand-painted nautical-chart world. Deep sea-green ocean, warm amber lamps, cream sails and tiny sailboats. The principal lighthouse stands on a small rugged green island at the middle-right, glowing softly across the water. Other small islands and graceful hand-painted waves frame the bottom and both sides. Keep the upper-left quadrant and much of the left half calm dark teal open ocean as usable negative space for foreground title text.
Style/medium: richly art-directed painterly illustration with delicate paper grain, gouache-like brush shapes, subtly engraved nautical contours, and a handcrafted storybook map sensibility. Polished indie game key art, elegant clear shapes, fine restrained details, inviting and contemplative rather than toy-like.
Lighting/mood: dusk sea, a few soft amber lighthouse beams and warm windows, quiet hope and discovery.
Color palette: deep sea green, muted turquoise, warm ivory paper, golden amber, small coral accents.
Composition/framing: wide horizontal landscape, lighthouse silhouette right of center; islands along lower edge and lateral edges; upper-left empty dark sea for interface readability.
Constraints: no lettering, no words, no numbers, no UI, no game board, no grid, no logos, no watermark, no sci-fi imagery, no stars or planets. Do not put a compass rose or text in the upper-left negative space. Do not imitate a specific artist.
```

## 应用图标

- `assets/icon.svg`：512 × 512 原生 SVG，海绿底、琥珀灯光、奶油灯塔与海浪。由本项目代码绘制，不使用第三方图标库或图像生成。
- `assets/icon-512.png`：同一 SVG 用环境 Sharp 栅格化为 512 × 512 PNG，保留圆角外的透明像素。
- 已实际查看 PNG，检查主体居中、灯塔轮廓、灯窗、航海波纹和小尺寸可识别性。

## 六件章节纪念物

统一为 160 × 160、透明背景的 SVG；海绿色 `#356961` 描线，金色 `#d5a463` 细节，辅以轻透明暖纸色填充。轮廓使用圆角端点及一致笔画，适合放在浅色收藏卡片上。

| 物件 | 文件 |
| --- | --- |
| 贝壳 | `assets/collectible-shell.svg` |
| 罗盘 | `assets/collectible-compass.svg` |
| 漂流瓶 | `assets/collectible-bottle.svg` |
| 船铃 | `assets/collectible-bell.svg` |
| 鲸尾 | `assets/collectible-whale.svg` |
| 灯塔 | `assets/collectible-lighthouse.svg` |

六件均为本项目原生 SVG 绘制，无外部图像、字体或运行脚本。已将全部 SVG 临时栅格化为暖纸色接触表并实际查看：物件识别明确，描线与金色细节一致。接触表仅供检查，不加入发布 assets。

## 发布约定

发布包只需复制 `assets/` 中最终图片与 SVG。应用、样式或教程引用这些资源时使用包内相对路径，不依赖生成目录或网络。插画文件远低于 400 KB 目标；不应转成 Base64 内嵌源码。
