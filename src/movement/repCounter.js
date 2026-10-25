// 深蹲计数状态机（纯逻辑，不依赖 eventBus，可以直接用 node 测试）
//
// 状态：STANDING → DESCENDING → BOTTOM → ASCENDING → STANDING（计一次）
//   STANDING   平滑膝角 < STAND_ANGLE        → DESCENDING（开始记录这次动作）
//   DESCENDING 平滑膝角 < BOTTOM_ENTER_ANGLE → BOTTOM
//              平滑膝角 ≥ STAND_ANGLE        → STANDING（没蹲到底，不计数）
//   BOTTOM     平滑膝角 > BOTTOM_EXIT_ANGLE  → ASCENDING（滞回：进入值和离开值差 10°）
//   ASCENDING  平滑膝角 < BOTTOM_ENTER_ANGLE → BOTTOM（又蹲回去了，还是同一次）
//              平滑膝角 ≥ STAND_ANGLE        → STANDING，时长 ≥ MIN_REP_DURATION_MS 才计数
//
// valid 为 false 或膝角为 null 的帧直接跳过，不改变任何状态。
//
// 丢失追踪太久（两个有效帧间隔 > TRACKING_GAP_MS）：放弃正在做的这一次，回到 STANDING，
// 并且要先看到站直（膝角 ≥ STAND_ANGLE）才开始数下一次。训练刚开始时也一样要先站直。
// 这样用户蹲着出框、回来再站起，不会被多算一次。

import { PHASE } from '../shared/contracts.js';
import { getPoseAngles } from './poseAngles.js';
import * as CONFIG from './config.js';

/**
 * @param {object} [options]
 * @param {number} [options.aspectRatio=1]  视频宽 ÷ 高。PoseFrame 里有 aspectRatio 字段时优先用它。
 * @param {object} [options.config]         覆盖 config.js 里的阈值，调参用，例如 { STAND_ANGLE: 155 }
 */
export function createRepCounter({ aspectRatio = 1, config = {}, angleMode = 'auto' } = {}) {
  let cfg = { ...CONFIG, ...config };
  let angleSource = null;

  let phase = PHASE.STANDING;
  let smoothedAngle = null;
  let repCount = 0;
  let currentRep = null;   // { startTimestampMs, standingAngle, samples: [] }
  let standingPeak = null; // 站立阶段的最大平滑膝角，作为这次动作的起点角度
  let lastValidTimestampMs = null;
  let waitingForStand = true; // 开始时和丢失追踪太久之后，要先站直才开始计数
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
   *     abortedRep,    // 这一帧放弃了一次动作时有值，否则 null。reason 为
   *                    //   'not_deep_enough'（没蹲到底）、'too_fast'（太快）、'tracking_lost'（中途丢失追踪太久）
   *     waitingForStand } // true 表示正在等用户站直，这时不计数
   */
  function processFrame(poseFrame) {
    if (!poseFrame || poseFrame.valid === false) return null;

    const t = poseFrame.timestampMs;
    if (!Number.isFinite(t) || (lastValidTimestampMs != null && t <= lastValidTimestampMs)) return null;
    const angles = getPoseAngles(poseFrame, { mode: angleSource ?? angleMode, aspectRatio });
    const raw = angles.kneeAngleDeg;
    if (raw == null) return null;
    if (angleSource == null) {
      angleSource = angles.source;
      if (angleSource === '3d') {
        cfg = { ...cfg,
          BOTTOM_ENTER_ANGLE: config.BOTTOM_ENTER_ANGLE ?? cfg.WORLD_BOTTOM_ENTER_ANGLE,
          BOTTOM_EXIT_ANGLE: config.BOTTOM_EXIT_ANGLE ?? cfg.WORLD_BOTTOM_EXIT_ANGLE,
        };
      }
    }
    let completedRep = null;
    let abortedRep = null;
    const previousTimestampMs = lastValidTimestampMs;

    // 丢失追踪太久：放弃这一次，平滑也重新开始（旧的平滑值已经不代表现在的姿势）
    if (lastValidTimestampMs != null && t - lastValidTimestampMs > cfg.TRACKING_GAP_MS) {
      if (currentRep) {
        abortedRep = { reason: 'tracking_lost', ...summarize(currentRep, lastValidTimestampMs) };
      }
      phase = PHASE.STANDING;
      currentRep = null;
      smoothedAngle = null;
      standingPeak = null;
      waitingForStand = true;
    }
    lastValidTimestampMs = t;

    // 按时间平滑：两帧间隔越长，新值的权重越大，所以帧率高低不影响平滑效果
    if (smoothedAngle == null) {
      smoothedAngle = raw;
    } else {
      const alpha = 1 - Math.exp(-(t - previousTimestampMs) / cfg.SMOOTHING_TIME_MS);
      smoothedAngle = alpha * raw + (1 - alpha) * smoothedAngle;
    }
    const a = smoothedAngle;

    if (waitingForStand) {
      if (a >= cfg.STAND_ANGLE) {
        waitingForStand = false;
        standingPeak = a;
      }
      return { phase, kneeAngleDeg: raw, smoothedAngle: a, repCount, completedRep, abortedRep, waitingForStand };
    }

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

    return { phase, kneeAngleDeg: raw, smoothedAngle: a, repCount, completedRep, abortedRep, waitingForStand };
  }

  function getState() {
    return {
      phase,
      angleSource,
      repCount,
      smoothedAngle,
      waitingForStand,
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
    lastValidTimestampMs = null;
    waitingForStand = true;
    angleSource = null;
    cfg = { ...CONFIG, ...config };
    reps.length = 0;
  }

  return { processFrame, getState, reset };
}
