# ReHA — AI 康复冒险

只需要摄像头的康复训练网页。用户对着摄像头做深蹲，网页实时计数、提示动作哪里不对；每做一次，卡通角色推进一段冒险剧情；训练结束后给出报告。视频全程在浏览器本地处理，不上传。

完整分工、时间表、接口约定见 [docs/OPERATIONS.md](docs/OPERATIONS.md)。

## 快速开始

需要 Node.js 18 或以上。

```bash
npm ci          # 第一次运行前安装依赖
npm run dev     # 启动开发服务器，打开终端显示的地址（一般是 http://localhost:5173/）
```

| 命令 | 作用 |
|---|---|
| `npm run dev` | 本地开发 |
| `npm run build` | 打包到 `dist/`（包含模型和 WASM，可离线识别） |
| `npm run preview` | 本地预览打包结果 |
| `npm run lint` | 代码检查 |

摄像头只在 `localhost` 或 HTTPS 下可用。

## 数据怎么流动

```
摄像头 ──► P1 姿态识别 ──pose_frame──► P2 计数 ──rep_completed──────► P5 训练页（次数）
            src/pose/                 src/movement/ ──form_feedback──► P5 训练页（纠错）
              │                           │
              └──tracking_lost──► P5      └──session_completed──► P5 结果页 / P3 评分
```

模块之间只通过 `src/shared/eventBus.js` 发事件，事件名和数据格式在 `src/shared/contracts.js` 和 [OPERATIONS.md 第 8 节](docs/OPERATIONS.md)。

## 目录

| 位置 | 负责 | 内容 | 说明 |
|---|---|---|---|
| `src/shared/` | 全员 | 事件总线、事件名、关键点编号 | 改之前先在群里说 |
| `src/pose/` | P1 | 摄像头、MediaPipe 识别、追踪质量、录制 | [README](src/pose/README.md) |
| `src/movement/` | P2、P4 | 深蹲计数、ROM、纠错 | [README](src/movement/README.md) |
| `src/app/` | P5 | 首页、训练页、结果页 | [README](src/app/README.md) |
| `src/analytics/` | P3 | 评分、基线、历史存储、P2→P3 适配 | 平稳度分和结果页接入进行中 |
| `src/story/` | P4 | 剧情动画、宝箱、动作回放 | ⏳ 还没开始 |
| `mock/` | — | 合成数据、真人录制、数据示例 | [README](mock/README.md) |
| `tests/` | — | 不用摄像头的自动测试 | [README](tests/README.md) |
| `docs/` | — | 操作手册 | [OPERATIONS.md](docs/OPERATIONS.md) |

## 调试页面

先 `npm run dev`，再打开（只在开发时用，打包上线时不包含）：

- `/src/movement/debug.html`：计数实时测试（骨架、膝角曲线、阈值线、准确率、录制）
- `/src/pose/debug.html`：摄像头和关键点调试、按场景录制

## 协作规则

- 从最新的 main 开分支：`git checkout main`、`git pull`、`git checkout -b 你的分支`
- 只改自己负责的文件夹；文件直接放到上表的位置，不要另建个人文件夹
- 提交前跑一遍测试（见 [tests/README.md](tests/README.md)），通过 Pull Request 合并
