import { EVENTS } from '../shared/contracts.js'
import { eventBus } from '../shared/eventBus.js'
import { QUALITY } from './config.js'
import { assessPose } from './quality.js'

export function createPoseTracker(videoEl, {
  bus = eventBus,
  quality = QUALITY,
  modelAssetPath,
  // 注入点用于无摄像头的生命周期测试，不生成假真人数据。
  createModel = async () => (await import('./landmarker.js')).createLandmarker(modelAssetPath),
  onError = () => {},
} = {}) {
  let poseLandmarker = null
  let pending = null
  let generation = 0
  let loopId = null
  let isTracking = false
  let lastVideoTime = -1
  let lastTimestampMs = -1
  let lastFreshAt = 0
  let lastStaleAt = 0
  let lost = false

  function publish(detected, timestampMs, reasonOverride) {
    const result = assessPose(detected, quality)
    const reason = reasonOverride || result.reason
    const frame = { timestampMs, landmarks: result.landmarks, valid: result.valid && !reasonOverride }
    bus.emit(EVENTS.POSE_FRAME, frame)
    if (!frame.valid && !lost) {
      lost = true
      // 契约仅定义事件名；P1 建议的最小载荷见 README。
      bus.emit(EVENTS.TRACKING_LOST, { timestampMs, reason })
    } else if (frame.valid) lost = false
  }

  function nextTimestamp(now) {
    lastTimestampMs = Math.max(now, lastTimestampMs + 0.001)
    return lastTimestampMs
  }

  function stop() {
    generation++
    isTracking = false
    if (loopId !== null) cancelAnimationFrame(loopId)
    loopId = null
    const model = poseLandmarker
    poseLandmarker = null
    model?.close()
  }

  function tick() {
    loopId = null
    if (!isTracking) return
    const now = performance.now()
    try {
      if (!videoEl.paused && !videoEl.ended && videoEl.readyState >= 2 && videoEl.currentTime !== lastVideoTime) {
        lastVideoTime = videoEl.currentTime
        lastFreshAt = now
        const timestampMs = nextTimestamp(now)
        const result = poseLandmarker.detectForVideo(videoEl, timestampMs)
        publish(result.landmarks?.[0], timestampMs)
      } else if (now - lastFreshAt >= quality.staleAfterMs && now - lastStaleAt >= quality.staleAfterMs) {
        // 冻结/断开的摄像头不能让消费者一直使用最后一个有效姿态。
        lastStaleAt = now
        publish(null, nextTimestamp(now), 'video_stalled')
      }
    } catch (error) {
      stop()
      publish(null, nextTimestamp(now), 'detection_error')
      onError(error)
      return
    }
    if (isTracking) loopId = requestAnimationFrame(tick)
  }

  function start() {
    if (pending) return pending
    if (isTracking) return Promise.resolve()
    const token = ++generation
    pending = (async () => {
      let model
      try {
        model = await createModel()
        if (token !== generation) {
          model.close()
          return false
        }
        poseLandmarker = model
        lastVideoTime = -1
        lastFreshAt = performance.now()
        lastStaleAt = lastFreshAt
        lost = false
        isTracking = true
        loopId = requestAnimationFrame(tick)
        return true
      } catch (cause) {
        if (poseLandmarker === model) poseLandmarker = null
        model?.close()
        throw new Error('姿态模型初始化失败，请检查模型地址、网络及浏览器 WASM 支持。', { cause })
      } finally {
        pending = null
      }
    })()
    return pending
  }

  return { start, stop, get isTracking() { return isTracking } }
}
