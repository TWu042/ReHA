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

`session_completed_example.json`：训练结束时 `session_completed` 的内容，用 `synthetic_squat.json` 跑出来的。格式和真实完全一样，但数字比真人理想（3 次、ROM 约 80°、30 帧/秒、没有纠错）。重新生成：`node tests/movementModule.test.js --write-example`。

`session_completed_real_example.json`：用真人录像 `p1_normal_5_*` 跑出来的（4 次、平均 ROM 59.9°、1 次"没蹲到底"纠错、angleSource 2d），数字更接近真实情况。重新生成：`node mock/replay.js mock/p1_normal_5_2026-10-24T20-07-57.148Z.json --write mock/session_completed_real_example.json`。

## 录制回放（`replay.js`）

- 命令行：`node mock/replay.js mock/p1_normal_5_xxx.json` 把一段录制跑完整条流程（计数 → adapter → P3 评分），打印结果；加 `--write 文件名` 保存真实的 session_completed
- 浏览器：`playRecording(frames, { speed })` 按录制里的时间间隔发出 `pose_frame`，不用开摄像头（文档 7.3 节的 mockPlayer），返回停止函数
- `p1_` 开头的旧录制默认补 4:3 宽高比，合成数据不补；可以用 `--aspect` 指定

## 模拟训练历史（`sessions.js`，P3）

5 次模拟训练（2026-10-20 至 24，平均 ROM 62 → 79°），`isMock: true`，演示时当作基线和趋势图的历史。
