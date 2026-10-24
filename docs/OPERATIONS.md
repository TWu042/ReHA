**AI Rehabilitation Adventure**

24 小时完整操作流程

> **以仓库里这份为准**（`docs/OPERATIONS.md`）。最近更新：2026-10-25，按目前 main 上的实际代码修订：
> - 7 节：假数据改为一条命令生成 7 份，浅蹲最低角度改为 150°；mockPlayer 和 sessions.js 还没有人做
> - 8.2 节：PoseFrame 增加 `aspectRatio`；补上 tracking_lost 的内容；MovementResult 增加每次的 `samples`，`baselineROM` 由 P3 计算
> - 8.3 节：底部阈值改为进入 133° / 离开 143°，新增 `TRACKING_GAP_MS`；纠错阈值在 `feedbackConfig.js`；存储键改为 `rehab_sessions_v2`
> - 新增第 12 节：测试与调试页面

| **章节** | **内容**                                  |
|----------|-------------------------------------------|
| 0        | 项目是什么、创新在哪                      |
| 1        | 开工前 30 分钟：GitHub、VS Code、仓库骨架 |
| 2        | 分组与三个阶段总览                        |
| 3        | 第一阶段（0–7h）：三组做模块 1、2、3      |
| 4        | 第二阶段（7–16h）：做模块 4、5，集成      |
| 5        | 第三阶段（16–24h）：测试、Pitch、彩排     |
| 6        | Git 日常操作                              |
| 7        | 假数据：怎么做、怎么运行                  |
| 8        | 接口与变量名                              |
| 9        | 检查点清单                                |
| 10       | 演示脚本与评委问答                        |
| 11       | 出问题怎么办                              |
| 12       | 测试与调试页面                            |

# 0. 项目是什么

**一句话：**一个只需要摄像头的网页。用户做深蹲，网页实时计数、提示动作哪里不对。每做一次，卡通角色推进一段冒险剧情。训练结束后给出报告。

> 打开网页 → 站到摄像头前 → 深蹲 → 计数 + 纠错提示 + 角色开宝箱 → 训练结束 → 本集剧情 + 训练报告

**五个模块：**

| **模块**   | **做什么**                          | **输出**                                        |
|------------|-------------------------------------|-------------------------------------------------|
| 1 姿态识别 | 摄像头画面 → 人体 33 个关键点       | pose_frame 事件                                 |
| 2 动作分析 | 关键点 → 次数、纠错提示、动作数据   | rep_completed、form_feedback、session_completed |
| 3 数据分析 | 动作数据 → 评分、报告、趋势图       | session_summary、结果页                         |
| 4 剧情动画 | 动作事件 → 宝箱动画、剧情、动作回放 | 剧情画面                                        |
| 5 页面集成 | 把所有模块接成一个网站并部署        | 可访问的网址                                    |

## 创新点（Pitch 用）

单独看，每个部分都有人做过。AI 康复平台（如 Kemtai）用摄像头做实时纠错；健身游戏（如 Ring Fit Adventure）用剧情激励运动，但需要专用手柄，也不针对康复。

|                        | **康复 AI** | **健身游戏** | **我们**             |
|------------------------|-------------|--------------|----------------------|
| 设备                   | 摄像头      | 专用手柄     | 只要摄像头           |
| 康复指标（ROM、纠错）  | 有          | 没有         | 有                   |
| 剧情激励               | 弱          | 强           | 强                   |
| 剧情由用户真实动作驱动 | 没有        | 部分         | 有，角色重演用户动作 |

> **核心说法：**康复最大的问题不是不会做，而是坚持不下去。康复 AI 解决"做得对不对"，游戏解决"想不想做"。我们把两者放进一个只需摄像头的网页，而且剧情主角就是用户自己。

# 1. 开工前 30 分钟

## 1.1 五人一起（10 分钟）

1.  **确认分组**（见第 2 节），每人记住自己的编号 P1 到 P5。

2.  **定摄像头角度：**侧前方约 45°，距离 2 到 3 米，全身入镜。所有人测试和录制都用这个角度。

3.  **过一遍接口：**第 8 节的数据格式和事件名，有异议现在提。之后改要在群里说。

4.  **建群：**所有进度、问题、改接口都在群里发。

## 1.2 P5 搭仓库（15 分钟，其他人同时装环境）

