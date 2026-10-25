/* global process */
// 鲁棒性测试：降帧率、时间戳抖动、掉帧、关键点抖动下，计数和 ROM 是否稳定。随机数用固定种子，结果可复现。
//
// 运行：node tests/robustness.test.js
//
// 要求（✓/✗ 判定）：
//   - 帧率 60 / 30 / 24 / 15 / 10：次数不变，平均 ROM 偏差 ≤ 2°
//   - 时间戳 ±15ms 抖动 + 随机掉 30% 帧（10 组随机数）：次数不变，平均 ROM 偏差 ≤ 2°
//   - 15 帧/秒 + 时间抖动 + 掉 10% 帧（5 组）：次数不变
//   - 关键点抖动 σ=0.003（约 2 像素，10 组）：次数不变；"真人正常"允许 4 或 5
//     （这段录制第一次只蹲到约 135°，离 133° 阈值只差 2°，抖一下就可能算进去）
// 只打印、不判定：更大的关键点抖动（σ=0.006 / 0.01 / 0.02），用来看极限在哪里。

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { replayToSessionCompleted, defaultAspectFor } from '../mock/replay.js';
import { resample, jitterLandmarks, jitterTiming, fpsOf } from './perturb.js';
import { MOCK_DIR } from './analyzeRecordings.js';

const files = readdirSync(MOCK_DIR);
const CASES = [
  { name: '合成标准 3 次',     file: 'synthetic_squat.json', reps: [3] },
  { name: '真人正常 5 次',     file: 'p1_normal_5_',         reps: [4], noisyReps: [4, 5] },
  { name: '真人浅蹲 3 次',     file: 'p1_shallow_3_',        reps: [0] },
  { name: '真人底部停顿 2 次', file: 'p1_bottom_pause_2_',   reps: [2] },
];
const ROM_TOLERANCE = 2;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`);
}

for (const c of CASES) {
  const fileName = files.find(n => n === c.file || n.startsWith(c.file));
  const frames = JSON.parse(readFileSync(join(MOCK_DIR, fileName), 'utf8'));
  const aspectRatio = defaultAspectFor(fileName);
  const run = fr => replayToSessionCompleted(fr, { aspectRatio });
  const base = run(frames);
  const romOk = r => base.averageROM == null ? r.averageROM == null : Math.abs(r.averageROM - base.averageROM) <= ROM_TOLERANCE;
  const fmt = r => `${r.repCount} 次 / ${r.averageROM ?? '--'}°`;

  console.log(`\n【${c.name}】原始 ${fpsOf(frames).toFixed(0)} 帧/秒：${fmt(base)}`);
  check('原始录制次数', c.reps.includes(base.repCount));

  for (const fps of [60, 30, 24, 15, 10]) {
    const r = run(resample(frames, fps));
    check(`${fps} 帧/秒`, r.repCount === base.repCount && romOk(r), fmt(r));
  }

  const timing = SEEDS.map(seed => run(jitterTiming(frames, { jitterMs: 15, dropRate: 0.3, seed })));
  check('时间戳 ±15ms + 掉 30% 帧（10 组）',
    timing.every(r => r.repCount === base.repCount && romOk(r)),
    timing.map(r => r.repCount).join(''));

  const low = SEEDS.slice(0, 5).map(seed => run(jitterTiming(resample(frames, 15), { jitterMs: 10, dropRate: 0.1, seed })));
  check('15 帧/秒 + 抖动 + 掉 10% 帧（5 组）', low.every(r => r.repCount === base.repCount), low.map(r => r.repCount).join(''));

  const allowed = c.noisyReps ?? [base.repCount];
  const noisy = SEEDS.map(seed => run(jitterLandmarks(frames, 0.003, seed)));
  check(`关键点抖动 σ=0.003（10 组，允许 ${allowed.join(' 或 ')} 次）`,
    noisy.every(r => allowed.includes(r.repCount)), noisy.map(r => r.repCount).join(''));

  const extremes = [0.006, 0.01, 0.02].map(sigma =>
    `σ=${sigma}: ${SEEDS.slice(0, 5).map(seed => run(jitterLandmarks(frames, sigma, seed)).repCount).join('')}`);
  console.log(`  · 仅供参考，更大抖动下的次数（5 组）：${extremes.join('  ')}`);
}

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exitCode = failed === 0 ? 0 : 1;
