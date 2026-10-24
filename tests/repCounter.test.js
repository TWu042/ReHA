/* global process */
// 深蹲计数测试：读 mock/ 里的假数据，逐帧喂给计数器，对比期望次数。
//
// 运行：node tests/repCounter.test.js
// 假数据不存在时先运行：node mock/generateSquat.js
// 全部通过退出码为 0，有失败为 1。

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRepCounter } from '../src/movement/repCounter.js';

// 按本文件的位置找 mock/，终端在哪个文件夹运行都可以
const MOCK_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'mock');

const CASES = [
  { file: 'synthetic_squat.json', expected: 3 },
  { file: 'shallow_squat.json',   expected: 0 },
  { file: 'pause_at_bottom.json', expected: 3 },
  { file: 'half_rep.json',        expected: 0 },
  { file: 'tracking_lost.json',   expected: 3 },
  { file: 'lost_at_bottom.json',  expected: 1 },   // 蹲着出框、站着回来，不能多算
  { file: 'lost_return_crouched.json', expected: 1 },   // 蹲着出框、蹲着回来再站起，不能多算
];

let failed = 0;
console.log(`${'文件名'.padEnd(24)}  期望  实际  结果`);
console.log('-'.repeat(46));

for (const { file, expected } of CASES) {
  const path = join(MOCK_DIR, file);
  if (!existsSync(path)) {
    failed++;
    console.log(`${file.padEnd(27)} ${String(expected).padStart(3)}     -  缺少文件，先运行 node mock/generateSquat.js`);
    continue;
  }

  const counter = createRepCounter();
  for (const frame of JSON.parse(readFileSync(path, 'utf8'))) counter.processFrame(frame);
  const actual = counter.getState().repCount;
  const pass = actual === expected;
  if (!pass) failed++;

  console.log(`${file.padEnd(27)} ${String(expected).padStart(3)}  ${String(actual).padStart(4)}  ${pass ? '✓ 通过' : '✗ 失败'}`);
}

console.log('-'.repeat(46));
console.log(failed === 0 ? `全部通过（${CASES.length}/${CASES.length}）` : `${failed} 项失败`);
process.exitCode = failed === 0 ? 0 : 1;
