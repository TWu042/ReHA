import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Load storage.js without changing project settings
const source = readFileSync("./src/analytics/storage.js", "utf8");

const url = "data:text/javascript," + encodeURIComponent(source);

const { STORAGE_KEY, getSessions, saveSession, clearSessions } = await import(
  url
);

// Create fake localStorage for testing
const data = new Map([["rehab_sessions_v1", "legacy"]]);

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

// TEST 1: Check storage version
assert.equal(STORAGE_KEY, "rehab_sessions_v2");

// TEST 2: Empty history
assert.deepEqual(getSessions(storage), []);

// Prepare a session with raw samples
const session = {
  sessionId: "mock-1",
  date: "2026-10-24",
  isMock: true,
  completedReps: 3,
  averageROM: 79,
  baselineROM: 66,
  trackingQuality: 1,
  rangeScore: 100,
  consistencyScore: 98,
  smoothnessScore: null,
  qualityScore: null,
  samples: [{ timestampMs: 300, kneeAngleDeg: 159 }],
  reps: [
    {
      rom: 79,
      samples: [{ timestampMs: 300 }],
    },
  ],
};

// TEST 3: Save and read
const saved = saveSession(session, storage);

assert.equal(saved.sessionId, "mock-1");
assert.equal(getSessions(storage).length, 1);
assert.equal(getSessions(storage)[0].averageROM, 79);

// TEST 4: Never save samples or full reps
const storedJSON = data.get(STORAGE_KEY);

assert.equal(storedJSON.includes("samples"), false);
assert.equal(storedJSON.includes('"reps"'), false);

// TEST 5: Reject duplicate session
assert.throws(() => saveSession(session, storage), /already saved/);

// TEST 6: Reject contradictory ROM
assert.throws(
  () =>
    saveSession(
      {
        ...session,
        sessionId: "bad-1",
        averageROM: null,
      },
      storage
    ),
  TypeError
);

// TEST 7: Zero repetitions cannot have ROM = 0
assert.throws(
  () =>
    saveSession(
      {
        ...session,
        sessionId: "bad-2",
        completedReps: 0,
        averageROM: 0,
      },
      storage
    ),
  TypeError
);

// TEST 8: Corrupted JSON
data.set(STORAGE_KEY, "{broken");

assert.throws(() => getSessions(storage), SyntaxError);

// TEST 9: Clear v2 without deleting legacy data
data.delete(STORAGE_KEY);
saveSession(session, storage);
clearSessions(storage);

assert.deepEqual(getSessions(storage), []);
assert.equal(data.get("rehab_sessions_v1"), "legacy");

console.log("PASS: Storage basic and edge cases");
console.log("PASS: Raw samples excluded");
console.log("PASS: Duplicate protection");
console.log("PASS: Legacy data preserved");
console.log("ALL STORAGE TESTS PASSED");
