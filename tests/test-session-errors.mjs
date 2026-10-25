import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const toURL = (source) => "data:text/javascript," + encodeURIComponent(source);

// Load dependencies.
const statisticsURL = toURL(read("./src/analytics/statistics.js"));

const scoringURL = toURL(read("./src/analytics/scoring.js"));

const jitterURL = toURL(read("./src/analytics/jitter.js"));

const smoothnessURL = toURL(
  read("./src/analytics/smoothness.js").replace("./jitter.js", jitterURL)
);

// Load Session Summary with all dependencies resolved.
const summarySource = read("./src/analytics/sessionSummary.js")
  .replace("./statistics.js", statisticsURL)
  .replace("./scoring.js", scoringURL)
  .replace("./smoothness.js", smoothnessURL);

const { generateSessionSummary } = await import(toURL(summarySource));

// Valid test session.
const validSession = {
  sessionId: "test-1",
  date: "2026-10-24",
  createdAt: null,
  isMock: true,
  angleSource: null,
  completedReps: 3,
  reps: [
    { rom: 60, durationMs: 2400 },
    { rom: 62, durationMs: 2500 },
    { rom: 64, durationMs: 2300 },
  ],
  averageROM: 62,
  trackingQuality: 0.95,
};

// TEST 1: Valid session.
assert.equal(generateSessionSummary(validSession).averageROM, 62);

// TEST 2: Incorrect averageROM rejected.
assert.throws(
  () =>
    generateSessionSummary({
      ...validSession,
      averageROM: 90,
    }),
  TypeError
);

// TEST 3: Zero reps cannot have averageROM = 0.
assert.throws(
  () =>
    generateSessionSummary({
      ...validSession,
      completedReps: 0,
      reps: [],
      averageROM: 0,
    }),
  TypeError
);

// TEST 4: trackingQuality above 1 rejected.
assert.throws(
  () =>
    generateSessionSummary({
      ...validSession,
      trackingQuality: 1.5,
    }),
  TypeError
);

// TEST 5: Zero repetitions with null ROM.
const emptyResult = generateSessionSummary({
  ...validSession,
  completedReps: 0,
  reps: [],
  averageROM: null,
});

assert.equal(emptyResult.averageROM, null);
assert.equal(emptyResult.qualityScore, null);
assert.equal(emptyResult.smoothnessScore, null);

// TEST 6: No tracking frames.
const noFramesSession = {
  ...validSession,
  completedReps: 0,
  reps: [],
  averageROM: null,
  trackingQuality: null,
};

const noFramesSummary = generateSessionSummary(noFramesSession);

assert.equal(noFramesSummary.trackingQuality, null);
assert.equal(noFramesSummary.averageROM, null);
assert.equal(noFramesSummary.qualityScore, null);

// TEST 7: Missing trackingQuality rejected.
assert.throws(
  () =>
    generateSessionSummary({
      ...validSession,
      trackingQuality: undefined,
    }),
  TypeError
);

// TEST 8: Rounded averageROM accepted.
const roundedSession = {
  ...validSession,
  reps: [
    { rom: 78.1, durationMs: 1567 },
    { rom: 78.7, durationMs: 1600 },
    { rom: 79.4, durationMs: 1700 },
  ],
  averageROM: 78.7,
};

assert.equal(generateSessionSummary(roundedSession).averageROM, 78.7);

// TEST 9: Invalid duration rejected.
assert.throws(
  () =>
    generateSessionSummary({
      ...validSession,
      reps: [
        { rom: 60, durationMs: -100 },
        { rom: 62, durationMs: 2500 },
        { rom: 64, durationMs: 2300 },
      ],
    }),
  TypeError
);

// TEST 10: Invalid createdAt rejected.
assert.throws(
  () =>
    generateSessionSummary({
      ...validSession,
      createdAt: "not-a-date",
    }),
  TypeError
);

// TEST 11: Invalid angleSource rejected.
assert.throws(
  () =>
    generateSessionSummary({
      ...validSession,
      angleSource: "4d",
    }),
  TypeError
);

console.log("PASS: Session Summary error handling");
console.log("PASS: Null trackingQuality");
console.log("PASS: Rounded averageROM");
console.log("PASS: Invalid createdAt");
console.log("PASS: Invalid angleSource");
console.log("ALL SESSION ERROR TESTS PASSED");
