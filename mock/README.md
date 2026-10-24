# 测试数据

不开摄像头也能开发和测试。所有文件都是 PoseFrame 数组（`[{ timestampMs, landmarks, valid, aspectRatio? }, ...]`），格式见 [OPERATIONS.md 8.2 节](../docs/OPERATIONS.md)。

## 合成数据（`generateSquat.js` 生成）

```bash
node mock/generateSquat.js   # 在仓库根目录运行，一次生成下面 7 份
```

不要用 `>` 重定向输出，Windows PowerShell 会存成 UTF-16。随机噪声用固定种子，每次生成的文件完全一样。

| 文件 | 内容 | 期望次数 |
|---|---|---|
| `synthetic_squat.json` | 3 次标准深蹲（170° → 90° → 170°） | 3 |
| `shallow_squat.json` | 最低只到 150° | 0 |
| `pause_at_bottom.json` | 每次在底部停 2 秒 | 3 |
| `half_rep.json` | 蹲下后不起 | 0 |
| `tracking_lost.json` | 中间丢失追踪 1 秒 | 3 |
| `lost_at_bottom.json` | 蹲到底时出框 3 秒，站着回来，再蹲 1 次 | 1 |
| `lost_return_crouched.json` | 蹲到底时出框 3 秒，蹲着回来再站起，再蹲 1 次 | 1 |

合成数据 30 帧/秒，动作比真人"标准"，适合测逻辑，不适合调阈值。

## 真人录制

| 文件 | 内容 | 当前计数 |
|---|---|---|
| `p1_normal_5_*.json` | 正常深蹲 5 次（第一次偏浅，约 135°） | 4 |
| `p1_shallow_3_*.json` | 浅蹲 3 次（最低 144–153°） | 0 |
| `p1_bottom_pause_2_*.json` | 底部停 2 秒 × 2 | 2 |
| `p1_tracking_loss_*.json` | 出框、遮挡、重新入框 | 0 |

- 约 66 帧/秒。这 4 段是在 P1 加 `aspectRatio` 之前录的，帧里没有这个字段，测试时按 4:3 处理
- 用 P2 测试页（`/src/movement/debug.html`）录的新数据以 `p2_` 开头，放进这里后 `node tests/analyzeRecordings.js` 会自动分析

## 数据示例

`session_completed_example.json`：训练结束时 `session_completed` 的内容，用 `synthetic_squat.json` 跑出来的。格式和真实完全一样，但数字比真人理想（ROM 约 79°、30 帧/秒）。重新生成：`node tests/movementModule.test.js --write-example`。
