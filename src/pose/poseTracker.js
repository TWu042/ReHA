import { EVENTS } from '../shared/contracts.js'
import { eventBus } from '../shared/eventBus.js'
import { QUALITY } from './config.js'
import { assessPose } from './quality.js'

const MAX_LIVE_FPS = 15
const MIN_LIVE_INTERVAL_MS = 1000 / MAX_LIVE_FPS

export function createPoseTracker(videoEl, {
  bus = eventBus,
  quality = QUALITY,
  modelAssetPath,
  createModel = async () =>
    (await import('./landmarker.js')).createLandmarker(modelAssetPath),
  onError = () => {},
} = {}) {
  let poseLandmarker = null
  let pending = null
  let generation = 0
  let loopId = null
  let isTracking = false
  let manualMode = false

  let lastVideoTime = -1
  let lastTimestampMs = -1
  let lastFreshAt = 0
  let lastStaleAt = 0
  let lastInferenceAt = -Infinity
  let lost = false

  function currentAspectRatio() {
    const {
      videoWidth: w,
      videoHeight: h,
    } = videoEl

    return w > 0 && h > 0 ? w / h : null
  }

  function publish(detected, timestampMs, reasonOverride) {
    const result = assessPose(detected, quality)
    const reason = reasonOverride || result.reason

    const frame = {
      timestampMs,
      landmarks: result.landmarks,
      valid: result.valid && !reasonOverride,
      aspectRatio: currentAspectRatio(),
    }

    bus.emit(EVENTS.POSE_FRAME, frame)

    if (!frame.valid && !lost) {
      lost = true

      bus.emit(EVENTS.TRACKING_LOST, {
        timestampMs,
        reason,
      })
    } else if (frame.valid) {
      lost = false
    }
  }

  function nextTimestamp(now) {
    lastTimestampMs = Math.max(
      now,
      lastTimestampMs + 0.001
    )

    return lastTimestampMs
  }

  function stop() {
    generation++
    isTracking = false
    manualMode = false

    if (loopId !== null) {
      cancelAnimationFrame(loopId)
    }

    loopId = null

    const model = poseLandmarker
    poseLandmarker = null

    model?.close()
  }

  function analyzeFrame(timestampMs) {
    if (!isTracking || !poseLandmarker) {
      return false
    }

    if (videoEl.readyState < 2) {
      return false
    }

    const timestamp = nextTimestamp(timestampMs)

    try {
      const result = poseLandmarker.detectForVideo(
        videoEl,
        timestamp
      )

      lastVideoTime = videoEl.currentTime
      lastFreshAt = performance.now()

      publish(result.landmarks?.[0], timestamp)

      return true
    } catch (error) {
      stop()

      publish(
        null,
        nextTimestamp(performance.now()),
        'detection_error'
      )

      onError(error)

      return false
    }
  }

  function tick() {
    loopId = null

    if (!isTracking || manualMode) return

    const now = performance.now()

    try {
      const videoReady =
        !videoEl.paused &&
        !videoEl.ended &&
        videoEl.readyState >= 2

      const newFrame =
        videoEl.currentTime !== lastVideoTime

      if (videoReady && newFrame) {
        lastFreshAt = now

        if (
          now - lastInferenceAt >=
          MIN_LIVE_INTERVAL_MS
        ) {
          lastInferenceAt = now
          lastVideoTime = videoEl.currentTime

          const timestampMs = nextTimestamp(now)

          const result = poseLandmarker.detectForVideo(
            videoEl,
            timestampMs
          )

          publish(result.landmarks?.[0], timestampMs)
        }
      } else if (
        now - lastFreshAt >= quality.staleAfterMs &&
        now - lastStaleAt >= quality.staleAfterMs
      ) {
        lastStaleAt = now

        publish(
          null,
          nextTimestamp(now),
          'video_stalled'
        )
      }
    } catch (error) {
      stop()

      publish(
        null,
        nextTimestamp(now),
        'detection_error'
      )

      onError(error)
      return
    }

    if (isTracking) {
      loopId = requestAnimationFrame(tick)
    }
  }

  function start(options = {}) {
    if (pending) return pending
    if (isTracking) return Promise.resolve(true)

    const token = ++generation
    const useManualMode = options.manual === true

    pending = (async () => {
      let model

      try {
        model = await createModel()

        if (token !== generation) {
          model.close()
          return false
        }

        poseLandmarker = model
        manualMode = useManualMode

        lastVideoTime = -1
        lastTimestampMs = -1
        lastInferenceAt = -Infinity

        lastFreshAt = performance.now()
        lastStaleAt = lastFreshAt

        lost = false
        isTracking = true

        if (!manualMode) {
          loopId = requestAnimationFrame(tick)
        }

        return true
      } catch (cause) {
        if (poseLandmarker === model) {
          poseLandmarker = null
        }

        model?.close()

        throw new Error(
          '姿态模型初始化失败，请检查模型地址、网络及浏览器 WASM 支持。',
          { cause }
        )
      } finally {
        pending = null
      }
    })()

    return pending
  }

  return {
    start,
    stop,
    analyzeFrame,

    get isTracking() {
      return isTracking
    },
  }
}
