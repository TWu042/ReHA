import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// 读取你的 Mock Sessions 文件
const source = readFileSync("./mock/sessions.js", "utf8");

// 将 JavaScript 文件作为 ES Module 加载
const moduleUrl = "data:text/javascript," + encodeURIComponent(source);

const { mockSessions } = await import(moduleUrl);

// 检查训练记录数量
assert.ok(Array.isArray(mockSessions));
assert.equal(mockSessions.length, 5);

const ids = new Set();

for (const session of mockSessions) {
  // 检查是否标记为模拟数据
  assert.equal(session.isMock, true);

  // 检查训练 ID 是否唯一
  assert.equal(typeof session.sessionId, "string");
  assert.ok(!ids.has(session.sessionId));
  ids.add(session.sessionId);

  // 检查日期格式
  assert.match(session.date, /^\d{4}-\d{2}-\d{2}$/);

  // 检查动作次数
  assert.ok(Array.isArray(session.reps));
  assert.equal(session.completedReps, session.reps.length);

  // 检查追踪质量
  assert.ok(Number.isFinite(session.trackingQuality));
  assert.ok(session.trackingQuality >= 0 && session.trackingQuality <= 1);

  // 检查每次深蹲数据
  for (const rep of session.reps) {
    assert.ok(Number.isFinite(rep.rom));
    assert.ok(rep.rom > 0);

    assert.ok(Number.isFinite(rep.durationMs));
    assert.ok(rep.durationMs > 0);
  }

  // 重新计算平均 ROM
  const calculatedROM =
    session.reps.length > 0
      ? session.reps.reduce((sum, rep) => sum + rep.rom, 0) /
        session.reps.length
      : null;

  // 与 Mock Data 中的 averageROM 比较
  assert.equal(session.averageROM, calculatedROM);

  // 尚未计算的评分应该是 null
  assert.equal(session.qualityScore, null);
  assert.equal(session.scoreBreakdown, null);
}

console.log("PASS: 5 mock sessions validated");

console.log(
  "Average ROM:",
  mockSessions.map((session) => session.averageROM)
);
