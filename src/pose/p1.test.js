import test from 'node:test'
import assert from 'node:assert/strict'
import { createCamera } from './camera.js'
import { createPoseTracker } from './poseTracker.js'
import { createRecorder } from './recorder.js'
import { assessPose } from './quality.js'
import { EVENTS, LM } from '../shared/contracts.js'

// 纯合成单元测试夹具；不是摄像头数据，也不会导出到 mock/。
const points = () => Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: -0.1, visibility: 0.9 }))

function makeBus() {
  const listeners = new Map()
  const events = []
  return {
    events,
    on(type, listener) {
      const group = listeners.get(type) || new Set()
      group.add(listener)
      listeners.set(type, group)
      return () => group.delete(listener)
    },
    emit(type, payload) {
      events.push({ type, payload })
      listeners.get(type)?.forEach(fn => fn(payload))
    },
  }
}

test('质量：无人、缺项、非有限值、低可见度、边界和恢复', () => {
  const missing = assessPose(null)
  assert.equal(missing.valid, false)
  assert.deepEqual(missing.landmarks, Array(33).fill(null))
  assert.equal(assessPose(points().slice(0, 32)).valid, false)
  const partial = points()
  partial[0].z = NaN
  assert.equal(assessPose(partial).landmarks[0], null)
  for (const i of Object.values(LM)) {
    const low = points()
    low[i].visibility = 0.49
    // 一侧不可靠仍可用另一侧；两侧均不可靠才丢失。
    low[i < 12 || i === 23 || i === 25 || i === 27 ? 12 : 11].visibility = 0.1
    assert.equal(assessPose(low).reason, 'low_visibility')
    low[i].visibility = 0.9
    low[i < 12 || i === 23 || i === 25 || i === 27 ? 12 : 11].visibility = 0.9
    low[i].y = 1.1
    low[i < 12 || i === 23 || i === 25 || i === 27 ? 12 : 11].y = 1.1
    assert.equal(assessPose(low).reason, 'out_of_frame')
  }
  assert.equal(assessPose(points()).valid, true)
  const side = points()
  for (const i of [12, 24, 26, 28]) side[i].visibility = 0.1
  assert.equal(assessPose(side).valid, true)
})

test('录制：零起点、无效帧、深拷贝、停止/清空、数组导出与重复启动', () => {
  const bus = makeBus()
  const recorder = createRecorder({ bus })
  recorder.start()
  recorder.start()
  const frame = { timestampMs: 1200, landmarks: points(), valid: true }
  bus.emit(EVENTS.POSE_FRAME, frame)
  frame.landmarks[0].x = 99
  bus.emit(EVENTS.POSE_FRAME, { timestampMs: 1450, landmarks: Array(33).fill(null), valid: false })
  assert.throws(() => recorder.clear(), /先停止/)
  const result = recorder.stop()
  assert.deepEqual(result.map(f => f.timestampMs), [0, 250])
  assert.equal(result[0].landmarks[0].x, 0.5)
  assert.equal(result[1].valid, false)
  result[0].landmarks[0].x = 12
  assert.equal(JSON.parse(recorder.exportJSON())[0].landmarks[0].x, 0.5)
  bus.emit(EVENTS.POSE_FRAME, frame)
  assert.equal(recorder.frameCount, 2)
  assert.throws(() => recorder.start(), /已有录制/)
  recorder.clear()
  recorder.start()
  bus.emit(EVENTS.POSE_FRAME, { timestampMs: 2000, landmarks: [], valid: false })
  assert.throws(() => bus.emit(EVENTS.POSE_FRAME, { timestampMs: 1999 }), /非单调/)
  assert.equal(recorder.frameCount, 1)
  recorder.stop()
})

