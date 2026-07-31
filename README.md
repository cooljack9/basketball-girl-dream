# 篮球女孩梦工场 · Basketball Girl Dream

一个**纯前端单文件**的篮球生涯模拟游戏（HTML + 内联 CSS/JS，零依赖、零构建）。

## 技术说明

- 整个游戏是 `bbg-client.html` 一个文件，浏览器直接打开即玩。
- 运行在 **LOCAL_MODE**：所有逻辑（属性成长、比赛模拟、淘汰赛签表、赛季结算）都在浏览器内执行，进度存档在 `localStorage`，**不需要任何后端服务器**。
- 因此部署到 **Vercel 静态托管**即可，无需 Serverless Function，带宽消耗极低（单次加载约数百 KB），Hobby 套餐 100GB/月绰绰有余。

## 本地运行

直接用浏览器打开 `bbg-client.html` 即可，无需安装任何东西。

## 部署（GitHub + Vercel）

仓库已包含 `vercel.json`：根路径 `/` 会重写到 `/bbg-client.html`。

1. 在 [Vercel](https://vercel.com/new) 点击 **Add New → Project**。
2. **Import** 本 GitHub 仓库（`cooljack9/basketball-girl-dream`）。
3. Framework 选 **Other / 静态**，无需改任何设置，直接 **Deploy**。
4. 此后每次 `git push` 到 main，Vercel 会自动重新部署。

## 目录结构

| 文件 | 作用 |
| --- | --- |
| `bbg-client.html` | 游戏本体（前端客户端 + 完整 UI + 浏览器内引擎） |
| `basketball-girl.html` | 无头后端引擎（用于 Node 沙箱回归测试，与前端逻辑镜像） |
| `server/` | 本地 Node 测试服务（`engine-loader.js` / `server.js` / `store.js`） |
| `vercel.json` | Vercel 静态托管配置（根路径重写到游戏页） |
| `篮球女孩梦工场_需求文档.md` | 原始需求文档 |

## 最近一轮优化（2026-07-31）

- **难度平滑**：淘汰赛改为标准种子签表（玩家固定 1 号位、宿敌婷婷固定 2 号位），每轮对手由弱到强、决赛才相遇；重做胜负概率曲线，明显占优时胜率约 70%（原 92%），五五开 BO5 约 56%（原 96%），并大幅削弱势头滚雪球。
- **个人 + 团队成长满足感**：赛季结算新增「成长回顾卡」（技术/力量/敏捷/体力/身高/战力 + 球队 OVR + 联赛排名），赛前新增实时胜算条。
- **前端贴合**：延续响应式适配（viewport + 多档断点 + iOS 输入框防缩放 + 大按钮易点）。