**P5 在 VS Code 终端执行：**

```bash
npm create vite@latest rehab-adventure -- --template react
cd rehab-adventure
npm install
npm install @mediapipe/tasks-vision recharts
mkdir -p src/shared src/pose src/movement src/analytics src/story src/app mock docs
```

然后创建 src/shared/eventBus.js：

```js
const listeners = {};
export const eventBus = {
  on(type, fn) {
    (listeners[type] ||= []).push(fn);
    return () => { listeners[type] = listeners[type].filter(f => f !== fn); };
  },
  emit(type, data) {
    (listeners[type] || []).forEach(fn => fn(data));
  },
};
```

再创建 src/shared/contracts.js（内容见第 8 节），把分工文档放进 docs/。

**发布到 GitHub：**VS Code 左侧 Source Control → **Publish to GitHub** → 选 Private。然后在 GitHub 网页 Settings → Collaborators 加另外四人。

## 1.3 其他四人（同时进行）

1.  安装 Node.js（18 以上）、Git、VS Code。终端输入 node -v 确认。

2.  接受 GitHub 邀请后：git clone \<仓库地址\>，cd rehab-adventure，npm install。

3.  建自己的分支：git checkout -b p1-pose（P2 用 p2-movement，以此类推）。

4.  npm run dev，浏览器打开 localhost:5173 能看到页面就算成功。

## 1.4 让 VS Code 里的 Claude 进入状态

每个人第一次打开 Claude 时，发这段话：

```text
我在一个 5 人 24 小时 hackathon 里，项目是 AI 康复训练网页（深蹲识别 + 纠错 + 剧情动画）。
请先读 docs/ 里的分工文档和 src/shared/contracts.js、src/shared/eventBus.js。
我是 P__，负责 ______。我只能修改 src/____/ 和 mock/ 里我自己的文件。
模块之间只通过 eventBus 通信，事件名和数据格式必须严格按 contracts.js。
每完成一步，告诉我怎么测试，再继续下一步。
```

# 2. 分组与三个阶段

思路：先集中全部人力做出 1、2、3（数据链路），再做 4、5（剧情和集成）。

<table>
<colgroup>
<col style="width: 12%" />
<col style="width: 13%" />
<col style="width: 41%" />
<col style="width: 31%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>阶段</strong></th>
<th><strong>时间</strong></th>
<th><strong>谁做什么</strong></th>
<th><strong>结束时的结果</strong></th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>准备</td>
<td>0–0:30</td>
<td>全员：仓库、环境、接口</td>
<td>人人能跑 npm run dev</td>
</tr>
<tr class="even">
<td>第一阶段</td>
<td>0:30–7h</td>
<td><p>A 组 P1+P5：模块 1</p>
<p>B 组 P2+P4：模块 2</p>
<p>C 组 P3：模块 3</p></td>
<td>有骨架、有计数、有纠错、有报告</td>
</tr>
<tr class="odd">
<td>第二阶段</td>
<td>7–16h</td>
<td><p>P4+P1：模块 4</p>
<p>P5：模块 5</p>
<p>P2：继续调参</p>
<p>P3：报告收尾，14h 起 PPT</p></td>
<td>完整流程走通，部署上线</td>
</tr>
<tr class="even">
<td>第三阶段</td>
<td>16–24h</td>
<td>全员：测试、修 bug、彩排</td>
<td>能稳定演示 3 分钟</td>
</tr>
</tbody>
</table>

## 为什么这样分

- **模块 2 最难**，是关键路径，所以 B 组放两个人。

- **P5 先进 A 组**：做摄像头页面本来就要网页框架，正好顺手搭好，第二阶段直接做集成。

- **P1 第二阶段做回放**：P1 最熟悉关键点数据，"角色重演用户动作"交给他最快。

- **P4 第一阶段在模块 2**：做角度和纠错时熟悉了事件，第二阶段做剧情动画能直接对接。

## 睡觉轮班

| **时间** | **谁睡**         |
|----------|------------------|
| 10–13h   | P1、P3           |
| 13–16h   | P2、P4           |
| 17–19h   | P5（功能冻结后） |

# 3. 第一阶段（0:30–7h）：做模块 1、2、3

## A 组：模块 1 姿态识别（P1 + P5）

