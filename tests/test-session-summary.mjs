import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = async (path) => {
  const source = readFileSync(path, "utf8");
  const url = "data:text/javascript," + encodeURIComponent(source);
  return import(url);
};

// Load Mock Data
const { mockSessions } = await load("./mock/sessions.js");

// Load dependencies
const statisticsSource = readFileSync("./src/analytics/statistics.js", "utf8");
const scoringSource = readFileSync("./src/analytics/scoring.js", "utf8");
let summarySource = readFileSync("./src/analytics/sessionSummary.js", "utf8");

// Replace relative imports with data URLs for standalone testing
const statisticsURL =
  "data:text/javascript," + encodeURIComponent(statisticsSource);
const scoringURL = "data:text/javascript," + encodeURIComponent(scoringSource);

summarySource = summarySource
  .replace("./statistics.js", statisticsURL)
  .replace("./scoring.js", scoringURL);

const summaryURL = "data:text/javascript," + encodeURIComponent(summarySource);

const { generateSessionSummary } = await import(summaryURL);

// Test fifth session
const current = mockSessions[4];
const history = mockSessions.slice(0, 4);

const summary = generateSessionSummary(current, history);

assert.equal(summary.sessionId, "mock-5");
assert.equal(summary.completedReps, 3);
assert.equal(summary.averageROM, 79);
assert.equal(summary.baselineROM, 66);
assert.equal(summary.rangeScore, 100);
assert.equal(summary.smoothnessScore, null);
assert.equal(summary.qualityScore, null);
assert.equal(summary.isMock, true);

assert.ok(summary.consistencyScore >= 0 && summary.consistencyScore <= 100);

console.log("PASS: Session Summary");
console.log(summary);