function harness(t) {
  let clock = 100
  let serial = 0
  const callbacks = new Map()
  t.mock.method(globalThis, 'requestAnimationFrame', fn => {
    callbacks.set(++serial, fn)
    return serial
  })
  t.mock.method(globalThis, 'cancelAnimationFrame', id => callbacks.delete(id))
  t.mock.method(performance, 'now', () => clock)
  const video = { paused: false, ended: false, readyState: 2, currentTime: 0 }
  const bus = makeBus()
  let detected = points()
  const model = {
    close: t.mock.fn(),
    detectForVideo: t.mock.fn(() => ({ landmarks: detected ? [detected] : [] })),
  }
  const createModel = t.mock.fn(async () => model)
  const tracker = createPoseTracker(video, { bus, createModel })
  function step(delta = 33, fresh = true) {
    clock += delta
    if (fresh) video.currentTime += delta / 1000
    const pending = [...callbacks.values()]
    callbacks.clear()
    pending.forEach(fn => fn(clock))
  }
  t.after(() => tracker.stop())
  return { tracker, video, bus, model, createModel, step, callbacks, setDetected(value) { detected = value } }
}

// Node 没有 RAF；先定义可 mock 的浏览器接口。
globalThis.requestAnimationFrame = () => 0
globalThis.cancelAnimationFrame = () => {}
Object.defineProperty(navigator, 'mediaDevices', { value: null, configurable: true, writable: true })

test('检测：单一循环、跳过重复视频帧、丢失去重、恢复和重启单调', async t => {
  const h = harness(t)
  await Promise.all([h.tracker.start(), h.tracker.start()])
  assert.equal(h.createModel.mock.callCount(), 1)
  assert.equal(h.callbacks.size, 1)
  h.step()
  h.step(33, false)
  assert.equal(h.model.detectForVideo.mock.callCount(), 1)
  h.setDetected(null)
  h.step()
  h.step()
  assert.equal(h.bus.events.filter(e => e.type === EVENTS.TRACKING_LOST).length, 1)
  h.setDetected(points())
  h.step()
  h.setDetected(null)
  h.step()
  assert.equal(h.bus.events.filter(e => e.type === EVENTS.TRACKING_LOST).length, 2)
  const before = h.bus.events.at(-1).payload.timestampMs
  h.tracker.stop()
  h.tracker.stop()
  assert.equal(h.callbacks.size, 0)
  assert.equal(h.model.close.mock.callCount(), 1)
  await h.tracker.start()
  h.step()
  assert.ok(h.bus.events.at(-1).payload.timestampMs > before)
})

test('视频冻结发布无效帧，不拿上一次坐标冒充有效检测', async t => {
  const h = harness(t)
  await h.tracker.start()
  h.step()
  h.step(1100, false)
  const frames = h.bus.events.filter(e => e.type === EVENTS.POSE_FRAME)
  assert.equal(frames.at(-1).payload.valid, false)
  assert.deepEqual(frames.at(-1).payload.landmarks, Array(33).fill(null))
  assert.equal(h.model.detectForVideo.mock.callCount(), 1)
  h.step()
  assert.equal(h.bus.events.filter(e => e.type === EVENTS.POSE_FRAME).at(-1).payload.valid, true)
})

test('三维关键点逐帧复制并随录制导出，冻结帧不沿用三维数据', async t => {
  const h = harness(t)
  const world = points()
  h.model.detectForVideo.mock.mockImplementation(() => ({ landmarks: [points()], worldLandmarks: [world] }))
  const recorder = createRecorder({ bus: h.bus })
  recorder.start()
  await h.tracker.start()
  h.step()
  const detected = h.bus.events.find(e => e.type === EVENTS.POSE_FRAME).payload
  assert.deepEqual(detected.worldLandmarks, world)
  world[0].x = 99
  assert.equal(detected.worldLandmarks[0].x, 0.5)
  h.step(1100, false)
  const recording = recorder.stop()
  assert.equal(recording[0].timestampMs, 0)
  assert.equal(recording[0].worldLandmarks[0].x, 0.5)
  assert.deepEqual(recording[1].worldLandmarks, Array(33).fill(null))
  assert.equal(JSON.parse(recorder.exportJSON())[0].worldLandmarks[0].x, 0.5)
})

