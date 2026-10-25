/* global process */
// 集成测试：录制 → P2 计数（session_completed）→ adapter → P3 评分 → 存历史，整条链路。
//
// 运行：node tests/pipeline.test.js

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eventBus } from '../src/shared/eventBus.js';
import { EVENTS } from '../src/shared/contracts.js';
import { replayToSessionCompleted, defaultAspectFor } from '../mock/replay.js';
import { toAnalyticsSession } from '../src/analytics/movementAdapter.js';
import { generateSessionSummary } from '../src/analytics/sessionSummary.js';
import { saveSession, getSessions } from '../src/analytics/storage.js';
import { mockSessions } from '../mock/sessions.js';
import { MOCK_DIR } from './analyzeRecordings.js';

let failed = 0;
function check(name, ok, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? '  ' + detail : ''}`);
}

// 内存版 localStorage
function memoryStorage() {
  const data = {};
  return { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; } };
}

const find = prefix => readFileSync(join(MOCK_DIR, (
  prefix.endsWith('.json') ? prefix : readdir().find(n => n.startsWith(prefix))
)), 'utf8');
import { readdirSync } from 'node:fs';
const readdir = () => readdirSync(MOCK_DIR);

const CASES = [
  { name: '合成标准 3 次',       file: 'synthetic_squat.json',     reps: 3, notDeep: 0 },
  { name: '合成：出框后站着回来', file: 'lost_at_bottom.json',      reps: 1, notDeep: 0 },
  { name: '真人正常 5 次',       file: 'p1_normal_5_',             reps: 4, notDeep: 1 },
  { name: '真人浅蹲 3 次',       file: 'p1_shallow_3_',            reps: 0, notDeep: 3 },
  { name: '真人底部停顿 2 次',   file: 'p1_bottom_pause_2_',       reps: 2, notDeep: 0 },
  { name: '真人出框与恢复',      file: 'p1_tracking_loss_',        reps: 0, notDeep: 0 },
];

const NOW = new Date('2026-10-26T10:00:00');   // 晚于模拟历史的日期
const storage = memoryStorage();
const seenEvents = [];
const off = eventBus.on(EVENTS.SESSION_COMPLETED, e => seenEvents.push(e));

for (const c of CASES) {
  console.log(`\n【${c.name}】`);
  const fileName = c.file.endsWith('.json') ? c.file : readdir().find(n => n.startsWith(c.file));
  const frames = JSON.parse(find(c.file));
  const result = replayToSessionCompleted(frames, { aspectRatio: defaultAspectFor(fileName) });

  // 1. P2 输出
  check('计数', result.repCount === c.reps, `期望 ${c.reps}，实际 ${result.repCount}`);
  check('session_completed 事件内容和返回值相同', seenEvents.at(-1) === result);
  const notDeep = (result.formFeedback ?? []).filter(f => f.code === 'not_deep_enough').length;
  check('"没蹲到底"提示次数', notDeep === c.notDeep, `期望 ${c.notDeep}，实际 ${notDeep}`);
  check('每次深蹲都有递增的 samples', result.reps.every(r =>
    r.samples.length > 1 && r.samples.every((s, i) => i === 0 || s.timestampMs > r.samples[i - 1].timestampMs)));
  check('durationMs 是整数', result.reps.every(r => Number.isInteger(r.durationMs)));

  // 2. adapter
  const session = toAnalyticsSession(result, { isMock: true, now: NOW, sessionId: `test-${c.file}` });
  check('adapter：completedReps = repCount = reps.length',
    session.completedReps === result.repCount && session.reps.length === result.repCount);
  check('adapter：date 为 YYYY-MM-DD，createdAt 为 ISO 时间',
    session.date === '2026-10-26' && !Number.isNaN(Date.parse(session.createdAt)));
  // 容差和 P3 sessionSummary.js 的校验一致：0.05 + 浮点误差
  check('adapter：averageROM 和每次 rom 的平均一致（误差 ≤ 0.05）',
    session.completedReps === 0 ? session.averageROM === null
      : Math.abs(session.averageROM - session.reps.reduce((s, r) => s + r.rom, 0) / session.completedReps) <= 0.05 + 1e-9);
  check('adapter：带上 angleSource 和 formFeedback',
    session.angleSource === result.angleSource && Array.isArray(session.formFeedback));

  // 3. P3 评分（用模拟历史当基线）
  let summary;
  try {
    summary = generateSessionSummary(session, mockSessions);
    check('P3 评分不报错', true);
  } catch (e) {
    check('P3 评分不报错', false, e.message);
    continue;
  }
  check('基线 = 最早三次模拟历史的平均（66°）', summary.baselineROM === 66, `${summary.baselineROM}`);
  if (c.reps > 0) {
    check('有动作时算出幅度分和一致性分',
      Number.isFinite(summary.rangeScore) && Number.isFinite(summary.consistencyScore),
      `幅度 ${summary.rangeScore?.toFixed(1)}，一致性 ${summary.consistencyScore?.toFixed(1)}`);
  } else {
    check('没有动作时幅度分、一致性分为 null', summary.rangeScore === null && summary.consistencyScore === null);
  }

  // 4. 存历史：只存精简字段，不存 samples
  saveSession(summary, storage);
  const saved = getSessions(storage).at(-1);
  check('存进历史，且不含 reps / samples', saved.sessionId === session.sessionId && !('reps' in saved) && !('samples' in saved));
}

off();

// 5. adapter 修正 averageROM 的取整误差
console.log('\n【adapter 的取整修正】');
const rounded = { repCount: 3, reps: [70.1, 70.1, 70.2].map(rom => ({ rom, durationMs: 1000, samples: [] })), averageROM: 70.2, trackingQuality: 1 };
let rawError = null;
try {
  generateSessionSummary({ ...rounded, sessionId: 'raw', date: '2026-10-26', isMock: true, completedReps: 3 }, []);
} catch (e) { rawError = e.message; }
check('不经 adapter 直接传：P3 会误报 averageROM 不一致', rawError?.includes('averageROM'), rawError ?? '没有报错');
const fixed = toAnalyticsSession(rounded, { now: NOW });
check('经过 adapter：averageROM 改为 70.1，P3 正常评分',
  fixed.averageROM === 70.1 && generateSessionSummary(fixed, []).consistencyScore > 99);

// 6. adapter 拒绝不合格的输入
console.log('\n【adapter 输入检查】');
for (const [label, bad] of [['null', null], ['数组', []], ['没有 reps', { repCount: 0 }]]) {
  let threw = false;
  try { toAnalyticsSession(bad); } catch (e) { threw = e instanceof TypeError; }
  check(`输入为 ${label} 时报 TypeError`, threw);
}
const auto = toAnalyticsSession({ repCount: 0, reps: [], averageROM: null, trackingQuality: null });
check('默认 isMock 为 false，自动生成 sessionId', auto.isMock === false && auto.sessionId.startsWith('session-'));

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`);
process.exitCode = failed === 0 ? 0 : 1;
