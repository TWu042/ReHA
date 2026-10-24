/* global process */
// 分析真人录制：每份录制的帧率、有效帧比例、膝角范围、计数结果、被放弃的动作。调参时用。
//
// 运行（在仓库根目录）：
//   node tests/analyzeRecordings.js                       分析 mock/ 里所有 p1_、p2_ 开头的录制
//   node tests/analyzeRecordings.js mock/p2_xxx.json      只分析指定文件
//   node tests/analyzeRecordings.js --enter 136 --exit 146   临时换阈值试试（不改 config.js）
//   node tests/analyzeRecordings.js --aspect 1.7778       录制里没有 aspectRatio 时按这个宽高比算（默认 4:3）
//
// 录制里每帧有 aspectRatio（P1 加了这个字段之后录的）就用帧里的；没有就用 --aspect。

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { createRepCounter } from '../src/movement/repCounter.js';
import { getPoseAngles } from '../src/movement/poseAngles.js';

export const MOCK_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'mock');

// P1 的早期录制没有 aspectRatio。摄像头请求的是 640×480，所以默认按 4:3。
export const DEFAULT_ASPECT = 4 / 3;

/**
 * 分析一份录制。
 * @param {object[]} frames  PoseFrame 数组
 * @param {object} [options]
 * @param {number} [options.aspectRatio]  帧里没有 aspectRatio 时用这个
 * @param {object} [options.config]       覆盖 config.js 的阈值
 */
export function analyzeFrames(frames, { aspectRatio = DEFAULT_ASPECT, config = {} } = {}) {
  const withAspect = frames.map(f => (f.aspectRatio == null ? { ...f, aspectRatio } : f));
  const counter = createRepCounter({ config });
  const aborted = [];
  for (const f of withAspect) {
    const r = counter.processFrame(f);
    if (r?.abortedRep) aborted.push({ reason: r.abortedRep.reason, minKneeAngle: r.abortedRep.minKneeAngle });
  }
  const state = counter.getState();
  const validFrames = withAspect.filter(f => f.valid);
  const angles = validFrames.map(f => getPoseAngles(f, { mode: state.angleSource ?? 'auto', aspectRatio }).kneeAngleDeg).filter(a => a != null);
  const seconds = frames.length > 1 ? (frames.at(-1).timestampMs - frames[0].timestampMs) / 1000 : 0;
  return {
    frames: frames.length,
    seconds,
    fps: seconds ? frames.length / seconds : null,
    validRatio: frames.length ? validFrames.length / frames.length : null,
    minAngle: angles.length ? Math.min(...angles) : null,
    maxAngle: angles.length ? Math.max(...angles) : null,
    repCount: state.repCount,
    angleSource: state.angleSource,
    reps: state.reps.map(r => ({ rom: r.romDeg, minKneeAngle: r.minKneeAngle, durationMs: r.durationMs })),
    aborted,
  };
}

export function loadRecording(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function listRecordings(dir = MOCK_DIR) {
  return readdirSync(dir).filter(n => /^p[12]_.*\.json$/.test(n)).map(n => join(dir, n));
}

// 命令行入口
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = name => {
    const i = args.indexOf(name);
    if (i < 0) return undefined;
    const value = Number(args[i + 1]);
    args.splice(i, 2);
    return value;
  };
  const config = {};
  const enter = opt('--enter'), exit = opt('--exit'), aspect = opt('--aspect');
  if (enter != null) config.BOTTOM_ENTER_ANGLE = enter;
  if (exit != null) config.BOTTOM_EXIT_ANGLE = exit;

  const files = args.length ? args : listRecordings();
  if (!files.length) console.log('mock/ 里没有 p1_ 或 p2_ 开头的录制。');
  if (Object.keys(config).length) console.log('临时阈值：', config);

  for (const file of files) {
    const r = analyzeFrames(loadRecording(file), { aspectRatio: aspect ?? DEFAULT_ASPECT, config });
    const f1 = x => (x == null ? '--' : x.toFixed(0));
    console.log(`\n${basename(file)}`);
    console.log(`  ${r.frames} 帧，${r.seconds.toFixed(1)} 秒，约 ${f1(r.fps)} 帧/秒，有效帧 ${f1(r.validRatio * 100)}%`);
    console.log(`  膝角范围 ${f1(r.minAngle)}°–${f1(r.maxAngle)}°`);
    console.log(`  坐标模式：${r.angleSource ?? '尚无可用角度'}`);
    console.log(`  计数 ${r.repCount}` + (r.reps.length
      ? `：${r.reps.map(x => `最低 ${f1(x.minKneeAngle)}° ROM ${f1(x.rom)}°`).join('，')}` : ''));
    if (r.aborted.length) {
      const text = { not_deep_enough: '没蹲到底', too_fast: '太快', tracking_lost: '中途丢失追踪' };
      console.log(`  放弃 ${r.aborted.length} 次：${r.aborted.map(a => `${text[a.reason] || a.reason}（最低 ${f1(a.minKneeAngle)}°）`).join('，')}`);
    }
  }
}