| **时间**  | **P1**                                                       | **P5**                                       | **产出**                             |
|-----------|--------------------------------------------------------------|----------------------------------------------|--------------------------------------|
| 0:30–1:30 | src/pose/camera.js：打开摄像头                               | src/app/：Home、Training、Results 三页和导航 | 网页能看到摄像头画面                 |
| 1:30–2:30 | src/pose/poseTracker.js：MediaPipe 逐帧识别，发出 pose_frame | src/pose/poseRenderer.js：Canvas 画骨架      | 骨架跟着人动                         |
| 2:30–3:00 | src/pose/recorder.js：录 3 段深蹲                            | 帮忙当被录的人                               | **mock/squat_recording.json 推上去** |
| 3:00–5:00 | 无效帧判断，发 tracking_lost                                 | 训练页布局：视频、计数、提示区               | 出框时有提示                         |
| 5:00–7:00 | 遮挡、弱光测试                                               | 把模块 2 接进训练页                          | 屏幕上显示实时计数                   |

> **2:30 前必须推送录制文件。**B 组要用它测计数。录制时按统一角度，正常蹲 5 次、浅蹲 3 次、蹲到底停 2 秒 2 次。

## B 组：模块 2 动作分析（P2 + P4）

| **时间**  | **P2**                                               | **P4**                                           | **产出**            |
|-----------|------------------------------------------------------|--------------------------------------------------|---------------------|
| 0:30–1:30 | mock/generateSquat.js：生成合成数据（代码见第 7 节） | src/movement/angles.js：膝角、躯干前倾角         | 合成数据 + 角度函数 |
| 1:30–3:30 | src/movement/repCounter.js：状态机计数               | src/movement/formFeedback.js：蹲不够深、上身前倾 | 合成数据能正确计数  |
| 3:30–5:00 | 换用 P1 录制文件测试，调 config.js                   | src/movement/metrics.js：每次 ROM、时长          | 录制文件计数全对    |
| 5:00–7:00 | 发出 rep_completed、session_completed                | 发出 form_feedback，加 2 秒冷却                  | 事件能被页面收到    |

## C 组：模块 3 数据分析（P3）

| **时间**  | **做什么**                                                   | **产出**         |
|-----------|--------------------------------------------------------------|------------------|
| 0:30–1:30 | mock/sessions.js：5 次假训练                                 | 假数据可用       |
| 1:30–3:00 | src/analytics/scoring.js：Q = 0.4 幅度 + 0.3 平稳 + 0.3 一致 | 评分函数         |
| 3:00–4:00 | src/analytics/storage.js：localStorage 存取，处理空和坏数据  | 存储模块         |
| 4:00–6:30 | src/analytics/ResultsCharts.jsx：评分拆解、ROM、趋势图       | 结果页图表       |
| 6:30–7:00 | 监听 session_completed，算分后发 session_summary             | 真数据能进结果页 |

> **7 小时检查点：**真人对着摄像头深蹲 → 屏幕有骨架 → 计数正确 → 做错时出提示 → 结束后结果页有分数。达不到就全员先帮 B 组。

# 4. 第二阶段（7–16h）：做模块 4、5

## 模块 4 剧情动画（P4 + P1）

| **时间** | **P4**                                               | **P1**                                        | **产出**             |
|----------|------------------------------------------------------|-----------------------------------------------|----------------------|
| 7–9h     | src/story/scene.js：森林、角色、宝箱                 | 睡前整理录制数据格式                          | 场景画出来           |
| 9–11h    | src/story/animationEngine.js：rep_completed → 开宝箱 | （10–13h 睡觉）                               | 每蹲一次开一个宝箱   |
| 11–13h   | src/story/storyTemplates.js：3 集剧情 + 旁白         | （睡觉）                                      | 剧情模板             |
| 13–16h   | （13–16h 睡觉）                                      | src/story/replay.js：用录制关键点驱动角色重演 | **角色重演用户动作** |
| 可选     | src/story/narrator.js：LLM 旁白，失败用模板          |                                               | 个性化旁白           |

**回放的做法：**训练时把 pose_frame 存进 replayFrames 数组。结束后按时间戳逐帧读出，用肩、髋、膝、踝的坐标画卡通角色的身体和四肢，不画真人画面。

## 模块 5 页面集成（P5）

