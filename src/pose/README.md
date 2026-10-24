# P1 第一阶段

最新三维扩展、弯腰反馈和判定条件见 [THREE_DIMENSIONAL.md](THREE_DIMENSIONAL.md)。该说明取代下文原先“双侧都必须可见”的要求：现在至少一侧完整可靠即可。新帧增加 worldLandmarks，旧录制仍兼容。

只处理摄像头、单人关键点、跟踪质量与 JSON 录制。没有计数、评分或动作纠错。未修改 P5 页面、骨架绘制或 P4 场景，未实现第二阶段 replay。

## 运行与真人验证

在仓库根目录 `ReHA` 执行 `npm ci`（首次），再执行 `npm run dev`。如终端找不到 npm，先执行 `source ~/.nvm/nvm.sh`。
打开终端显示的 localhost 地址，在后面加 `/src/pose/debug.html`，例如 `http://localhost:5173/src/pose/debug.html`。
这是独立开发调试入口，主应用保持原样；生产部署入口由 P5 决定。

1. 点击启动并允许摄像头。预期出现视频，数据中 landmarksLength 为 33。模型和 WASM 从项目本地加载，视频不会上传。
2. 让肩、髋、膝、踝都在画面中且有足够光照，预期 valid 为 true。观察各坐标随动作变化。本入口没有骨架绘制。
3. 选择一组动作 → 开始录制 → 完成动作 → 停止录制 → 导出 JSON。查看帧数，确认首帧 timestampMs 为 0，后续递增。
4. 导出后清空，依次真人录制正常深蹲 5 次、浅蹲 3 次、底部停 2 秒再站起 2 次。文件下载到浏览器下载目录，请手动放入 `mock/`，保留 `p1_` 前缀。未生成或声称已有真人录制。
5. 另录一段出框、遮挡、重新入框。预期无效帧仍被录制；无人时是 33 个 null；重新入框后 valid 恢复。lastTrackingLost 时间应在连续丢失期间保持不变，恢复后再次丢失才更新。
6. 点击停止，确认浏览器摄像头指示灯熄灭。测试拒绝权限、摄像头占用、加载模型时立即停止、反复启动停止、拔掉摄像头。模型加载失败应显示错误并释放摄像头。

上述涉及摄像头的结果需要真人验证，不能由无摄像头测试证明。调试页不自动判断深蹲次数。

## 给 P2、P4、P5 的数据约定建议

`contracts.js` 目前只有事件名与 LM 编号，没有数据类型或 tracking_lost 载荷。附带流程文档要求缺失值为 null。建议队友确认以下最小补充（本次没有改公共文件）：

```js
// pose_frame
{ timestampMs, landmarks, valid, aspectRatio }
// landmarks 永远长度 33；每项为 { x, y, z, visibility } 或 null。
// aspectRatio 为视频宽 ÷ 高（如 640×480 为 4/3），视频尺寸未知时为 null。算角度时 x 要乘以它。
// valid 为 true 时全部 33 点均完整，必要点质量达标。
// tracking_lost：进入无效状态时触发一次，包括启动后首次检测无效
{ timestampMs, reason }
```

消费者必须先判断 `valid`；false 时不得计算角度或累计次数。无人体不可能输出 33 个真实坐标，因此使用 33 个 null 兼容固定数组长度；低可见度/出框时保留该帧真实检测点但标记无效。没有沿用上一帧、填 0 或平滑伪装有效。

`reason` 为 no_person、incomplete_landmarks、low_visibility、out_of_frame、video_stalled 或 detection_error。无独立恢复事件，后续 `pose_frame.valid === true` 即恢复。P5 应监听一个提示来源，避免 P2 再次发同名丢失提示造成重复。

坐标来自未镜像的原始视频：x 向右、y 向下，按图像宽高归一化；z 以髋部中点为原点，较小表示更靠近摄像头，尺度约与 x 相同，不是米；visibility 为模型可见度置信值。需要镜像时只镜像显示，数据不变。

