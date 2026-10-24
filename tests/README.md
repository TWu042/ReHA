# 自动测试

都不需要摄像头，在仓库根目录运行。改了计数、阈值、纠错或姿态代码后，提交前全部跑一遍。

| 命令 | 测什么 | 负责 |
|---|---|---|
| `node tests/repCounter.test.js` | 计数器 × 7 份合成数据 | P2 |
| `node tests/realRecordings.test.js` | 计数器 × 4 段 P1 真人录制 | P2 |
| `node tests/movementModule.test.js` | 事件、session_completed 格式、samples、纠错接入、getMovementState | P2 |
| `node tests/angles.test.js` | 膝角、躯干角、选侧 | P4 |
| `node tests/feedback.test.js` | 前倾、没蹲到底、冷却 | P4 |
| `node tests/integration.test.js` | 计数 + 纠错一起跑，打印结果（不判断对错） | P4 |
| `node --test src/pose/p1.test.js` | 摄像头、识别、录制 | P1 |
| `npm run lint` | 代码检查 | 全员 |
| `npm run build` | 打包 | 全员 |

全部通过时，每个测试最后一行是"全部通过"或 "All ... passed"，退出码为 0。

## 工具

`node tests/analyzeRecordings.js`：分析 `mock/` 里每段真人录制（`p1_`、`p2_` 开头）的帧率、有效帧比例、膝角范围、计数、被放弃的原因。

```bash
node tests/analyzeRecordings.js                         # 分析全部录制
node tests/analyzeRecordings.js mock/p2_xxx.json        # 只分析一份
node tests/analyzeRecordings.js --enter 136 --exit 146  # 临时换底部阈值试试，不改 config.js
node tests/analyzeRecordings.js --aspect 1.7778         # 录制里没有 aspectRatio 时按 16:9 算（默认 4:3）
```

## 期望值

- 合成数据的期望值是固定的，失败就是逻辑出错了
- 真人录制的期望值是按当前阈值定的。调阈值后如果某项从"少算"变成"正确"（比如正常 5 次从 4 变成 5），说明变好了，改 `realRecordings.test.js` 里的期望值即可
