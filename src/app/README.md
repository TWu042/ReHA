# 页面（P5）

| 文件 | 页面 | 作用 |
|---|---|---|
| `../App.jsx` | 外框 | 导航，在三个页面之间切换，保存本次训练结果 |
| `Home.jsx` | 首页 | 介绍和"开始"按钮 |
| `Training.jsx` | 训练页 | 摄像头画面、计数、追踪状态、纠错提示 |
| `Results.jsx` | 结果页 | 次数、平均 ROM、追踪质量、每次的 ROM 和时长；P3 评分（幅度、平稳度、一致性、总分） |

## 训练页怎么接其他模块

点"Start Training"：
1. `createCamera(video).start()` 打开摄像头（P1）
2. `createPoseTracker(video).start()` 开始识别，每帧发 `pose_frame`（P1）
3. `startMovement({ angleMode: "2d", feedbackAngleMode: "auto" })` 开始计数和纠错（P2、P4）：计数用 2D，前倾检测用 3D

点"End Training"：停止识别和摄像头，`stopMovement()` 返回结果，交给 `App.jsx` 跳到结果页。

监听的事件：

| 事件 | 页面上的变化 |
|---|---|
| `rep_completed` | 更新次数，显示 "Great job! Squat N completed." |
| `pose_frame` | 只在有效 / 无效切换时更新追踪状态：有效显示绿色 **In the frame**，无效显示红色和原因 |
| `tracking_lost` | 记录原因（`low_visibility` → "Can't see your whole body..."） |
| `form_feedback` | 黄色提示显示 3 秒（英文）："Try squatting deeper!" / "Keep your chest up and back straight!" |

**性能规则**：`pose_frame` 实时约每秒 15 次（限流后），不要每帧 `setState`。只在状态变化时更新，或者在动画帧里读 `getMovementState()`。

## 现状

- 计数器在等人站直时（刚开始、出框回来）显示 "Stand up straight to start counting."
- 训练中（含启动摄像头时）导航栏禁用，避免误点中断训练
- 实时识别限制 15 帧/秒（`MAX_LIVE_FPS`），上传视频按 10 帧/秒逐帧分析
- 侧栏有 P1 的狐狸奖励动画（`src/story/FoxReward.jsx`），每完成一次深蹲庆祝一次
- 训练结束时 `App.jsx` 调用 `analyzeSession(result)`（`src/analytics/analyticsModule.js`）：转换 → P3 评分 → 存入 localStorage（`rehab_sessions_v2`）→ 发出 `session_summary`。出错不影响页面，结果页只显示 P2 原始数据
- 评分为 null 时显示 `--`，不当作 0：幅度分和总分要有之前的训练当基线（同一天第二次起就有）；0 次深蹲时没有一致性和平稳度
- 只有点结束训练才评分和存历史；组件卸载时调用的 `stopMovement()` 不会评分
