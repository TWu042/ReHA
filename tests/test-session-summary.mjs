import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Load source files as standalone ES modules.
const read = (path) => readFileSync(path, "utf8");

const toURL = (source) => "data:text/javascript," + encodeURIComponent(source);

// Load mock sessions.
const mockURL = toURL(read("./mock/sessions.js"));
const { mockSessions } = await import(mockURL);

// Load dependency modules.
const statisticsURL = toURL(read("./src/analytics/statistics.js"));

const scoringURL = toURL(read("./src/analytics/scoring.js"));

const jitterURL = toURL(read("./src/analytics/jitter.js"));

const smoothnessURL = toURL(
  read("./src/analytics/smoothness.js").replace("./jitter.js", jitterURL)
);

// Replace every relative import in Session Summary.
const summarySource = read("./src/analytics/sessionSummary.js")
  .replace("./statistics.js", statisticsURL)
  .replace("./scoring.js", scoringURL)
  .replace("./smoothness.js", smoothnessURL);

const summaryURL = toURL(summarySource);

const { generateSessionSummary } = await import(summaryURL);

// Test fifth mock session against earlier history.
const current = mockSessions[4];
const history = mockSessions.slice(0, 4);

const summary = generateSessionSummary(current, history);

// Preserve original regression expectations.
assert.equal(summary.sessionId, "mock-5");
assert.equal(summary.completedReps, 3);
assert.equal(summary.averageROM, 79);
assert.equal(summary.baselineROM, 66);
assert.equal(summary.rangeScore, 100);
assert.equal(summary.isMock, true);

// Legacy mock sessions have no known angle source.
assert.equal(summary.angleSource, null);

// No samples means no invented smoothness score.
assert.equal(summary.smoothnessScore, null);
assert.equal(summary.qualityScore, null);

// Consistency should still be calculated.
assert.ok(
  Number.isFinite(summary.consistencyScore) &&
    summary.consistencyScore >= 0 &&
    summary.consistencyScore <= 100
);

console.log("PASS: Session Summary");
console.log(summary);
console.log("ALL SESSION SUMMARY TESTS PASSED");
