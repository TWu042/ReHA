// 训练结束后的评分入口：P2 结果 → adapter → P3 评分 → 存历史 → 发 session_summary。
//
//   import { analyzeSession } from '../analytics/analyticsModule.js';
//   const { summary, saved, error } = analyzeSession(stopMovement());
//
// 只是把 P3 现有的函数串起来，评分规则都在 sessionSummary.js / scoring.js 里。
// 任何一步出错都不会抛出：网页照常显示 P2 的原始结果，summary 为 null，error 里写原因。

import { EVENTS } from '../shared/contracts.js';
import { eventBus } from '../shared/eventBus.js';
import { toAnalyticsSession } from './movementAdapter.js';
import { generateSessionSummary } from './sessionSummary.js';
import { getSessions, saveSession } from './storage.js';

// 隐私窗口、禁用存储时访问 localStorage 会抛错
function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {object} movementResult  stopMovement() 的返回值
 * @param {object} [options]
 * @param {object|null} [options.storage]  默认 localStorage；null = 不读不存
 * @param {object} [options.bus]           默认全局 eventBus
 * @param {Date}   [options.now]           训练结束时间（测试时固定）
 * @param {boolean} [options.isMock=false]
 * @returns {{ summary: object|null, previousCount: number, saved: boolean, error: string|null }}
 */
export function analyzeSession(movementResult, {
  storage = defaultStorage(),
  bus = eventBus,
  now = new Date(),
  isMock = false,
} = {}) {
  let history = [];
  let historyOk = Boolean(storage);
  const errors = [];

  if (storage) {
    try {
      history = getSessions(storage);
    } catch (e) {
      // 历史记录损坏：本次照常评分（没有基线），但不写入，免得覆盖原数据
      historyOk = false;
      errors.push(`history: ${e.message}`);
    }
  }

  let summary;
  try {
    const session = toAnalyticsSession(movementResult, { isMock, now });
    summary = generateSessionSummary(session, history);
  } catch (e) {
    errors.push(`summary: ${e.message}`);
    return { summary: null, previousCount: history.length, saved: false, error: errors.join('; ') };
  }

  let saved = false;
  if (historyOk) {
    try {
      saveSession(summary, storage);
      saved = true;
    } catch (e) {
      errors.push(`save: ${e.message}`);
    }
  }

  bus.emit(EVENTS.SESSION_SUMMARY, summary);

  return {
    summary,
    previousCount: history.length,
    saved,
    error: errors.length ? errors.join('; ') : null,
  };
}
