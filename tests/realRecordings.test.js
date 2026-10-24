/* global process */
// 真人录制回归测试：用 P1 录的真实数据跑计数器，确认改阈值或改逻辑后结果没有变差。
//
// 运行：node tests/realRecordings.test.js
//
// 期望值按当前阈值（进入底部 133°、离开 143°）定：
//   正常 5 次 → 4：第一次只蹲到约 135°，按现在的阈值算"没蹲到底"
//   如果以后调阈值让它变成 5，说明变好了，把这里的期望改成 5 即可。
// 想看每份录制的细节：node tests/analyzeRecordings.js

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeFrames, loadRecording, MOCK_DIR } from './analyzeRecordings.js';

const CASES = [
  { prefix: 'p1_normal_5_',       expected: 4, note: '正常深蹲 5 次（第一次偏浅）' },
  { prefix: 'p1_shallow_3_',      expected: 0, note: '浅蹲 3 次' },
  { prefix: 'p1_bottom_pause_2_', expected: 2, note: '底部停 2 秒 × 2' },
  { prefix: 'p1_tracking_loss_',  expected: 0, note: '出框与恢复，没有完整深蹲' },
];

const files = existsSync(MOCK_DIR) ? readdirSync(MOCK_DIR) : [];
let failed = 0;
console.log(`${'录制'.padEnd(30)} 期望  实际  结果`);
console.log('-'.repeat(52));

for (const { prefix, expected, note } of CASES) {
  const name = files.find(n => n.startsWith(prefix) && n.endsWith('.json'));
  if (!name) {
    failed++;
    console.log(`${note.padEnd(26)}   ${String(expected).padStart(3)}     -  ✗ 找不到 mock/${prefix}*.json`);
    continue;
  }
  const { repCount } = analyzeFrames(loadRecording(join(MOCK_DIR, name)));
  const pass = repCount === expected;
  if (!pass) failed++;
  console.log(`${note.padEnd(26)}   ${String(expected).padStart(3)}  ${String(repCount).padStart(4)}  ${pass ? '✓ 通过' : '✗ 失败'}`);
}

console.log('-'.repeat(52));
console.log(failed === 0 ? `全部通过（${CASES.length}/${CASES.length}）` : `${failed} 项失败`);
process.exitCode = failed === 0 ? 0 : 1;
