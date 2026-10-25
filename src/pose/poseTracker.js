import { EVENTS } from '../shared/contracts.js'
import { eventBus } from '../shared/eventBus.js'
import { QUALITY } from './config.js'
import { assessPose, copyLandmarks } from './quality.js'

// 实时识别的最高帧率（P5）：限制推理次数，不限的话电脑太卡、跑不动。默认就限，所有页面都受保护。
// 计数按时间平滑，15 帧/秒不影响次数和 ROM（见 tests/robustness.test.js）。只有模拟高帧率的单元测试才传 maxFps: Infinity。
export const MAX_LIVE_FPS = 15

export function createPoseTracker(videoEl, {
  bus = eventBus,
  quality = QUALITY,
  modelAssetPath,
  maxFps = MAX_LIVE_FPS,
  // 注入点用于无摄像头的生命周期测试，不生成假真人数据。
  createModel = async () => (await import('./landmarker.js')).createLandmarker(modelAssetPath),
  onError = () => {},
} = {}) {
  const minIntervalMs = maxFps > 0 && Number.isFinite(maxFps) ? 1000 / maxFps : 0
  let poseLandmarker = null
  let pending = null
  let generation = 0
  let loopId = null
  let isTracking = false
  let manualMode = false      // 手动模式（P5 离线分析上传视频）：不自动循环，由 analyzeFrame 逐帧调用
  let lastVideoTime = -1
  let lastTimestampMs = -1
  let lastFreshAt = 0
  let lastStaleAt = 0
  let lastInferenceAt = -Infinity
  let lost = false

  // 视频宽 ÷ 高。x、y 分别按宽、高归一化，算角度时要用它把 x 换回同一尺度；尺寸未知时为 null。
  function currentAspectRatio() {
    const { videoWidth: w, videoHeight: h } = videoEl
    return w > 0 && h > 0 ? w / h : null
  }

  function publish(detected, timestampMs, reasonOverride, worldDetected) {
    const result = assessPose(detected, quality)
    const reason = reasonOverride || result.reason
    const frame = {
      timestampMs,
      landmarks: result.landmarks,
      valid: result.valid && !reasonOverride,
      aspectRatio: currentAspectRatio(),
      // 世界坐标以米为单位，不能把归一化图像 z 当作它。
      worldLandmarks: copyLandmarks(worldDetected),
    }
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
    manualMode = false
    if (loopId !== null) cancelAnimationFrame(loopId)
    loopId = null
    const model = poseLandmarker
    poseLandmarker = null
    model?.close()
  }

  // 手动分析当前视频画面一帧（P5 离线分析）。调用方先把视频 seek 到要分析的位置。
  // timestampMs 由调用方给（例如 开始时间 + 视频时间），仍保证严格递增。成功返回 true。
  function analyzeFrame(timestampMs) {
    if (!isTracking || !poseLandmarker || videoEl.readyState < 2) return false
    const timestamp = nextTimestamp(timestampMs)
    try {
      const result = poseLandmarker.detectForVideo(videoEl, timestamp)
      lastVideoTime = videoEl.currentTime
      lastFreshAt = performance.now()
      publish(result.landmarks?.[0], timestamp, null, result.worldLandmarks?.[0])
      return true
    } catch (error) {
      stop()
      publish(null, nextTimestamp(performance.now()), 'detection_error')
      onError(error)
      return false
    }
  }

  function tick() {
    loopId = null
    if (!isTracking || manualMode) return
    const now = performance.now()
    try {
      if (!videoEl.paused && !videoEl.ended && videoEl.readyState >= 2 && videoEl.currentTime !== lastVideoTime) {
        lastFreshAt = now
        if (now - lastInferenceAt >= minIntervalMs) {
          lastInferenceAt = now
          lastVideoTime = videoEl.currentTime
          const timestampMs = nextTimestamp(now)
          const result = poseLandmarker.detectForVideo(videoEl, timestampMs)
          publish(result.landmarks?.[0], timestampMs, null, result.worldLandmarks?.[0])
        }
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

  /**
   * @param {object} [options]
   * @param {boolean} [options.manual=false]  true = 不自动循环，用 analyzeFrame 逐帧分析（离线视频）
   */
  function start({ manual = false } = {}) {
    if (pending) return pending
    if (isTracking) return Promise.resolve(true)
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
        manualMode = manual
        lastVideoTime = -1
        lastInferenceAt = -Infinity
        // 不重置 lastTimestampMs：同一个 tracker 停止后再启动，时间戳仍要递增
        lastFreshAt = performance.now()
        lastStaleAt = lastFreshAt
        lost = false
        isTracking = true
        if (!manualMode) loopId = requestAnimationFrame(tick)
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

  return { start, stop, analyzeFrame, get isTracking() { return isTracking } }
}
