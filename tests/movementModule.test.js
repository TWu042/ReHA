/* global process */
// 模块 2 事件测试：用假数据模拟 P1 发 pose_frame，检查 rep_completed 和 session_completed。
//
// 运行：node tests/movementModule.test.js
// 加 --write-example 会顺便把 session_completed 的内容存成 mock/session_completed_example.json（给 P3 用）

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { eventBus } from '../src/shared/eventBus.js';
import { EVENTS } from '../src/shared/contracts.js';
import { startMovement, stopMovement } from '../src/movement/movementModule.js';

const MOCK_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'mock');
const load = name => JSON.parse(readFileSync(join(MOCK_DIR, name), 'utf8'));

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`);
}

const repEvents = [];
const sessionEvents = [];
eventBus.on(EVENTS.REP_COMPLETED, e => repEvents.push(e));
eventBus.on(EVENTS.SESSION_COMPLETED, e => sessionEvents.push(e));

// 1. 没开始就结束：不发事件
check('没开始时 stopMovement 返回 null', stopMovement() === null);

// 2. 标准深蹲 3 次
startMovement();
for (const f of load('synthetic_squat.json')) eventBus.emit(EVENTS.POSE_FRAME, f);
const result = stopMovement();

check('rep_completed 发了 3 次', repEvents.length === 3, `实际 ${repEvents.length} 次`);
check('repCount 依次是 1、2、3', repEvents.map(e => e.repCount).join() === '1,2,3');
check('rep_completed 字段齐全', repEvents.every(e =>
  e.type === 'rep_completed' && typeof e.timestampMs === 'number' && typeof e.rom === 'number'));
check('session_completed 发了 1 次', sessionEvents.length === 1);
check('stopMovement 返回值和事件内容相同', sessionEvents[0] === result);
check('MovementResult 次数为 3', result.repCount === 3 && result.reps.length === 3);
check('averageROM 在 70–90° 之间', result.averageROM >= 70 && result.averageROM <= 90, `${result.averageROM}°`);
check('trackingQuality 为 1', result.trackingQuality === 1, `${result.trackingQuality}`);

// 3. 结束后再来帧：不再计数
for (const f of load('synthetic_squat.json')) eventBus.emit(EVENTS.POSE_FRAME, f);
check('结束后不再响应 pose_frame', repEvents.length === 3);

// 4. 丢失追踪：照样 3 次，追踪质量下降
repEvents.length = 0;
startMovement();
for (const f of load('tracking_lost.json')) eventBus.emit(EVENTS.POSE_FRAME, f);
const lost = stopMovement();
check('tracking_lost 计数 3 次', lost.repCount === 3);
check('tracking_lost 的 trackingQuality < 1', lost.trackingQuality < 1, `${lost.trackingQuality}`);

// 5. 一帧都没收到
startMovement();
const empty = stopMovement();
check('没有帧时 averageROM 和 trackingQuality 为 null',
  empty.repCount === 0 && empty.averageROM === null && empty.trackingQuality === null);

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exitCode = failed === 0 ? 0 : 1;

if (process.argv.includes('--write-example')) {
  const out = join(MOCK_DIR, 'session_completed_example.json');
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`示例已写入 ${out}`);
}
