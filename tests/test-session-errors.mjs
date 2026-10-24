import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Load JavaScript files as ES Modules
const read = (path) => readFileSync(path, "utf8");

const toURL = (source) => "data:text/javascript," + encodeURIComponent(source);

// Load dependencies
const statisticsURL = toURL(read("./src/analytics/statistics.js"));

const scoringURL = toURL(read("./src/analytics/scoring.js"));

// Load Session Summary with its dependencies
const summarySource = read("./src/analytics/sessionSummary.js")
  .replace("./statistics.js", statisticsURL)
  .replace("./scoring.js", scoringURL);

const { generateSessionSummary } = await import(toURL(summarySource));

// Valid test session
const validSession = {
  sessionId: "test-1",
  date: "2026-10-24",
  isMock: true,
  completedReps: 3,
  reps: [
    { rom: 60, durationMs: 2400 },
    { rom: 62, durationMs: 2500 },
    { rom: 64, durationMs: 2300 },
  ],
  averageROM: 62,
  trackingQuality: 0.95,
};

// TEST 1: Valid session should work
assert.equal(generateSessionSummary(validSession).averageROM, 62);

// TEST 2: Incorrect average ROM must be rejected
assert.throws(
  () =>
    generateSessionSummary({
      ...validSession,
      averageROM: 90,
    }),
  TypeError
);

// TEST 3: Zero repetitions cannot have averageROM = 0
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

// TEST 4: trackingQuality above 1 must be rejected
assert.throws(
  () =>
    generateSessionSummary({
      ...validSession,
      trackingQuality: 1.5,
    }),
  TypeError
);

// TEST 5: Zero repetitions with null averageROM is valid
const emptyResult = generateSessionSummary({
  ...validSession,
  completedReps: 0,
  reps: [],
  averageROM: null,
});

assert.equal(emptyResult.averageROM, null);
assert.equal(emptyResult.qualityScore, null);

// TEST 6: P2 received no frames
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

// TEST 7: Missing trackingQuality is not null
assert.throws(
  () =>
    generateSessionSummary({
      ...validSession,
      trackingQuality: undefined,
    }),
  TypeError
);

// TEST 8: Rounded averageROM from P2 is accepted
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

// TEST 9: Invalid repetition duration is rejected
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

console.log("PASS: Session Summary error handling");
console.log("PASS: Null trackingQuality");
console.log("PASS: Rounded averageROM");
console.log("ALL SESSION ERROR TESTS PASSED");
