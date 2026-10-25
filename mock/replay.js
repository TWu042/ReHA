/* global process */
// 录制回放：把录好的帧（mock/*.json）重新"播放"成 pose_frame 事件，不用开摄像头。
//
// 两种用法：
// 1. 浏览器里按真实速度播放（给页面演示、开发用）：
//      import { playRecording } from '../../mock/replay.js';
//      const stop = playRecording(frames, { speed: 1 });   // 返回停止函数
// 2. Node 里一次性跑完整条流程，得到真实的 session_completed 和 P3 评分：
//      node mock/replay.js mock/p1_normal_5_xxx.json
//      node mock/replay.js mock/p1_normal_5_xxx.json --write mock/session_completed_real_example.json
//
// P1 早期录制（p1_ 开头）没有 aspectRatio，命令行回放时默认补 4:3（摄像头请求的是 640×480）。
// 合成数据是按正方形画面生成的，不补（等于 1）。可以用 --aspect 指定。

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { eventBus } from '../src/shared/eventBus.js';
import { EVENTS } from '../src/shared/contracts.js';
import { startMovement, stopMovement } from '../src/movement/movementModule.js';

export const DEFAULT_ASPECT = 4 / 3;

// 没有 aspectRatio 的旧录制补上默认值
export function withAspect(frames, aspectRatio = DEFAULT_ASPECT) {
  return frames.map(f => (f.aspectRatio == null ? { ...f, aspectRatio } : f));
}

/**
 * 按录制里的时间间隔播放（浏览器用）。返回一个停止函数。
 * @param {object[]} frames
 * @param {object} [options]
 * @param {number} [options.speed=1]      2 = 两倍速
 * @param {object} [options.bus=eventBus]
 * @param {Function} [options.onEnd]      播放完调用
 */
export function playRecording(frames, { speed = 1, bus = eventBus, onEnd } = {}) {
  if (!frames.length) { onEnd?.(); return () => {}; }
  const t0 = frames[0].timestampMs;
  const timers = frames.map((f, i) => setTimeout(() => {
    bus.emit(EVENTS.POSE_FRAME, f);
    if (i === frames.length - 1) onEnd?.();
  }, (f.timestampMs - t0) / speed));
  return () => timers.forEach(clearTimeout);
}

/**
 * 同步把所有帧发出去（Node 测试用，不等待真实时间）。
 */
export function replayFrames(frames, { bus = eventBus } = {}) {
  for (const f of frames) bus.emit(EVENTS.POSE_FRAME, f);
}

/**
 * 跑一次完整训练：startMovement → 回放所有帧 → stopMovement，返回 session_completed 的内容。
 * @param {object} [options]
 * @param {number|null} [options.aspectRatio=null]  给没有 aspectRatio 的帧补上；null 表示不补
 */
export function replayToSessionCompleted(frames, { aspectRatio = null, movementOptions = {} } = {}) {
  startMovement(movementOptions);
  replayFrames(aspectRatio == null ? frames : withAspect(frames, aspectRatio));
  return stopMovement();
}

// 按文件名猜默认宽高比：P1 早期录制 4:3，其他（合成数据）不补
export function defaultAspectFor(file) {
  return /(^|[\\/])p1_[^\\/]*$/.test(file) ? DEFAULT_ASPECT : null;
}

// 命令行入口
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const take = name => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const writeTo = take('--write');
  const aspectArg = take('--aspect');
  const file = args[0];
  const aspect = aspectArg != null ? Number(aspectArg) : defaultAspectFor(file ?? '');
  if (!file) {
    console.log('用法：node mock/replay.js <录制文件> [--aspect 1.3333] [--write 输出.json]');
    process.exit(1);
  }

  const { toAnalyticsSession } = await import('../src/analytics/movementAdapter.js');
  const { generateSessionSummary } = await import('../src/analytics/sessionSummary.js');

  const result = replayToSessionCompleted(JSON.parse(readFileSync(file, 'utf8')), { aspectRatio: aspect });
  const session = toAnalyticsSession(result);
  const summary = generateSessionSummary(session, []);

  console.log(`${file}`);
  console.log(`  计数 ${result.repCount}，平均 ROM ${result.averageROM ?? '--'}°，追踪质量 ${result.trackingQuality ?? '--'}，角度来源 ${result.angleSource ?? '--'}`);
  console.log(`  每次：${result.reps.map(r => `ROM ${r.rom}° ${r.durationMs}ms ${r.samples.length} 帧`).join('；') || '无'}`);
  console.log(`  纠错 ${result.formFeedback?.length ?? 0} 次：${(result.formFeedback ?? []).map(f => f.code).join('、') || '无'}`);
  console.log(`  P3 评分（无历史）：一致性 ${summary.consistencyScore?.toFixed(1) ?? '--'}，平稳 ${summary.smoothnessScore ?? '--'}，幅度 ${summary.rangeScore ?? '--'}，总分 ${summary.qualityScore ?? '--'}`);

  if (writeTo) {
    writeFileSync(writeTo, JSON.stringify(result, null, 2));
    console.log(`  已写入 ${writeTo}`);
  }
}
