# 页面（P5）

| 文件 | 页面 | 作用 |
|---|---|---|
| `../App.jsx` | 外框 | 导航，在三个页面之间切换，保存本次训练结果 |
| `Home.jsx` | 首页 | 介绍和"开始"按钮 |
| `Training.jsx` | 训练页 | 摄像头画面、计数、追踪状态、纠错提示 |
| `Results.jsx` | 结果页 | 次数、平均 ROM、追踪质量、每次的 ROM 和时长 |

## 训练页怎么接其他模块

点"Start Training"：
1. `createCamera(video).start()` 打开摄像头（P1）
2. `createPoseTracker(video).start()` 开始识别，每帧发 `pose_frame`（P1）
3. `startMovement()` 开始计数和纠错（P2、P4）

点"End Training"：停止识别和摄像头，`stopMovement()` 返回结果，交给 `App.jsx` 跳到结果页。

监听的事件：

| 事件 | 页面上的变化 |
|---|---|
| `rep_completed` | 更新次数，显示 "Great job! Squat N completed." |
| `pose_frame` | 只在有效 / 无效切换时更新追踪状态：有效显示绿色 **In the frame**，无效显示红色和原因 |
| `tracking_lost` | 记录原因（`low_visibility` → "Can't see your whole body..."） |
| `form_feedback` | 黄色提示显示 3 秒（英文）："Squat a little lower." / "Lift your chest and keep your back straight." |

**性能规则**：`pose_frame` 每秒约 60 次，不要每帧 `setState`。只在状态变化时更新，或者在动画帧里读 `getMovementState()`。

## 待办

- 结果页目前直接显示 P2 的原始数据；P3 的评分（session_summary）做好后改为显示评分
- 训练中点导航栏离开，会发出一次不完整的 `session_completed`；P3 存历史时可能存进去。建议训练中禁用导航
- 可以用 `getMovementState().waitingForStand` 提示"请先站直"（刚开始没站直时不计数）
- P4 的剧情动画区域还没接入