| **时间** | **做什么**                                             | **产出**     |
|----------|--------------------------------------------------------|--------------|
| 7–10h    | 训练页完善：计数大字、提示条、动画区、开始/结束按钮    | 训练页完成   |
| 10–13h   | 接入 P3 结果页、P4 动画画布                            | 完整流程初版 |
| 13–15h   | 部署：vercel.com 用 GitHub 登录 → Import 仓库 → Deploy | HTTPS 网址   |
| 15–16h   | 全流程走一遍，修卡点                                   | 流程跑通     |

> **性能注意：**每帧关键点不要放进 React state。视频、骨架、动画用 Canvas + useRef 直接画。React 只管计数、提示这类低频数据。

## P2 和 P3

- **P2：**找不同身高的队友真人测试，调 config.js 阈值，目标连做 10 次至少对 9 次。

- **P3：**结果页细节，模拟数据显示"模拟"标签。14h 开始收集每人一句话，做 PPT。

> **16 小时检查点：**打开网址 → 训练 → 计数和提示 → 宝箱动画 → 结束 → 剧情 + 报告，全部走通。**之后功能冻结，只修 bug。**

# 5. 第三阶段（16–24h）：测试与演示

| **时间** | **P1**                     | **P2**           | **P3**          | **P4**                     | **P5**             |
|----------|----------------------------|------------------|-----------------|----------------------------|--------------------|
| 16–19h   | 异常测试：出框、遮挡、弱光 | 真人调参最后一轮 | PPT             | 动画打磨；回放没完成就收尾 | 睡觉 17–19h        |
| 19–21h   | 录备用演示视频             | 测试计数边界情况 | 讲稿 + 评委问答 | 剧情文字润色               | 部署检查、断网测试 |
| 21–23h   | 彩排 ×3                    | 演示做深蹲的人   | 主讲            | 操作电脑                   | 现场设备           |
| 23–24h   | 休息，准备上台             |                  |                 |                            |                    |

**测试清单**见第 9 节，每一项都要实际试过。

# 6. Git 日常操作

## 每次开始干活前

```bash
git checkout main
git pull
git checkout p2-movement      # 换成你自己的分支
git merge main                # 把别人的最新代码合进来
```

## 做完一小块就提交

```bash
git add .
git commit -m "P2: 状态机计数完成，合成数据测试通过"
git push
```

然后去 GitHub 网页开 Pull Request，标题写清做了什么，P5 审核合并。

## 规则

- **只改自己的文件夹。**改 src/shared/ 必须先在群里说。

- **至少每 2 小时推一次。**不要攒到最后。

- **合并冲突找 P5。**不要自己乱删别人的代码。

- **不要把 API key 提交到 GitHub。**放在 .env.local，这个文件 Vite 默认不会提交。

# 7. 假数据

假数据让每个人不用等别人、不用开摄像头就能开发和测试。全部放在 mock/。

| **文件**                                  | **谁做** | **状态**   | **用途**                                   |
|-------------------------------------------|----------|------------|--------------------------------------------|
| generateSquat.js → 7 份合成数据（见 7.2） | P2       | ✅ 已完成  | 测计数和纠错                               |
| p1_*.json（4 段真人录制）                 | P1       | ✅ 已完成  | 真实数据调参、回归测试、做回放             |
| p2_*.json                                 | 任何人   | 随时补充   | 用 P2 测试页录的队友数据（见第 12 节）     |
| session_completed_example.json            | P2       | ✅ 已完成  | 训练结束时的数据格式示例，给 P3 对接       |
| mockPlayer.js                             | P5       | ⏳ 还没做  | 不开摄像头播放数据、发假事件               |
| sessions.js                               | P3       | ⏳ 还没做  | 画趋势图                                   |

## 7.1 合成深蹲数据

原理：固定脚踝，按想要的膝角反推膝盖和髋的位置，这样角度一定准确。随机噪声用固定种子，每次生成的文件完全一样。

运行（在仓库根目录）：

```bash
node mock/generateSquat.js
```

一次生成 7 份文件到 mock/。

> **不要用 `>` 重定向**（比如 `node mock/generateSquat.js > xxx.json`）：Windows PowerShell 5.1 会把输出存成 UTF-16，之后读 JSON 会报错。生成器自己写 UTF-8 文件。

