// P2 → P3 适配：把 session_completed（MovementResult）转成 generateSessionSummary 需要的 currentSession。
//
//   import { toAnalyticsSession } from './movementAdapter.js';
//   eventBus.on(EVENTS.SESSION_COMPLETED, result => {
//     const session = toAnalyticsSession(result);
//     const summary = generateSessionSummary(session, getSessions());
//   });
//
// 字段对照：
//   repCount        → completedReps
//   reps[]          → reps[]（保留 rom、durationMs、minKneeAngle、maxKneeAngle、samples）
//   averageROM      → 按 reps[].rom 重新算平均，保留 1 位小数（见下）
//   trackingQuality → trackingQuality
//   angleSource     → angleSource（'3d' / '2d' / null，基线不要混算两种）
//   formFeedback    → formFeedback（本次的纠错事件，可用于扣分）
//   新增：sessionId、date（本地日期 YYYY-MM-DD）、createdAt（ISO 时间，同一天多次训练靠它排序）、isMock
//
// 为什么重算 averageROM：P2 的平均值用未取整的 ROM 算，再取 1 位小数；reps[].rom 也各自取了 1 位小数。
// 两边误差叠加最多约 0.1°，而 P3 校验允许的误差是 0.05°，可能误报"averageROM does not match"。
// 这里改用取整后的 reps[].rom 求平均再取 1 位小数，误差不超过 0.05°。

const round1 = x => Math.round(x * 10) / 10;

function localDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function randomId() {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * @param {object} movementResult  stopMovement() 的返回值 / session_completed 的内容
 * @param {object} [options]
 * @param {boolean} [options.isMock=false]  回放录制、演示数据时传 true
 * @param {Date}    [options.now]           训练结束时间，默认当前时间（测试时可固定）
 * @param {string}  [options.sessionId]     默认自动生成 session-时间戳-随机串
 * @returns {object} currentSession，可直接传给 generateSessionSummary
 */
export function toAnalyticsSession(movementResult, { isMock = false, now = new Date(), sessionId } = {}) {
  if (!movementResult || typeof movementResult !== 'object' || Array.isArray(movementResult)) {
    throw new TypeError('toAnalyticsSession: movementResult 不是对象');
  }
  if (!Array.isArray(movementResult.reps)) {
    throw new TypeError('toAnalyticsSession: movementResult.reps 不是数组');
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('toAnalyticsSession: now 不是有效日期');
  }

  const reps = movementResult.reps.map(r => ({
    rom: r.rom,
    durationMs: r.durationMs,
    minKneeAngle: r.minKneeAngle ?? null,
    maxKneeAngle: r.maxKneeAngle ?? null,
    samples: Array.isArray(r.samples) ? r.samples.map(s => ({ timestampMs: s.timestampMs, kneeAngleDeg: s.kneeAngleDeg })) : [],
  }));

  const averageROM = reps.length
    ? round1(reps.reduce((sum, r) => sum + r.rom, 0) / reps.length)
    : null;

  return {
    sessionId: sessionId ?? `session-${now.getTime()}-${randomId()}`,
    date: localDate(now),
    createdAt: now.toISOString(),
    isMock: Boolean(isMock),
    completedReps: reps.length,
    averageROM,
    reps,
    trackingQuality: movementResult.trackingQuality ?? null,
    angleSource: movementResult.angleSource ?? null,
    formFeedback: Array.isArray(movementResult.formFeedback)
      ? movementResult.formFeedback.map(f => ({ timestampMs: f.timestampMs, code: f.code, message: f.message }))
      : [],
  };
}
