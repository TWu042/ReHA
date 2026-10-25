// 模块 2 对外入口：把 repCounter 接上 eventBus。
//
//   startMovement()  开始一次训练：订阅 pose_frame，每完成一次深蹲发 rep_completed；同时开启 P4 的纠错
//   stopMovement()   结束训练：取消订阅、关闭纠错，发 session_completed（带 MovementResult），并返回同一份结果
//
// 纠错（P4 formFeedback.js）：前倾由它自己订阅 pose_frame 检测；没蹲到底由这里把 abortedRep 交给它。
// 两种提示都以 form_feedback 事件发出。
//
// 用法（P5 训练页）：
//   import { startMovement, stopMovement } from '../movement/movementModule.js';
//   点"开始"时 startMovement()，点"结束"时 stopMovement()。

import { eventBus } from '../shared/eventBus.js';
import { EVENTS } from '../shared/contracts.js';
import { createRepCounter } from './repCounter.js';
import { startFormFeedback, stopFormFeedback, handleAbortedRep } from './formFeedback.js';

const round1 = x => Math.round(x * 10) / 10;
const round2 = x => Math.round(x * 100) / 100;

let counter = null;
let unsubscribe = null;
let framesTotal = 0;   // 收到的帧数
let framesUsed = 0;    // 有效、能算出膝角的帧数
let lastResult = null; // 最近一个有效帧的计数结果，给 getMovementState 用
let feedbackUnsubscribe = null;
let formFeedback = [];

function handlePoseFrame(poseFrame) {
  framesTotal++;
  const result = counter.processFrame(poseFrame);
  if (!result) return;
  framesUsed++;
  lastResult = result;

  if (result.abortedRep) handleAbortedRep(result.abortedRep);

  const rep = result.completedRep;
  if (rep) {
    eventBus.emit(EVENTS.REP_COMPLETED, {
      type: EVENTS.REP_COMPLETED,
      timestampMs: rep.endTimestampMs,
      repCount: rep.repCount,
      rom: round1(rep.romDeg),
    });
  }
}

/**
 * 开始一次训练。正在训练时再调用，会先结束上一次（不发 session_completed），重新开始。
 * @param {object} [options]  原样传给 createRepCounter，例如 { aspectRatio: 16 / 9 }
 * @param {string} [options.angleMode]          计数用的角度：'auto'（有 3D 就用 3D）/ '2d' / '3d'
 * @param {string} [options.feedbackAngleMode]  纠错（前倾）用的角度，默认和 angleMode 相同
 */
export function startMovement(options = {}) {
  if (unsubscribe) unsubscribe();
  feedbackUnsubscribe?.();
  counter = createRepCounter(options);
  framesTotal = 0;
  framesUsed = 0;
  lastResult = null;
  formFeedback = [];
  feedbackUnsubscribe = eventBus.on(EVENTS.FORM_FEEDBACK, feedback => {
    formFeedback.push({ ...feedback });
  });
  unsubscribe = eventBus.on(EVENTS.POSE_FRAME, handlePoseFrame);
  startFormFeedback({ ...options, angleMode: options.feedbackAngleMode ?? options.angleMode });
}

/**
 * 当前训练的实时状态，给页面显示用（例如"请先站直"、当前阶段）。不在训练时返回 null。
 * 页面按自己的节奏读取（比如每个动画帧读一次），不要把它放进每帧都更新的 React state。
 * @returns {{ phase, repCount, kneeAngleDeg, smoothedAngle, waitingForStand } | null}
 *   kneeAngleDeg / smoothedAngle 为最近一个有效帧的原始 / 平滑膝角，还没有有效帧时为 null
 */
export function getMovementState() {
  if (!unsubscribe) return null;
  const { phase, repCount, waitingForStand } = counter.getState();
  return {
    phase,
    repCount,
    kneeAngleDeg: lastResult?.kneeAngleDeg ?? null,
    smoothedAngle: lastResult?.smoothedAngle ?? null,
    waitingForStand,
    angleSource: counter.getState().angleSource,
  };
}

/**
 * 结束训练，发出 session_completed。没有在训练时调用返回 null，不发事件。
 * @returns {object|null} MovementResult（格式见 OPERATIONS.md 第 8.2 节）
 */
export function stopMovement() {
  if (!unsubscribe) return null;
  unsubscribe();
  unsubscribe = null;
  stopFormFeedback();
  feedbackUnsubscribe?.();
  feedbackUnsubscribe = null;

  const { repCount, reps } = counter.getState();
  const result = {
    exercise: 'squat',
    repCount,
    reps: reps.map(r => ({
      rom: round1(r.romDeg),
      durationMs: Math.round(r.durationMs),
      minKneeAngle: round1(r.minKneeAngle),
      maxKneeAngle: round1(r.maxKneeAngle),
      // 这次动作的逐帧膝角（给 P3 算平稳度）。kneeAngleDeg 用平滑后的值，和算 ROM 用的是同一组数。
      // 从膝角跌破 STAND_ANGLE 开始，到回到 STAND_ANGLE 以上那一帧结束；timestampMs 严格递增。
      samples: r.samples.map(s => ({ timestampMs: s.timestampMs, kneeAngleDeg: round2(s.smoothedAngle) })),
    })),
    // 基线 ROM 需要历史训练记录才能算，本模块拿不到，所以按规则用 null，由 P3 根据历史数据填
    baselineROM: null,
    averageROM: reps.length ? round1(reps.reduce((s, r) => s + r.romDeg, 0) / reps.length) : null,
    // 能用的帧占收到的帧的比例（0–1）；一帧都没收到时为 null
    trackingQuality: framesTotal ? Math.round((framesUsed / framesTotal) * 100) / 100 : null,
    // 原始错误事件交给 P3；不在此擅自规定扣分权重。
    formFeedback: formFeedback.map(feedback => ({ ...feedback })),
    angleSource: counter.getState().angleSource,
  };

  counter = null;
  lastResult = null;
  eventBus.emit(EVENTS.SESSION_COMPLETED, result);
  return result;
}