想加新的测试数据：在 generateSquat.js 的 `DATASETS` 里加一项。可以用参数（`reps`、`minAngle`、`pauseAtBottomMs` 等），也可以用 `sequence` 按步骤描述动作，例如：

```js
{ sequence: [{ to: 90, ms: 1000 }, { hold: 300 }, { lost: 3000 }, { to: 170, ms: 1000 }] }
// to：在 ms 毫秒内平滑变到这个膝角；hold：保持；lost：这段时间追踪丢失（valid: false）
```

## 7.2 合成测试数据

| **文件**                  | **内容**                                      | **期望次数** |
|---------------------------|-----------------------------------------------|--------------|
| synthetic_squat.json      | 3 次标准深蹲（170° → 90° → 170°）             | 3            |
| shallow_squat.json        | 最低只到 150°（接近真人浅蹲 144–153°）        | 0，提示"再蹲低一点" |
| pause_at_bottom.json      | 每次在底部停 2 秒                             | 3，不重复计数 |
| half_rep.json             | 蹲下后停在 90°，不起身                        | 0            |
| tracking_lost.json        | 中间 30 帧（1 秒）valid: false                | 3，短暂丢失不影响 |
| lost_at_bottom.json       | 蹲到底时出框 3 秒，站着回来，再蹲 1 次        | 1，不多算    |
| lost_return_crouched.json | 蹲到底时出框 3 秒，蹲着回来再站起，再蹲 1 次  | 1，不多算    |

## 7.3 假事件播放器

> ⏳ 仓库里还没有 mock/mockPlayer.js。下面是计划中的写法。真人录制在 mock/p1_*.json，格式就是 `playRecording(frames)` 需要的帧数组。

```js
// mock/mockPlayer.js
import { eventBus } from '../src/shared/eventBus';
import { EVENTS } from '../src/shared/contracts';

export function playRecording(frames, speed = 1) {
  frames.forEach(f =>
    setTimeout(() => eventBus.emit(EVENTS.POSE_FRAME, f), f.timestampMs / speed));
}

export function fakeRep(repCount) {
  eventBus.emit(EVENTS.REP_COMPLETED, {
    type: 'rep_completed', timestampMs: Date.now(), repCount, rom: 75,
  });
}
```

**怎么运行：**网址后加 ?mock=1（例如 localhost:5173/?mock=1），页面不开摄像头，改为播放录制文件。P5 在页面里这样判断：

```js
const useMock = new URLSearchParams(location.search).has('mock');
```

P3、P4 开发时在页面角落放几个按钮，点一下发一个假事件，演示前删掉或隐藏。

## 7.4 假训练记录

> ⏳ 仓库里还没有 mock/sessions.js。演示时只有一次真实训练，基线（前三次平均）需要靠这些模拟历史，所以 P3 要做，而且结果页必须标"模拟"。

```js
// mock/sessions.js：5 次训练，ROM 逐渐提高
export const mockSessions = [62, 66, 70, 71, 75].map((rom, i) => ({
  sessionId: `mock-${i + 1}`, date: `2026-10-${20 + i}`, isMock: true,
  completedReps: 10, averageROM: rom, trackingQuality: 0.9,
  qualityScore: null, scoreBreakdown: null,
}));
```

isMock: true 让结果页自动显示"模拟数据"标签。

# 8. 接口与变量名

## 8.1 src/shared/contracts.js

```js
// MediaPipe Pose 关键点编号
export const LM = {
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
};

// 事件名
export const EVENTS = {
  POSE_FRAME: 'pose_frame',
  REP_COMPLETED: 'rep_completed',
  FORM_FEEDBACK: 'form_feedback',
  TRACKING_LOST: 'tracking_lost',
  SESSION_COMPLETED: 'session_completed',
  SESSION_SUMMARY: 'session_summary',
};

// 深蹲阶段
export const PHASE = {
  STANDING: 'STANDING', DESCENDING: 'DESCENDING',
  BOTTOM: 'BOTTOM', ASCENDING: 'ASCENDING',
};

// 纠错代码
export const FEEDBACK = {
  NOT_DEEP_ENOUGH: 'not_deep_enough',
  LEANING_FORWARD: 'leaning_forward',
};
```

## 8.2 数据格式

**规则：**缺失用 null，不用 0 冒充。角度用度，时间用毫秒。

