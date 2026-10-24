# 模块 2：动作分析（P2 计数 + P4 纠错）

把 P1 发来的每一帧关键点变成：深蹲次数、每次的活动范围（ROM）、纠错提示、训练结束时的汇总数据。

## 对外接口（`movementModule.js`）

页面只需要用这三个函数：

```js
import { startMovement, stopMovement, getMovementState } from '../movement/movementModule.js';

startMovement();               // 点"开始"：开始计数，同时打开纠错
const result = stopMovement(); // 点"结束"：返回 MovementResult，同时发出 session_completed
getMovementState();            // 训练中随时读：{ phase, repCount, kneeAngleDeg, smoothedAngle, waitingForStand }，不在训练时为 null
```

`getMovementState()` 适合按动画帧读取（比如显示"请先站直"），不要放进每帧都更新的 React state。

### 发出的事件

| 事件 | 什么时候 | 内容 |
|---|---|---|
| `rep_completed` | 每完成一次有效深蹲 | `{ type, timestampMs, repCount, rom }` |
| `form_feedback` | 没蹲到底、上身前倾（2 秒冷却） | `{ timestampMs, code, message }`，`code` 为 `not_deep_enough` 或 `leaning_forward` |
| `session_completed` | `stopMovement()` 时 | MovementResult，见下 |

### MovementResult（训练结束时的数据）

例子：[mock/session_completed_example.json](../../mock/session_completed_example.json)（用合成数据跑出来的，格式和真实一样）。

| 字段 | 含义 |
|---|---|
| `repCount` | 有效次数 |
| `reps[]` | 每次有效深蹲一项；没有时为 `[]` |
| `reps[].rom` | 下蹲前站直时的最大膝角 − 这次的最低膝角（平滑后），度 |
| `reps[].durationMs` | 膝角从跌破 160° 到回到 160° 以上的时长 |
| `reps[].minKneeAngle` / `maxKneeAngle` | 这次的最低 / 最高膝角 |
| `reps[].samples[]` | `{ timestampMs, kneeAngleDeg }` 逐帧平滑膝角，给 P3 算平稳度。真人约 66 帧/秒，存历史时不要存它 |
| `averageROM` | `reps` 里 `rom` 的平均；没有有效次数时为 null |
| `baselineROM` | 固定为 null，由 P3 用历史记录计算 |
| `trackingQuality` | 能用的帧 ÷ 收到的帧（0–1）；一帧都没有时为 null |

**ROM 只以这里为准**，结果页、评分、趋势图都用它，不要另算。

## 计数怎么判断（`repCounter.js`）

```
STANDING ──膝角 < 160°──► DESCENDING ──膝角 < 133°──► BOTTOM ──膝角 > 143°──► ASCENDING ──膝角 ≥ 160°──► STANDING（计一次）
                              │                                                   │
                              └──回到 ≥ 160°，没蹲到底：不计，提示"再蹲低一点"     └──又蹲回 < 133°：回到 BOTTOM，算同一次
```

- **平滑**：膝角先做指数平滑（`SMOOTHING_ALPHA = 0.3`），去掉关键点抖动
- **底部滞回**：133° 进入底部、143° 才离开，防止在临界值附近反复进出
- **最短时长**：一次动作少于 0.8 秒不计（"太快"）
- **无效帧**：`valid` 为 false 或算不出膝角的帧直接跳过
- **出框保护**：两次有效帧间隔超过 1.5 秒，放弃正在做的这一次；恢复后要先站直才继续计数。训练刚开始时也要先站直
- **膝角**：`angles.js` 选可见度更高的一侧，算髋–膝–踝夹角；x 坐标乘以帧里的 `aspectRatio`，否则 4:3 画面会偏大约 7–13°

## 阈值

计数阈值在 [config.js](config.js)，纠错阈值在 [feedbackConfig.js](feedbackConfig.js)。

| 阈值 | 值 | 说明 |
|---|---|---|
| `STAND_ANGLE` | 160° | 高于它算站直 |
| `BOTTOM_ENTER_ANGLE` / `BOTTOM_EXIT_ANGLE` | 133° / 143° | 按 P1 真人录制调的：正常 5 次计 4、浅蹲 0、底部停顿 2 |
| `MIN_REP_DURATION_MS` | 800 | 少于它算太快 |
| `TRACKING_GAP_MS` | 1500 | 丢失追踪超过它，放弃当前这次 |
| `MAX_TRUNK_LEAN_DEG` | 45° | 下蹲时躯干前倾超过它，提示挺胸 |
| `FEEDBACK_COOLDOWN_MS` | 2000 | 同一种提示最短间隔 |

调阈值的流程见 [OPERATIONS.md 第 12.3 节](../../docs/OPERATIONS.md)：先用 `node tests/analyzeRecordings.js --enter 136 --exit 146` 试，不用改代码。

## 数字怎么理解

**ROM 是画面里的膝角变化，不是量角器量的临床数值。**
- 摄像头在侧前方 45°，看到的是腿的斜投影，膝盖弯曲在画面里显得比实际小。所以同一个人，正侧面拍的 ROM 会更大
- 参考：从站直蹲到大腿接近水平，画面里的 ROM 大约 70–90°。P1 的录制约 45–69°，P2 实测约 70–91°
- 适合用来比较同一个人、同一个摄像头位置下的进步，不适合和医学标准值直接比较

**trackingQuality 从点"开始"算到点"结束"。**走到摄像头前、做完走回去点"结束"的时间都算无效帧，所以来回走动的时间越长，这个数越低。它反映的是"整段时间里有多少时候看得清人"，不只是蹲的时候。

## 文件

| 文件 | 负责 | 作用 |
|---|---|---|
| `movementModule.js` | P2 | 对外接口，接 eventBus |
| `repCounter.js` | P2 | 计数状态机（纯逻辑，可单独测试） |
| `config.js` | P2 | 计数阈值 |
| `angles.js` | A（P5） | 膝角、躯干前倾角 |
| `formFeedback.js` | P4 | 前倾检测、没蹲到底提示、冷却 |
| `feedbackConfig.js` | P4 | 纠错阈值 |
| `debug.html` / `debug.js` | P2 | 实时测试页 |

## 已知问题

- 膝角只降到 158° 左右的小晃动也会提示"再蹲低一点"（P4 待处理）
- 浅蹲和正常深蹲之间余量不大（真人浅蹲最浅约 144°，阈值 133°），需要更多人的数据再调
- 前倾提示还没有用真人数据验证过（录制里最大前倾约 12°，没触发过）
