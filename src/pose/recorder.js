import { EVENTS } from '../shared/contracts.js'
import { eventBus } from '../shared/eventBus.js'

export function createRecorder({ bus = eventBus } = {}) {
  let frames = []
  let unsubscribe = null
  let origin = null
  let previous = -Infinity

  function stop() {
    unsubscribe?.()
    unsubscribe = null
    return getFrames()
  }

  function getFrames() {
    return structuredClone(frames)
  }

  function clear() {
    if (unsubscribe) throw new Error('请先停止录制再清空，避免丢失正在录制的数据。')
    frames = []
    origin = null
    previous = -Infinity
  }

  function start() {
    if (unsubscribe) return
    if (frames.length) throw new Error('已有录制，请先导出并清空，再开始新录制。')
    unsubscribe = bus.on(EVENTS.POSE_FRAME, frame => {
      if (!Number.isFinite(frame.timestampMs) || frame.timestampMs <= previous) {
        throw new Error('收到非单调的 pose_frame 时间戳，录制已拒绝该帧。')
      }
      previous = frame.timestampMs
      origin ??= frame.timestampMs
      frames.push(structuredClone({ ...frame, timestampMs: frame.timestampMs - origin }))
    })
  }

  function exportJSON() {
    // 与流程文档 mockPlayer 的 playRecording(frames) 数组格式一致。
    return JSON.stringify(frames, null, 2)
  }

  function download(filename = 'p1_pose_recording.json') {
    const url = URL.createObjectURL(new Blob([exportJSON()], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return { start, stop, clear, exportJSON, download, getFrames,
    get isRecording() { return unsubscribe !== null },
    get frameCount() { return frames.length },
  }
}
