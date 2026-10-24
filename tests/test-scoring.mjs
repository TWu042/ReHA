import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Load scoring.js without changing project configuration
const source = readFileSync("./src/analytics/scoring.js", "utf8");

const url = "data:text/javascript," + encodeURIComponent(source);

const {
  calculateRangeScore,
  calculateConsistencyScore,
  calculateQualityScore,
} = await import(url);

// Test 1: Range Score
assert.equal(calculateRangeScore(79, 66), 100);
assert.equal(calculateRangeScore(33, 66), 50);
assert.equal(calculateRangeScore(null, 66), null);
assert.equal(calculateRangeScore(50, 0), null);

console.log("PASS: Range Score");

// Test 2: Consistency Score
assert.equal(
  calculateConsistencyScore([{ rom: 60 }, { rom: 60 }, { rom: 60 }]),
  100
);

assert.equal(calculateConsistencyScore([]), null);

assert.equal(calculateConsistencyScore([{ rom: null }]), null);

const consistency = calculateConsistencyScore([
  { rom: 60 },
  { rom: 62 },
  { rom: 64 },
]);

assert.ok(consistency > 97 && consistency < 99);

console.log("PASS: Consistency Score");

// Test 3: Overall Quality Score
assert.equal(
  calculateQualityScore({
    rangeScore: 100,
    smoothnessScore: 80,
    consistencyScore: 90,
  }),
  91
);

assert.equal(
  calculateQualityScore({
    rangeScore: 100,
    smoothnessScore: null,
    consistencyScore: 90,
  }),
  null
);

assert.equal(
  calculateQualityScore({
    rangeScore: 110,
    smoothnessScore: 80,
    consistencyScore: 90,
  }),
  null
);

console.log("PASS: Quality Score");
console.log("ALL SCORING TESTS PASSED");