| **名称**       | **字段**                                                                                                                          | **谁发 → 谁收**                 |
|----------------|-----------------------------------------------------------------------------------------------------------------------------------|---------------------------------|
| PoseFrame      | timestampMs, landmarks\[33\]{x,y,z,visibility} 或 null, valid, aspectRatio                                                        | P1 → P2、P4                     |
| TrackingLost   | timestampMs, reason                                                                                                               | P1 → P5                         |
| RepEvent       | type, timestampMs, repCount, rom                                                                                                  | P2 → P3、P4、P5                 |
| FormFeedback   | timestampMs, code, message                                                                                                        | P4（经 P2 模块）→ P5            |
| MovementResult | exercise, repCount, reps\[{rom, durationMs, minKneeAngle, maxKneeAngle, samples}\], baselineROM, averageROM, trackingQuality      | P2 → P3（随 session_completed） |
| SessionSummary | sessionId, date, qualityScore, averageROM, completedReps, trackingQuality, scoreBreakdown{range, smoothness, consistency}, isMock | P3 → P4、P5                     |

**PoseFrame（P1）：**
- `landmarks` 永远是 33 项；画面里没人时每项都是 null。先判断 `valid`，false 时不要算角度、不要计数。
- `aspectRatio` = 视频宽 ÷ 高（640×480 为 4/3），尺寸未知时为 null。MediaPipe 的 x、y 分别按宽、高缩放，**算角度时 x 要乘以它**，不然 4:3 画面的膝角会偏大约 7–13°。`angles.js` 的函数第二个参数就是它。
- `timestampMs` 来自 `performance.now()`，单调递增，不是日历时间。
- 坐标来自未镜像的原始视频，镜像只在显示时做。

**TrackingLost（P1）：**进入无效状态时发一次。`reason` 为 `no_person`、`incomplete_landmarks`、`low_visibility`、`out_of_frame`、`video_stalled`、`detection_error`。没有单独的"恢复"事件，之后 `pose_frame.valid === true` 就是恢复了。

**MovementResult（P2）：**`stopMovement()` 的返回值，也是 `session_completed` 的内容。例子见 `mock/session_completed_example.json`。
- `repCount`：有效次数（注意 P2 这里叫 `repCount`，P3 的 SessionSummary 里叫 `completedReps`）
- `reps`：每次有效深蹲一项。没蹲到底、太快、中途丢失追踪的不在里面；一次都没有时为 `[]`
  - `rom` = 下蹲前站立时的最大膝角 − 这次的最低膝角（平滑后），保留 1 位小数
  - `durationMs` = 从膝角跌破 160° 到回到 160° 以上
  - `samples: [{ timestampMs, kneeAngleDeg }]`：这次动作的逐帧平滑膝角，时间严格递增，给 P3 算平稳度。真人约 66 帧/秒，一次训练几十 KB，**存历史记录时不要存 samples**
- `baselineROM`：P2 固定为 null，由 P3 计算（见下）
- `averageROM`：reps 里 rom 的平均值；一次都没有时为 null
- `trackingQuality`：能用的帧占收到的帧的比例（0–1）；一帧都没有时为 null

> **ROM 只有这一个来源。**结果页、评分、趋势图都用 session_completed 里的 `rom` / `averageROM`，不要自己另算。原计划中的 movement/metrics.js 和计数器重复，已删除。

**baselineROM（P3）：**用最早三次有效历史训练的 averageROM 平均值，不包括本次；不足三次就用已有的；一次都没有为 null。存储键 `rehab_sessions_v2`（v1 是加 aspectRatio 之前的数据，ROM 偏小，不再使用）。

## 8.3 各模块变量名

