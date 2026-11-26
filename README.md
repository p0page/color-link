# Color Link · 彩色连线

两位玩家在同一台设备上轮流落子，挑战对方能否将盘面上的同色棋子全部连通。支持电脑和手机浏览器。

[在线试玩](https://p0page.github.io/color-link/)

## 玩法

1. 开赛前为每一局选好棋盘。赛制可选一局定胜负、三局两胜或五局三胜，默认五局三胜。每局开始时由玩家手动选择先手。
2. 先手的首回合放 1 枚棋子，此后每回合任选 2 枚不同颜色的棋子。点击 A–Z 中的字母棋子，再点击空格落子，放齐后点「确认落子」。每个回合的所有落子共用同一个倒计时，默认 90 秒。落子超时，对手得 1 分。
3. 对手完成落子后，你可以在自己的回合点击「认定不可能」。上一手落子方进入验证，补齐只有一枚的颜色，并为盘面上每对同色棋子连线。点击格子可逐段画出折线，也可擦除重画。路径只可上下左右移动，不得穿过其他棋子或障碍，各条路径不得重叠或交叉。默认每条线至少占 6 格，起点和终点都计入。
4. 所有连线符合规则时，系统自动判定验证方得 1 分。验证方认输或超时，发起挑战的玩家得 1 分。验证默认限时 5 分钟，落子和验证也都可以设为不限时。

验证阶段可手动点击「自动求解」。求解器会清除现有连线，找到合法方案后自动补棋和连线，再按同一套规则结算。无法求解时，页面会提示结果，玩家可以继续手动验证。

## 地图与历史记录

- 开赛前可逐局选择或随机抽取地图，地图池包含节目原版、创意、空白和自定义地图。点击地图缩略图可以查看大图。
- 在「新建地图」中可调整行列数，预先放置棋子和障碍，也可随机生成棋盘再编辑。
- 保存的自定义地图和已完成的对决记录存放在当前浏览器的 `localStorage`。

## 本地开发

项目使用 Svelte 5、TypeScript 和 Vite。自动求解使用 CaDiCaL WebAssembly，在 Web Worker 中运行。

GitHub Actions 使用 Node.js 24 和 pnpm 11.25.0。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

```sh
pnpm check
pnpm test
pnpm build --base ./
pnpm preview
```

推送到 `main` 后，GitHub Actions 会检查、构建，并把 `dist/` 部署到 GitHub Pages。

## 流量统计

项目使用免费的 Cloudflare Web Analytics 统计页面浏览量、访问次数和来源，无需自建后端。

1. 在 [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/get-started/#sites-not-proxied-through-cloudflare) 添加站点，主机名填 `p0page.github.io`。
2. 从 Cloudflare 提供的安装代码里复制 `data-cf-beacon` 中的 `token`，将它设为 [GitHub Actions 仓库变量](https://github.com/p0page/color-link/settings/variables/actions) `CLOUDFLARE_WEB_ANALYTICS_TOKEN`。这个站点 token 会随网页公开。
3. 运行 [Deploy Color Link](https://github.com/p0page/color-link/actions/workflows/pages.yml) 重新部署。打开在线试玩页面后，可在 Cloudflare 的 Web Analytics 面板查看数据，共用主机名的项目可以按 `/color-link/` 路径筛选。

变量留空时，构建产物不包含统计脚本。本地开发服务器也不会加载统计脚本。
