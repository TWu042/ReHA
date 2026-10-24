import { createCamera } from './camera.js'
import { createPoseTracker } from './poseTracker.js'
import { createRecorder } from './recorder.js'
import { eventBus } from '../shared/eventBus.js'
import { EVENTS, LM } from '../shared/contracts.js'

const videoEl = document.querySelector('#video')
const status = document.querySelector('#status')
const data = document.querySelector('#data')
const startButton = document.querySelector('#start')
const camera = createCamera(videoEl)
const recorder = createRecorder()
let request = 0
let latestFrame = null
let lastLost = null

function stop() {
  request++
  recorder.stop()
  tracker.stop()
  camera.stop()
  startButton.disabled = false
}

const tracker = createPoseTracker(videoEl, {
  onError(error) {
    stop()
    status.textContent = `检测已停止：${error.message}`
  },
})

startButton.onclick = async () => {
  const token = ++request
  startButton.disabled = true
  status.textContent = '正在启动摄像头和加载模型……'
  try {
    await camera.start()
    if (token !== request) return
    await tracker.start()
    if (token !== request) return
    status.textContent = '识别已启动，请查看 valid 和关键点数据。'
  } catch (error) {
    if (token !== request) return
    stop()
    status.textContent = error.message
  } finally {
    if (token === request) startButton.disabled = false
  }
}

document.querySelector('#stop').onclick = () => {
  stop()
  status.textContent = '摄像头、模型与录制已停止，录制数据仍可导出。'
}

function action(fn) {
  try { fn() } catch (error) { status.textContent = error.message }
}

document.querySelector('#record').onclick = () => action(() => {
  if (!tracker.isTracking) throw new Error('请先启动摄像头与识别。')
  recorder.start()
  status.textContent = '录制中。完成所选动作后点击“停止录制”。'
})
document.querySelector('#finish').onclick = () => {
  recorder.stop()
  status.textContent = `已停止录制，共 ${recorder.frameCount} 帧。请导出后再清空。`
}
document.querySelector('#clear').onclick = () => action(() => {
  recorder.clear()
  status.textContent = '录制已清空，可以录制下一组。'
})
document.querySelector('#export').onclick = () => action(() => {
  if (recorder.isRecording) throw new Error('请先停止录制再导出。')
  if (!recorder.frameCount) throw new Error('尚无录制数据。')
  const scenario = document.querySelector('#scenario').value
  const stamp = new Date().toISOString().replaceAll(':', '-')
  recorder.download(`p1_${scenario}_${stamp}.json`)
})

const offFrame = eventBus.on(EVENTS.POSE_FRAME, frame => { latestFrame = frame })
const offLost = eventBus.on(EVENTS.TRACKING_LOST, payload => { lastLost = payload })
// 原始帧不进 React state；调试文字每秒最多更新四次。
const displayTimer = setInterval(() => {
  if (!latestFrame) return
  data.textContent = JSON.stringify({
    timestampMs: latestFrame.timestampMs,
    valid: latestFrame.valid,
    landmarksLength: latestFrame.landmarks.length,
    recording: recorder.isRecording,
    recordedFrames: recorder.frameCount,
    lastTrackingLost: lastLost,
    requiredLandmarks: Object.fromEntries(Object.entries(LM).map(([name, i]) => [name, latestFrame.landmarks[i]])),
  }, null, 2)
}, 250)

function dispose() {
  stop()
  offFrame()
  offLost()
  clearInterval(displayTimer)
}
window.addEventListener('pagehide', dispose, { once: true })
if (import.meta.hot) import.meta.hot.dispose(dispose)
