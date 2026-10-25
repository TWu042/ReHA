/* global process */
// 训练结束评分入口 analyzeSession 的测试（网页结束训练时调用的就是它）。
//
// 运行：node tests/analyticsModule.test.js

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeSession } from '../src/analytics/analyticsModule.js';
import { getSessions, STORAGE_KEY } from '../src/analytics/storage.js';
import { EVENTS } from '../src/shared/contracts.js';
import { MOCK_DIR } from './analyzeRecordings.js';

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`);
}

function memoryStorage() {
  const data = {};
  return { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; } };
}

function fakeBus() {
  const events = [];
  return { events, emit: (type, data) => events.push({ type, data }) };
}

const example = JSON.parse(readFileSync(join(MOCK_DIR, 'session_completed_example.json'), 'utf8'));
const empty = { exercise: 'squat', repCount: 0, reps: [], baselineROM: null, averageROM: null, trackingQuality: 0.8 };

// 1. 第一次训练：有分数、存进历史、发事件；没有更早的记录，所以没有基线
{
  const storage = memoryStorage();
  const bus = fakeBus();
  const r = analyzeSession(example, { storage, bus, now: new Date('2026-10-25T20:00:00') });
  check('第一次：生成 summary', r.summary !== null, r.error ?? '');
  check('第一次：completedReps = repCount', r.summary?.completedReps === example.repCount);
  check('第一次：有一致性分数', Number.isFinite(r.summary?.consistencyScore));
  check('第一次：没有基线，幅度分为 null', r.summary?.baselineROM === null && r.summary?.rangeScore === null);
  check('第一次：存入历史', r.saved && getSessions(storage).length === 1);
  check('第一次：发出 session_summary', bus.events.length === 1 && bus.events[0].type === EVENTS.SESSION_SUMMARY && bus.events[0].data === r.summary);
  check('第一次：没有错误', r.error === null, r.error ?? '');

  // 2. 第二天再练：前一天的记录成为基线
  const r2 = analyzeSession(example, { storage, bus, now: new Date('2026-10-26T20:00:00') });
  check('第二天：用前一天当基线', r2.summary?.baselineROM === r.summary.averageROM, `baseline ${r2.summary?.baselineROM}`);
  check('第二天：有幅度分', Number.isFinite(r2.summary?.rangeScore));
  check('第二天：previousCount = 1', r2.previousCount === 1);
  check('第二天：历史共 2 条', getSessions(storage).length === 2);
}

// 3. 0 次深蹲：照常出 summary（averageROM 为 null），也存下来
{
  const storage = memoryStorage();
  const r = analyzeSession(empty, { storage, bus: fakeBus() });
  check('0 次：summary 正常，averageROM 为 null', r.summary?.completedReps === 0 && r.summary.averageROM === null, r.error ?? '');
  check('0 次：存入历史', r.saved);
}

// 4. 历史记录损坏：照常评分，但不覆盖原数据
{
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '[{"bad":true}]');
  const r = analyzeSession(example, { storage, bus: fakeBus() });
  check('历史损坏：仍生成 summary', r.summary !== null);
  check('历史损坏：不写入、原数据不变', !r.saved && storage.getItem(STORAGE_KEY) === '[{"bad":true}]');
  check('历史损坏：error 说明原因', /history/.test(r.error ?? ''));
}

// 5. 没有存储（隐私窗口）：照常评分，不保存
{
  const r = analyzeSession(example, { storage: null, bus: fakeBus() });
  check('无存储：仍生成 summary，不保存', r.summary !== null && !r.saved);
}

// 6. 坏数据：不抛错，summary 为 null，不发事件
{
  const bus = fakeBus();
  let r;
  try {
    r = analyzeSession(null, { storage: memoryStorage(), bus });
  } catch (e) {
    r = { thrown: e };
  }
  check('坏数据：不抛错', !r.thrown);
  check('坏数据：summary 为 null，不发事件', r.summary === null && bus.events.length === 0 && /summary/.test(r.error ?? ''));
}

console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
process.exit(failed ? 1 : 0);
