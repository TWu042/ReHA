import test from 'node:test';
import assert from 'node:assert/strict';
import { getPoseAngles } from '../src/movement/poseAngles.js';
import { createRepCounter } from '../src/movement/repCounter.js';
import { eventBus } from '../src/shared/eventBus.js';
import { EVENTS } from '../src/shared/contracts.js';
import { startFormFeedback, stopFormFeedback } from '../src/movement/formFeedback.js';
import { startMovement, stopMovement } from '../src/movement/movementModule.js';

// 合成几何夹具，只测试算法，不代表真人三维识别的准确率。
function frame(knee, lean, timestampMs, yaw = 0) {
  const rad = value => value * Math.PI / 180;
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  const worldLandmarks = structuredClone(landmarks);
  const rotate = ([x, y, z]) => ({
    x: x * Math.cos(rad(yaw)) + z * Math.sin(rad(yaw)),
    y,
    z: -x * Math.sin(rad(yaw)) + z * Math.cos(rad(yaw)),
    visibility: 0.99,
  });
  for (const [shoulder, hip, kneeIndex, ankle, offset] of [[11, 23, 25, 27, 0], [12, 24, 26, 28, 0.15]]) {
    worldLandmarks[hip] = rotate([offset, 0, 0]);
    worldLandmarks[kneeIndex] = rotate([offset, 0.4, 0]);
    worldLandmarks[ankle] = rotate([offset + 0.4 * Math.sin(rad(knee)), 0.4 - 0.4 * Math.cos(rad(knee)), 0]);
    worldLandmarks[shoulder] = rotate([offset + 0.4 * Math.sin(rad(lean)), -0.4 * Math.cos(rad(lean)), 0]);
  }
  return { timestampMs, landmarks, worldLandmarks, valid: true, aspectRatio: 4 / 3 };
}

test('世界坐标膝角、躯干角在多个水平旋转角度下保持一致', () => {
  for (const yaw of [0, 30, 45, 90, 135, 180]) {
    const angles = getPoseAngles(frame(95, 60, 0, yaw));
    assert.equal(angles.source, '3d');
    assert.ok(Math.abs(angles.kneeAngleDeg - 95) < 1e-8);
    assert.ok(Math.abs(angles.trunkLeanDeg - 60) < 1e-8);
  }
});

test('三维缺失、低置信度、退化骨段不伪造二维回退，另一侧可靠仍可计算', () => {
  const f = frame(90, 0, 0);
  for (const i of [12, 24, 26, 28]) f.worldLandmarks[i].visibility = 0.1;
  assert.ok(Math.abs(getPoseAngles(f).kneeAngleDeg - 90) < 1e-8);
  f.worldLandmarks[25] = null;
  assert.equal(getPoseAngles(f).kneeAngleDeg, null);
  f.worldLandmarks = Array(33).fill(null);
  assert.equal(getPoseAngles(f).source, '3d');
  assert.equal(getPoseAngles(f).kneeAngleDeg, null);
  const degenerate = frame(90, 0, 0);
  degenerate.worldLandmarks = degenerate.worldLandmarks.map(() => ({ x: 0, y: 0, z: 0, visibility: 0.99 }));
  assert.equal(getPoseAngles(degenerate).kneeAngleDeg, null);
});

test('三维完整周期只计一次，底部停顿不重复计数，缺失世界坐标不切到二维', () => {
  for (const yaw of [0, 45, 90]) {
    const counter = createRepCounter();
    let t = 0;
    for (const [knee, count] of [[170, 10], [145, 10], [90, 25], [145, 10], [170, 20]]) {
      for (let i = 0; i < count; i++, t += 100) counter.processFrame(frame(knee, 10, t, yaw));
    }
    assert.equal(counter.getState().repCount, 1);
    assert.equal(counter.getState().angleSource, '3d');
    const noWorld = frame(90, 10, t);
    delete noWorld.worldLandmarks;
    assert.equal(counter.processFrame(noWorld), null);
    assert.equal(counter.getState().repCount, 1);
  }
});

test('三维 125° 浅蹲不沿用二维底部阈值，短暂前倾不记录错误', () => {
  const counter = createRepCounter();
  let t = 0;
  for (const [knee, count] of [[170, 10], [125, 20], [170, 20]]) {
    for (let i = 0; i < count; i++, t += 100) counter.processFrame(frame(knee, 0, t));
  }
  assert.equal(counter.getState().repCount, 0);
  const events = [];
  const off = eventBus.on(EVENTS.FORM_FEEDBACK, e => events.push(e));
  try {
    startFormFeedback();
    for (const [knee, lean, timestamp] of [[170, 60, 0], [170, 60, 100], [170, 0, 200]]) {
      eventBus.emit(EVENTS.POSE_FRAME, frame(knee, lean, timestamp));
    }
    assert.equal(events.length, 0);
  } finally { stopFormFeedback(); off(); }
});

test('先弯腰和先下蹲两种顺序均记录，持续弯腰只记录一次；无效帧不计错误', () => {
  const events = [];
  const off = eventBus.on(EVENTS.FORM_FEEDBACK, e => events.push(e));
  try {
    for (const before of [true, false]) {
      events.length = 0;
      startFormFeedback();
      let t = 0;
      for (const [knee, lean, count] of [[170, 0, 10], [before ? 170 : 90, before ? 60 : 0, 15], [90, 60, 40]]) {
        for (let i = 0; i < count; i++, t += 100) eventBus.emit(EVENTS.POSE_FRAME, frame(knee, lean, t, 90));
      }
      assert.equal(events.filter(e => e.code === 'leaning_forward').length, 1);
      // 恢复直立后再次弯腰可记新的一次。
      for (let i = 0; i < 20; i++, t += 100) eventBus.emit(EVENTS.POSE_FRAME, frame(170, 0, t));
      for (let i = 0; i < 20; i++, t += 100) eventBus.emit(EVENTS.POSE_FRAME, frame(170, 60, t));
      assert.equal(events.filter(e => e.code === 'leaning_forward').length, 2);
      stopFormFeedback();
    }
    events.length = 0;
    startFormFeedback();
    for (let i = 0; i < 50; i++) eventBus.emit(EVENTS.POSE_FRAME, { ...frame(90, 60, i * 100), valid: false });
    assert.equal(events.length, 0);
  } finally {
    stopFormFeedback();
    off();
  }
});

test('旧二维输入也能在下蹲前记录弯腰；错误事件随 session_completed 交付但不虚构分数', () => {
  startMovement();
  // 图像坐标给出站直膝盖和前倾 60°，没有 worldLandmarks 字段。
  for (let i = 0; i < 30; i++) {
    const f = frame(170, 60, i * 100);
    delete f.worldLandmarks;
    f.aspectRatio = 1;
    for (const [s, h, k, a] of [[11, 23, 25, 27], [12, 24, 26, 28]]) {
      f.landmarks[h] = { x: 0.5, y: 0.4, visibility: 0.99 };
      f.landmarks[k] = { x: 0.5, y: 0.6, visibility: 0.99 };
      f.landmarks[a] = { x: 0.5, y: 0.8, visibility: 0.99 };
      f.landmarks[s] = { x: 0.5 + 0.2 * Math.sin(Math.PI / 3), y: 0.3, visibility: 0.99 };
    }
    eventBus.emit(EVENTS.POSE_FRAME, f);
  }
  const result = stopMovement();
  assert.equal(result.repCount, 0);
  assert.equal(result.angleSource, '2d');
  assert.equal(result.formFeedback.length, 1);
  assert.equal(result.formFeedback[0].code, 'leaning_forward');
  assert.equal(result.qualityScore, undefined);
});