test('pose_frame 带视频宽高比；尺寸未知时为 null', async t => {
  const h = harness(t)
  await h.tracker.start()
  const lastFrame = () => h.bus.events.filter(e => e.type === EVENTS.POSE_FRAME).at(-1).payload
  h.step()
  assert.equal(lastFrame().aspectRatio, null)
  Object.assign(h.video, { videoWidth: 640, videoHeight: 480 })
  h.step()
  assert.equal(lastFrame().aspectRatio, 640 / 480)
  Object.assign(h.video, { videoWidth: 1280, videoHeight: 720 })
  h.step()
  assert.equal(lastFrame().aspectRatio, 1280 / 720)
})

test('初始化期间停止会关闭晚到模型；失败后可重试', async t => {
  const h = harness(t)
  let resolve
  const tracker = createPoseTracker(h.video, { createModel: () => new Promise(done => { resolve = done }) })
  const starting = tracker.start()
  tracker.stop()
  resolve(h.model)
  assert.equal(await starting, false)
  assert.equal(h.model.close.mock.callCount(), 1)
  assert.equal(h.callbacks.size, 0)
  const createModel = t.mock.fn(async () => { throw new Error('network') })
  const retry = createPoseTracker(h.video, { createModel })
  await assert.rejects(retry.start(), /初始化失败/)
  await assert.rejects(retry.start(), /初始化失败/)
  assert.equal(createModel.mock.callCount(), 2)
})

test('检测异常发无效帧并停止循环、关闭模型', async t => {
  const h = harness(t)
  h.model.detectForVideo.mock.mockImplementation(() => { throw new Error('device') })
  const onError = t.mock.fn()
  const tracker = createPoseTracker(h.video, { bus: h.bus, createModel: h.createModel, onError })
  await tracker.start()
  h.step()
  assert.equal(tracker.isTracking, false)
  assert.equal(h.callbacks.size, 0)
  assert.equal(h.model.close.mock.callCount(), 1)
  assert.equal(onError.mock.callCount(), 1)
  assert.equal(h.bus.events[0].payload.valid, false)
})

test('摄像头只请求视频，停止释放全部轨道并清理元素', async t => {
  const tracks = [{ stop: t.mock.fn() }, { stop: t.mock.fn() }]
  const stream = { getTracks: () => tracks }
  const getUserMedia = t.mock.fn(async () => stream)
  navigator.mediaDevices = { getUserMedia }
  t.after(() => { navigator.mediaDevices = null })
  const video = { srcObject: null, play: t.mock.fn(async () => {}), pause: t.mock.fn() }
  const camera = createCamera(video)
  await Promise.all([camera.start(), camera.start()])
  assert.equal(getUserMedia.mock.callCount(), 1)
  assert.equal(getUserMedia.mock.calls[0].arguments[0].audio, false)
  assert.equal(video.srcObject, stream)
  camera.stop()
  camera.stop()
  tracks.forEach(track => assert.equal(track.stop.mock.callCount(), 1))
  assert.equal(video.srcObject, null)
})

test('摄像头权限拒绝、缺失和占用错误可读且允许重试', async t => {
  t.after(() => { navigator.mediaDevices = null })
  for (const [name, message] of [['NotAllowedError', /权限被拒绝/], ['NotFoundError', /没有找到/], ['NotReadableError', /占用/]]) {
    navigator.mediaDevices = { getUserMedia: async () => { throw new DOMException('', name) } }
    const camera = createCamera({ srcObject: null })
    await assert.rejects(camera.start(), message)
    await assert.rejects(camera.start(), message)
  }
})

test('权限尚未返回时停止，会释放晚到的视频流', async t => {
  let resolve
  const track = { stop: t.mock.fn() }
  const stream = { getTracks: () => [track] }
  navigator.mediaDevices = { getUserMedia: () => new Promise(done => { resolve = done }) }
  t.after(() => { navigator.mediaDevices = null })
  const video = { srcObject: null, play: t.mock.fn(), pause: t.mock.fn() }
  const camera = createCamera(video)
  const starting = camera.start()
  await Promise.resolve()
  camera.stop()
  resolve(stream)
  await assert.rejects(starting, /中断/)
  assert.equal(track.stop.mock.callCount(), 1)
  assert.equal(video.srcObject, null)
})
