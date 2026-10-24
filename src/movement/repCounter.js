// 深蹲计数状态机（纯逻辑，不依赖 eventBus，可以直接用 node 测试）
//
// 状态：STANDING → DESCENDING → BOTTOM → ASCENDING → STANDING（计一次）
//   STANDING   平滑膝角 < STAND_ANGLE        → DESCENDING（开始记录这次动作）
//   DESCENDING 平滑膝角 < BOTTOM_ENTER_ANGLE → BOTTOM
//              平滑膝角 ≥ STAND_ANGLE        → STANDING（没蹲到底，不计数）
//   BOTTOM     平滑膝角 > BOTTOM_EXIT_ANGLE  → ASCENDING（滞回：100 进，110 出）
//   ASCENDING  平滑膝角 < BOTTOM_ENTER_ANGLE → BOTTOM（又蹲回去了，还是同一次）
//              平滑膝角 ≥ STAND_ANGLE        → STANDING，时长 ≥ MIN_REP_DURATION_MS 才计数
//
// valid 为 false 或膝角为 null 的帧直接跳过，不改变任何状态。

import { PHASE } from '../shared/contracts.js';
import { kneeAngleDeg } from './angles.js';
import * as CONFIG from './config.js';

/**
 * @param {object} [options]
 * @param {number} [options.aspectRatio=1]  视频宽 ÷ 高。PoseFrame 里有 aspectRatio 字段时优先用它。
 * @param {object} [options.config]         覆盖 config.js 里的阈值，调参用，例如 { STAND_ANGLE: 155 }
 */
export function createRepCounter({ aspectRatio = 1, config = {} } = {}) {
  const cfg = { ...CONFIG, ...config };

  let phase = PHASE.STANDING;
  let smoothedAngle = null;
  let repCount = 0;
  let currentRep = null;   // { startTimestampMs, standingAngle, samples: [] }
  let standingPeak = null; // 站立阶段的最大平滑膝角，作为这次动作的起点角度
  const reps = [];         // 已完成的每次动作

  function startRep(timestampMs) {
    currentRep = { startTimestampMs: timestampMs, standingAngle: standingPeak, samples: [] };
  }

  // ROM = 下蹲前站立时的最大角度 − 本次最低角度（都用平滑后的值，避免噪声尖刺）
  function summarize(rep, endTimestampMs) {
    const angles = rep.samples.map(s => s.smoothedAngle);
    const minKneeAngle = Math.min(...angles);
    const maxKneeAngle = Math.max(rep.standingAngle ?? -Infinity, ...angles);
    return {
      startTimestampMs: rep.startTimestampMs,
      endTimestampMs,
      durationMs: endTimestampMs - rep.startTimestampMs,
      minKneeAngle,
      maxKneeAngle,
      romDeg: maxKneeAngle - minKneeAngle,
      samples: rep.samples,
    };
  }

  /**
   * 处理一帧。
   * 被跳过的帧返回 null；否则返回本帧结果：
   *   { phase, kneeAngleDeg, smoothedAngle, repCount,
   *     completedRep,  // 这一帧刚完成一次计数时有值，否则 null
   *     abortedRep }   // 这一帧放弃了一次动作时有值（没蹲到底 / 太快），否则 null。P4 纠错可以用
   */
  function processFrame(poseFrame) {
    if (!poseFrame || poseFrame.valid === false) return null;

    const ratio = poseFrame.aspectRatio ?? aspectRatio;
    const raw = kneeAngleDeg(poseFrame.landmarks, ratio);
    if (raw == null) return null;

    const t = poseFrame.timestampMs;
    smoothedAngle = smoothedAngle == null
      ? raw
      : cfg.SMOOTHING_ALPHA * raw + (1 - cfg.SMOOTHING_ALPHA) * smoothedAngle;
    const a = smoothedAngle;

    let completedRep = null;
    let abortedRep = null;

    if (phase === PHASE.STANDING) {
      standingPeak = Math.max(standingPeak ?? a, a);
      if (a < cfg.STAND_ANGLE) {
        phase = PHASE.DESCENDING;
        startRep(t);
      }
    } else if (phase === PHASE.DESCENDING) {
      if (a < cfg.BOTTOM_ENTER_ANGLE) {
        phase = PHASE.BOTTOM;
      } else if (a >= cfg.STAND_ANGLE) {
        phase = PHASE.STANDING;
        abortedRep = { reason: 'not_deep_enough', ...summarize(currentRep, t) };
        currentRep = null;
      }
    } else if (phase === PHASE.BOTTOM) {
      if (a > cfg.BOTTOM_EXIT_ANGLE) phase = PHASE.ASCENDING;
    } else if (phase === PHASE.ASCENDING) {
      if (a < cfg.BOTTOM_ENTER_ANGLE) {
        phase = PHASE.BOTTOM;
      } else if (a >= cfg.STAND_ANGLE) {
        phase = PHASE.STANDING;
        const rep = summarize(currentRep, t);
        if (rep.durationMs >= cfg.MIN_REP_DURATION_MS) {
          repCount += 1;
          completedRep = { repCount, ...rep };
          reps.push(completedRep);
        } else {
          abortedRep = { reason: 'too_fast', ...rep };
        }
        currentRep = null;
      }
    }

    // 记录样本：动作进行中每帧都记；刚结束的那一帧也补进结果里
    const sample = { timestampMs: t, kneeAngleDeg: raw, smoothedAngle: a };
    if (currentRep) currentRep.samples.push(sample);
    if (completedRep || abortedRep) {
      (completedRep || abortedRep).samples.push(sample);
      standingPeak = a;   // 新一轮站立从这一帧重新算峰值
    }

    return { phase, kneeAngleDeg: raw, smoothedAngle: a, repCount, completedRep, abortedRep };
  }

  function getState() {
    return {
      phase,
      repCount,
      smoothedAngle,
      currentRep: currentRep && {
        startTimestampMs: currentRep.startTimestampMs,
        sampleCount: currentRep.samples.length,
      },
      reps: reps.slice(),
    };
  }

  function reset() {
    phase = PHASE.STANDING;
    smoothedAngle = null;
    repCount = 0;
    currentRep = null;
    standingPeak = null;
    reps.length = 0;
  }

  return { processFrame, getState, reset };
}