| **模块**            | **变量名**                                                                                                                                    |
|---------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| 1 姿态              | videoEl、canvasEl、poseLandmarker、isTracking、lastVideoTime、MIN_VISIBILITY = 0.5                                                            |
| 2 分析              | kneeAngleDeg、trunkLeanDeg、smoothedAngle、squatPhase、repCount、currentRep、minKneeAngle、romDeg、repDurationMs                              |
| 2 计数阈值（movement/config.js） | STAND_ANGLE = 160、BOTTOM_ENTER_ANGLE = 133、BOTTOM_EXIT_ANGLE = 143、MIN_REP_DURATION_MS = 800、SMOOTHING_ALPHA = 0.3、TRACKING_GAP_MS = 1500 |
| 2 纠错阈值（movement/feedbackConfig.js） | DESCENT_START_ANGLE = 150、MAX_TRUNK_LEAN_DEG = 45、FEEDBACK_COOLDOWN_MS = 2000、SMOOTHING_ALPHA = 0.3 |
| 3 数据              | sessions、baselineROM、averageROM、rangeScore、smoothnessScore、consistencyScore、qualityScore、STORAGE_KEY = 'rehab_sessions_v2'             |
| 4 剧情              | episodeIndex、chestsOpened、characterState、narrationLines、animationQueue、replayFrames                                                      |
| 5 页面              | currentPage、useMock、sessionStatus、latestFeedback                                                                                           |

**计数阈值说明：**
- 原文档的 `BOTTOM_ANGLE = 100` 拆成了进入 133°、离开 143°（相差 10°，防止在临界值附近抖动）。100° 是按合成数据定的，真人在 45° 侧前方的镜头里膝角最低只到约 110–135°，用 100° 一次都计不上。
- 133° 是按 P1 的真人录制调的：正常 5 次计 4 次（第一次只蹲到 135°），浅蹲 0 次，底部停顿 2 次。浅蹲最浅约 144°，余量不大，需要更多人的数据再调（见第 12 节）。
- `TRACKING_GAP_MS`：丢失追踪超过 1.5 秒，放弃正在做的这一次，恢复后要先站直才继续计数，防止出框回来多算。

**P2 对外接口（movement/movementModule.js）：**
- `startMovement()` / `stopMovement()`：开始 / 结束一次训练，同时开关 P4 的纠错
- `getMovementState()`：当前 `{ phase, repCount, kneeAngleDeg, smoothedAngle, waitingForStand }`，不在训练时为 null。页面可以用 `waitingForStand` 提示"请先站直"。按动画帧读取，不要放进每帧更新的 React state

阈值都是起始值，必须用真人录制和真人测试来调。

# 9. 检查点清单

## 0:30 准备完成

> ☐ 仓库在 GitHub 上，五人都能 clone 和 push
>
> ☐ 每人 npm run dev 能打开页面
>
> ☐ contracts.js 和 eventBus.js 已推送
>
> ☐ 摄像头角度已统一

## 3:00

> ☐ 骨架跟着人动
>
> ☐ squat_recording.json 已推送
>
> ☐ 合成数据能正确计数

## 7:00 第一阶段完成

> ☐ 真人深蹲，屏幕实时计数正确
>
> ☐ 蹲不够深、上身前倾会出提示
>
> ☐ 结束后结果页显示分数
>
> ☐ 出框时有提示，不误计数

## 16:00 功能冻结

> ☐ 每蹲一次开一个宝箱
>
> ☐ 结束后播放本集剧情
>
> ☐ 网址可访问，HTTPS 下摄像头可用
>
> ☐ 完整流程走通 3 次不出错

## 演示前测试

> ☐ 摄像头被拒绝时有提示，不白屏
>
> ☐ 最低点停顿不重复计数
>
> ☐ 只蹲不站不算一次
>
> ☐ 提示不刷屏
>
> ☐ 断网时剧情和报告正常
>
> ☐ localStorage 清空后页面正常
>
> ☐ 备用演示视频已录好
>
> ☐ 模拟数据已标注

# 10. 演示脚本与评委问答

## 3 分钟脚本

| **时间**  | **内容**                                 | **谁**         |
|-----------|------------------------------------------|----------------|
| 0:00–0:30 | 问题：居家康复缺少反馈，更缺少坚持的动力 | P3             |
| 0:30–1:15 | 现场深蹲：骨架、计数，故意蹲浅触发纠错   | P2 做，P4 操作 |
| 1:15–2:00 | 剧情：每蹲一次开宝箱；角色重演刚才的动作 | P4 操作        |
| 2:00–2:35 | 报告：评分拆解、ROM、趋势（标注模拟）    | P3             |
| 2:35–3:00 | 创新点总结 + 下一步计划                  | P3             |

## 评委可能问的问题

