/* global process */
// ReHA integration regression test:
// Recording -> P2 counter -> Adapter -> P3 scoring -> Storage.
//
// Run: node tests/pipeline.test.js

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { eventBus } from "../src/shared/eventBus.js";
import { EVENTS } from "../src/shared/contracts.js";
import { replayToSessionCompleted, defaultAspectFor } from "../mock/replay.js";
import { toAnalyticsSession } from "../src/analytics/movementAdapter.js";
import { generateSessionSummary } from "../src/analytics/sessionSummary.js";
import { saveSession, getSessions } from "../src/analytics/storage.js";
import { MOCK_DIR } from "./analyzeRecordings.js";

let failed = 0;

function check(name, ok, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? "  " + detail : ""}`);
}

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const readdir = () => readdirSync(MOCK_DIR);

const find = (prefix) =>
  readFileSync(
    join(
      MOCK_DIR,
      prefix.endsWith(".json")
        ? prefix
        : readdir().find((n) => n.startsWith(prefix))
    ),
    "utf8"
  );

const CASES = [
  { name: "合成标准 3 次", file: "synthetic_squat.json", reps: 3, notDeep: 0 },
  {
    name: "合成：出框后站着回来",
    file: "lost_at_bottom.json",
    reps: 1,
    notDeep: 0,
  },
  { name: "真人正常 5 次", file: "p1_normal_5_", reps: 4, notDeep: 1 },
  { name: "真人浅蹲 3 次", file: "p1_shallow_3_", reps: 0, notDeep: 3 },
  {
    name: "真人底部停顿 2 次",
    file: "p1_bottom_pause_2_",
    reps: 2,
    notDeep: 0,
  },
  { name: "真人出框与恢复", file: "p1_tracking_loss_", reps: 0, notDeep: 0 },
];

const NOW = new Date("2026-10-26T10:00:00");
const storage = memoryStorage();
const seenEvents = [];

const off = eventBus.on(EVENTS.SESSION_COMPLETED, (e) => seenEvents.push(e));

// Explicitly synthetic history for testing.
// Do not relabel unknown historical recordings as 2D/3D.
const BASELINE_ROMS = [62, 66, 70];

function makeMatchingHistory(session) {
  return BASELINE_ROMS.map((rom, index) => ({
    sessionId: `baseline-${session.sessionId}-${index}`,
    date: `2026-10-${20 + index}`,
    createdAt: `2026-10-${20 + index}T10:00:00Z`,
    isMock: session.isMock,
    angleSource: session.angleSource,
    completedReps: 3,
    averageROM: rom,
  }));
}

function expectedBaseline(history) {
  const valid = history
    .filter(
      (s) =>
        s.completedReps > 0 && Number.isFinite(s.averageROM) && s.averageROM > 0
    )
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(0, 3);

  if (valid.length === 0) return null;

  return valid.reduce((sum, s) => sum + s.averageROM, 0) / valid.length;
}

function isScore(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

try {
  for (const c of CASES) {
    console.log(`\n【${c.name}】`);

    const fileName = c.file.endsWith(".json")
      ? c.file
      : readdir().find((n) => n.startsWith(c.file));

    const frames = JSON.parse(find(c.file));

    const result = replayToSessionCompleted(frames, {
      aspectRatio: defaultAspectFor(fileName),
    });

    // 1. P2 original regression checks.
    check(
      "计数",
      result.repCount === c.reps,
      `期望 ${c.reps}，实际 ${result.repCount}`
    );

    check(
      "session_completed 事件内容和返回值相同",
      seenEvents.at(-1) === result
    );

    const notDeep = (result.formFeedback ?? []).filter(
      (f) => f.code === "not_deep_enough"
    ).length;

    check(
      '"没蹲到底"提示次数',
      notDeep === c.notDeep,
      `期望 ${c.notDeep}，实际 ${notDeep}`
    );

    check(
      "每次深蹲都有递增的 samples",
      result.reps.every(
        (r) =>
          r.samples.length > 1 &&
          r.samples.every(
            (s, i) => i === 0 || s.timestampMs > r.samples[i - 1].timestampMs
          )
      )
    );

    check(
      "durationMs 是整数",
      result.reps.every((r) => Number.isInteger(r.durationMs))
    );

    // 2. Adapter original regression checks.
    const session = toAnalyticsSession(result, {
      isMock: true,
      now: NOW,
      sessionId: `test-${c.file}`,
    });

    check(
      "adapter：completedReps = repCount = reps.length",
      session.completedReps === result.repCount &&
        session.reps.length === result.repCount
    );

    check(
      "adapter：date 为 YYYY-MM-DD，createdAt 为 ISO 时间",
      session.date === "2026-10-26" &&
        !Number.isNaN(Date.parse(session.createdAt))
    );

    check(
      "adapter：averageROM 和每次 rom 的平均一致（误差 ≤ 0.05）",
      session.completedReps === 0
        ? session.averageROM === null
        : Math.abs(
            session.averageROM -
              session.reps.reduce((s, r) => s + r.rom, 0) /
                session.completedReps
          ) <=
            0.05 + 1e-9
    );

    check(
      "adapter：带上 angleSource 和 formFeedback",
      session.angleSource === result.angleSource &&
        Array.isArray(session.formFeedback)
    );

    // 3. P3 scoring with matching synthetic history.
    const matchingHistory = makeMatchingHistory(session);
    const baseline = expectedBaseline(matchingHistory);

    let summary;

    try {
      summary = generateSessionSummary(session, matchingHistory);
      check("P3 评分不报错", true);
    } catch (e) {
      check("P3 评分不报错", false, e.message);
      continue;
    }

    check(
      "基线 = 最早三次匹配来源的合成历史平均",
      summary.baselineROM === baseline,
      `期望 ${baseline}，实际 ${summary.baselineROM}`
    );

    check("angleSource 保持一致", summary.angleSource === session.angleSource);

    if (c.reps > 0) {
      check(
        "有动作时算出幅度分和一致性分",
        isScore(summary.rangeScore) && isScore(summary.consistencyScore),
        `幅度 ${summary.rangeScore?.toFixed(
          1
        )}，一致性 ${summary.consistencyScore?.toFixed(1)}`
      );

      check("有动作时 Smoothness 为 0–100", isScore(summary.smoothnessScore));

      check("有动作时 Quality 为 0–100", isScore(summary.qualityScore));
    } else {
      check(
        "没有动作时幅度分、一致性分为 null",
        summary.rangeScore === null && summary.consistencyScore === null
      );

      check(
        "0 次动作时 Smoothness 和 Quality 为 null",
        summary.smoothnessScore === null && summary.qualityScore === null
      );
    }

    // Reverse isolation tests.
    const incompatibleHistory = matchingHistory.map((s) => ({
      ...s,
      angleSource: session.angleSource === "2d" ? "3d" : "2d",
    }));

    check(
      "不同角度来源不能计算 Baseline",
      generateSessionSummary(session, incompatibleHistory).baselineROM === null
    );

    const unknownHistory = matchingHistory.map((s) => ({
      ...s,
      angleSource: null,
    }));

    if (session.angleSource !== null) {
      check(
        "未知来源不能混入明确来源的 Baseline",
        generateSessionSummary(session, unknownHistory).baselineROM === null
      );
    }

    // 4. Original compact storage check.
    saveSession(summary, storage);

    const saved = getSessions(storage).at(-1);

    check(
      "存进历史，且不含 reps / samples",
      saved.sessionId === session.sessionId &&
        !("reps" in saved) &&
        !("samples" in saved)
    );

    check(
      "历史保留 createdAt 和 angleSource",
      saved.createdAt === summary.createdAt &&
        saved.angleSource === summary.angleSource
    );
  }
} finally {
  off();
}

// 5. Original Adapter rounding regression.
console.log("\n【adapter 的取整修正】");

const rounded = {
  repCount: 3,
  reps: [70.1, 70.1, 70.2].map((rom) => ({
    rom,
    durationMs: 1000,
    samples: [],
  })),
  averageROM: 70.2,
  trackingQuality: 1,
};

let rawError = null;

try {
  generateSessionSummary(
    {
      ...rounded,
      sessionId: "raw",
      date: "2026-10-26",
      isMock: true,
      completedReps: 3,
    },
    []
  );
} catch (e) {
  rawError = e.message;
}

check(
  "不经 adapter 直接传：P3 会误报 averageROM 不一致",
  rawError?.includes("averageROM"),
  rawError ?? "没有报错"
);

const fixed = toAnalyticsSession(rounded, { now: NOW });

check(
  "经过 adapter：averageROM 改为 70.1，P3 正常评分",
  fixed.averageROM === 70.1 &&
    generateSessionSummary(fixed, []).consistencyScore > 99
);

// 6. Original Adapter invalid-input checks.
console.log("\n【adapter 输入检查】");

for (const [label, bad] of [
  ["null", null],
  ["数组", []],
  ["没有 reps", { repCount: 0 }],
]) {
  let threw = false;

  try {
    toAnalyticsSession(bad);
  } catch (e) {
    threw = e instanceof TypeError;
  }

  check(`输入为 ${label} 时报 TypeError`, threw);
}

const auto = toAnalyticsSession({
  repCount: 0,
  reps: [],
  averageROM: null,
  trackingQuality: null,
});

check(
  "默认 isMock 为 false，自动生成 sessionId",
  auto.isMock === false && auto.sessionId.startsWith("session-")
);

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 项失败`);

process.exitCode = failed === 0 ? 0 : 1;
