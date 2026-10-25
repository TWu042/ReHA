/**
 * ReHA P3 - Pipeline Integration Regression
 *
 * P1 recording -> P2 counter -> Adapter ->
 * P3 summary -> compact Storage.
 *
 * Keeps 2D/3D baseline histories isolated.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { eventBus } from "../src/shared/eventBus.js";
import { EVENTS } from "../src/shared/contracts.js";
import { replayToSessionCompleted, defaultAspectFor } from "../mock/replay.js";
import { toAnalyticsSession } from "../src/analytics/movementAdapter.js";
import { generateSessionSummary } from "../src/analytics/sessionSummary.js";
import { saveSession, getSessions } from "../src/analytics/storage.js";
import { MOCK_DIR } from "./analyzeRecordings.js";

function memoryStorage() {
  const data = new Map();

  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

const CASES = [
  {
    name: "Synthetic normal",
    file: "synthetic_squat.json",
    expectedReps: 3,
  },
  {
    name: "Synthetic tracking loss",
    file: "lost_at_bottom.json",
    expectedReps: 1,
  },
  {
    name: "Real normal",
    file: "p1_normal_5_",
    expectedReps: 4,
  },
  {
    name: "Real shallow",
    file: "p1_shallow_3_",
    expectedReps: 0,
  },
  {
    name: "Real bottom pause",
    file: "p1_bottom_pause_2_",
    expectedReps: 2,
  },
  {
    name: "Real tracking loss",
    file: "p1_tracking_loss_",
    expectedReps: 0,
  },
];

const NOW = new Date("2026-10-26T10:00:00Z");

function makeMatchingHistory(angleSource) {
  return [62, 66, 70].map((rom, index) => ({
    sessionId: `baseline-${angleSource}-${index}`,
    date: `2026-10-${20 + index}`,
    createdAt: `2026-10-${20 + index}T10:00:00Z`,
    isMock: true,
    angleSource,
    completedReps: 3,
    averageROM: rom,
  }));
}

const seenEvents = [];

const unsubscribe = eventBus.on(EVENTS.SESSION_COMPLETED, (result) =>
  seenEvents.push(result)
);

try {
  for (const testCase of CASES) {
    console.log(`\n[${testCase.name}]`);

    const filename = testCase.file.endsWith(".json")
      ? testCase.file
      : readdirSync(MOCK_DIR).find((name) => name.startsWith(testCase.file));

    assert.ok(filename, "Recording file must exist");

    const frames = JSON.parse(readFileSync(join(MOCK_DIR, filename), "utf8"));

    const result = replayToSessionCompleted(frames, {
      aspectRatio: defaultAspectFor(filename),
    });

    assert.equal(result.repCount, testCase.expectedReps);
    assert.equal(seenEvents.at(-1), result);

    const session = toAnalyticsSession(result, {
      isMock: true,
      now: NOW,
      sessionId: `p3-${filename}`,
    });

    assert.equal(session.completedReps, result.repCount);
    assert.equal(session.reps.length, result.repCount);
    assert.equal(session.angleSource, result.angleSource);

    const matchingHistory = makeMatchingHistory(session.angleSource);

    const summary = generateSessionSummary(session, matchingHistory);

    assert.equal(summary.baselineROM, 66);
    assert.equal(summary.angleSource, session.angleSource);

    if (testCase.expectedReps > 0) {
      assert.ok(Number.isFinite(summary.rangeScore));
      assert.ok(Number.isFinite(summary.consistencyScore));
      assert.ok(Number.isFinite(summary.smoothnessScore));
      assert.ok(Number.isFinite(summary.qualityScore));
    } else {
      assert.equal(summary.rangeScore, null);
      assert.equal(summary.consistencyScore, null);
      assert.equal(summary.smoothnessScore, null);
      assert.equal(summary.qualityScore, null);
    }

    const storage = memoryStorage();

    saveSession(summary, storage);

    const saved = getSessions(storage)[0];

    assert.equal(saved.sessionId, summary.sessionId);
    assert.equal(saved.angleSource, summary.angleSource);
    assert.equal(saved.createdAt, summary.createdAt);
    assert.equal("reps" in saved, false);
    assert.equal("samples" in saved, false);

    console.log("PASS: Count and adapter");
    console.log("PASS: Angle-source baseline");
    console.log("PASS: Smoothness and quality");
    console.log("PASS: Compact storage");
    console.log({
      reps: summary.completedReps,
      baselineROM: summary.baselineROM,
      smoothnessScore: summary.smoothnessScore,
      qualityScore: summary.qualityScore,
    });
  }

  console.log("\nALL P3 PIPELINE TESTS PASSED");
} finally {
  unsubscribe();
}