| **问题**                     | **建议回答**                                                                                   |
|------------------------------|------------------------------------------------------------------------------------------------|
| 准确度怎么验证？             | 用录制数据和多名队友测试，标准深蹲计数准确率约 X%（现场填实测数字）。下一步和量角器测量对比。  |
| 真有病人用过吗？             | 还没有，这是原型。下一步计划和康复师合作做小规模测试。                                         |
| 和 Keep、Kemtai 有什么区别？ | 它们要么只有纠错，要么只有激励。我们把康复指标和由用户真实动作驱动的剧情结合，主角是用户自己。 |
| 隐私怎么保证？               | 视频全程在浏览器本地处理，不上传。LLM 只收到次数和分数这类汇总数据。                           |
| 评分公式有依据吗？           | 权重是工程假设，界面上已标注。正式使用需要康复专业人员参与校准。                               |

# 11. 出问题怎么办

| **情况**               | **怎么办**                                            |
|------------------------|-------------------------------------------------------|
| 7h 检查点没达到        | 全员暂停手上工作，先帮 B 组把计数做通                 |
| MediaPipe 加载慢或失败 | 模型和 WASM 已经放在项目里本地加载（src/pose/models/），不依赖 CDN；仍失败看浏览器控制台报错 |
| 计数一直不准           | 打开 P2 测试页（第 12 节）：先看骨架是不是绿色、摄像头角度对不对；再看膝角曲线最低点有没有穿过 133° 线；最后才调阈值 |
| 合并冲突               | 找 P5，不要自己删别人代码                             |
| 回放做不完             | 16h 时放弃，只保留宝箱动画，不影响主流程              |
| LLM 不可用             | 直接用本地模板，演示不受影响                          |
| 现场摄像头或网络出问题 | 立刻播放备用视频，不要现场调试                        |
| 有人卡住超过 30 分钟   | 在群里喊人，不要硬扛                                  |

> **最重要的三件事：**2:30 前推送录制文件；7 小时检查点必须达成；16 小时后不加新功能。

# 12. 测试与调试页面

## 12.1 自动测试（不用摄像头）

在仓库根目录运行。改了计数、阈值、纠错或姿态代码后，提交前全部跑一遍：

| **命令**                              | **测什么**                                   | **当前结果** |
|---------------------------------------|----------------------------------------------|--------------|
| node tests/repCounter.test.js         | 计数器 × 7 份合成数据                        | 7/7          |
| node tests/realRecordings.test.js     | 计数器 × 4 段 P1 真人录制                    | 4/4          |
| node tests/movementModule.test.js     | 事件、session_completed 格式、samples、纠错  | 全部通过     |
| node tests/angles.test.js             | 角度计算（P4）                               | 全部通过     |
| node --test src/pose/p1.test.js       | 摄像头、识别、录制（P1）                     | 10/10        |
| npm run lint                          | 代码检查                                     | 通过         |
| npm run build                         | 打包                                         | 通过         |

真人录制测试的期望值是按当前阈值定的。调阈值后如果某项从"少算"变成"正确"（比如正常 5 次从 4 变成 5），说明变好了，把测试里的期望值改掉即可。

## 12.2 调试页面（要摄像头）

先运行 `npm run dev`，再打开：

| **地址**                                    | **谁做** | **用途**                                                       |
|---------------------------------------------|----------|----------------------------------------------------------------|
| localhost:5173/                             | P5       | 正式网站                                                       |
| localhost:5173/src/movement/debug.html      | P2       | 计数实时测试：骨架、膝角曲线和阈值线、阶段、准确率、录制       |
| localhost:5173/src/pose/debug.html          | P1       | 摄像头和关键点调试、按场景录制                                 |

调试页面只在开发时用，打包上线时不包含，用户看不到。两个页面和正式网站用的是同一套计数代码，测出的准确率就是正式网站的准确率。

## 12.3 调参流程

1. 在 P2 测试页填测试人名字，点"开始录制"，蹲 10 次，点"停止并下载"。在"实际做了"里填 10，记下准确率。
2. 把下载的 `p2_*.json` 放进 mock/，运行 `node tests/analyzeRecordings.js` 看每份录制的膝角范围、计数和被放弃的原因。
3. 想试新阈值，不用改代码：`node tests/analyzeRecordings.js --enter 136 --exit 146`。
4. 定下新阈值后改 `src/movement/config.js`，跑 12.1 的全部测试，再提交。
5. 把各人的准确率填进第 10 节"准确度怎么验证"的回答里。
