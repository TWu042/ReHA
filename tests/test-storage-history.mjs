import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("./src/analytics/storage.js", "utf8");

const url = "data:text/javascript," + encodeURIComponent(source);

const { STORAGE_KEY, getSessions } = await import(url);

// Fake localStorage: no real browser data is changed.
const data = new Map();

const storage = {
  getItem(key) {
    return data.has(key) ? data.get(key) : null;
  },
  setItem(key, value) {
    data.set(key, String(value));
  },
  removeItem(key) {
    data.delete(key);
  },
};

const validSession = {
  sessionId: "test-1",
  date: "2026-10-24",
  isMock: true,
  completedReps: 3,
  averageROM: 79,
  baselineROM: 66,
  trackingQuality: 0.95,
  rangeScore: 100,
  consistencyScore: 98,
  smoothnessScore: null,
  qualityScore: null,
};

// TEST 1: Valid stored history
data.set(STORAGE_KEY, JSON.stringify([validSession]));
assert.equal(getSessions(storage).length, 1);

// TEST 2: ROM stored as a string
data.set(
  STORAGE_KEY,
  JSON.stringify([{ ...validSession, averageROM: "seventy" }])
);
assert.throws(() => getSessions(storage), TypeError);

// TEST 3: Impossible score
data.set(STORAGE_KEY, JSON.stringify([{ ...validSession, qualityScore: 150 }]));
assert.throws(() => getSessions(storage), TypeError);

// TEST 4: Invalid date
data.set(
  STORAGE_KEY,
  JSON.stringify([{ ...validSession, date: "2026-02-30" }])
);
assert.throws(() => getSessions(storage), TypeError);

// TEST 5: Duplicate history
data.set(STORAGE_KEY, JSON.stringify([validSession, { ...validSession }]));
assert.throws(() => getSessions(storage), TypeError);

// TEST 6: Corrupted JSON
data.set(STORAGE_KEY, "{broken");
assert.throws(() => getSessions(storage), SyntaxError);

console.log("PASS: Stored history validation");
console.log("PASS: Invalid ROM, score and date rejected");
console.log("PASS: Duplicate history rejected");
console.log("PASS: Corrupted JSON rejected");
console.log("ALL STORAGE HISTORY TESTS PASSED");