实时 timestampMs 使用 performance.now() 的单调时钟（页面时间原点，非 Date.now 的日历时间），并保证同一 tracker 跨停止重启仍递增。只检测新的视频 currentTime；视频冻结超过 1 秒，每秒记录一个无效采样，防止最后的有效姿态一直留存。后台页面可能暂停 requestAnimationFrame，恢复后的时间间隔保留，不补造检测帧。

录制从首个收到的帧减去时间原点，首帧为 0，保留帧间隔、无效帧及中断间隔，不压缩时间。每份新录制前须清空，避免误覆盖。开始录制到首帧前的等待不计入数据。

导出为直接的帧数组 `[{ timestampMs, landmarks, valid }, ...]`，匹配附带流程文档 `playRecording(frames)` 示例。仓库尚无 mockPlayer，不能声称已与真实实现联调。没有自动写入 mock 文件或伪造真人录制。

阈值集中在 `config.js`，全部为工程初始值。当前要求双侧肩髋膝踝 visibility >= 0.5，距图像边界至少 2%；侧面遮挡可能导致无效，需要实际测量后与 P2 商定阈值。其余点也须有有限数值。检测置信阈值 0.5 在 `landmarker.js`。

## P5 最小接入

```js
import { createCamera } from './pose/camera.js'
import { createPoseTracker } from './pose/poseTracker.js'
import { createRecorder } from './pose/recorder.js'

const camera = createCamera(videoEl)
const recorder = createRecorder()
const tracker = createPoseTracker(videoEl, {
  onError(error) {
    recorder.stop()
    camera.stop()
    showError(error.message) // P5 页面方法
  },
})

try {
  await camera.start()
  await tracker.start()
} catch (error) {
  tracker.stop()
  camera.stop()
  showError(error.message)
}
// 用户点击录制：recorder.start()
// 点击结束：recorder.stop(); recorder.download('p1_normal_5.json')
// 页面卸载/结束会话：recorder.stop(); tracker.stop(); camera.stop()
```

组件需要保存这些实例在 ref，并在异步启动期间禁止重复点击；卸载时 stop 能取消尚在等待的启动（权限弹窗本身由浏览器管理，晚到的流/模型会被立即释放）。stop 是幂等的；停止后再次启动需等待上一次启动 promise 结束。

## 模型与构建

JS 与 WASM 直接使用 package-lock 中的 @mediapipe/tasks-vision 1.1.1，由 Vite 的 `?url` 输出同版本静态资源；同时支持 SIMD 和无 SIMD 路径。无需更改依赖或使用 latest CDN。
默认模型为 Google 的 pose_landmarker_lite / float16 / 1，已下载至 `src/pose/models/pose_landmarker_lite.task`（约 5.8 MB），通过 Vite `?url` 本地加载。CPU、VIDEO、单人模式，无分割掩码。
官方来源：https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task 。模型文件是模型资产，不是真人录制数据。
本地服务器启动后，P1 代码无需外部 CDN。部署时 P5 需要完整上传 Vite 产物中的 WASM、加载器和模型；首次打开远程站点仍需获取站点文件，本次没有增加 Service Worker 离线缓存。
也可传入 `createPoseTracker(videoEl, { modelAssetPath: '/models/pose_landmarker_lite.task' })` 覆盖模型路径。
推理在浏览器主线程同步运行，低端设备可能卡顿；第一阶段先用 lite 和 640×480，性能需真机验证，必要时再单独引入 Worker。

自动检查：`npm run lint`、`npm run build`、`node --test src/pose/p1.test.js`。主应用构建不会自动包含独立调试 HTML，可用以下命令单独验证它的完整依赖打包：

```sh
node --input-type=module -e "import { build } from 'vite'; await build({build:{outDir:'dist/p1',rollupOptions:{input:'src/pose/debug.html'}}})"
```
