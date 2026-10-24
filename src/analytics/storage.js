/**
 * ReHA P3 - Session History Storage
 *
 * Stores compact training summaries only.
 * Never stores raw samples or camera frames.
 */

export const STORAGE_KEY = "rehab_sessions_v2";

const SAVED_FIELDS = [
  "sessionId",
  "date",
  "isMock",
  "completedReps",
  "averageROM",
  "baselineROM",
  "trackingQuality",
  "rangeScore",
  "consistencyScore",
  "smoothnessScore",
  "qualityScore",
];

// Check whether a date is a real YYYY-MM-DD date.
function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

// Validate a compact training record.
function isValidSession(session) {
  if (
    !session ||
    typeof session !== "object" ||
    Array.isArray(session) ||
    typeof session.sessionId !== "string" ||
    !session.sessionId.trim() ||
    !isValidDate(session.date) ||
    typeof session.isMock !== "boolean" ||
    !Number.isInteger(session.completedReps) ||
    session.completedReps < 0
  ) {
    return false;
  }

  // No counted reps means averageROM must be null.
  if (session.completedReps === 0) {
    if (session.averageROM !== null) {
      return false;
    }
  } else if (!Number.isFinite(session.averageROM) || session.averageROM <= 0) {
    return false;
  }

  // Personal baseline can be unavailable.
  if (
    session.baselineROM !== null &&
    (!Number.isFinite(session.baselineROM) || session.baselineROM <= 0)
  ) {
    return false;
  }

  // No frames received: trackingQuality can be null.
  if (
    session.trackingQuality !== null &&
    (!Number.isFinite(session.trackingQuality) ||
      session.trackingQuality < 0 ||
      session.trackingQuality > 1)
  ) {
    return false;
  }

  // Scores must be null or numbers between 0 and 100.
  const scoreFields = [
    "rangeScore",
    "consistencyScore",
    "smoothnessScore",
    "qualityScore",
  ];

  for (const field of scoreFields) {
    const score = session[field];

    if (
      score !== null &&
      (!Number.isFinite(score) || score < 0 || score > 100)
    ) {
      return false;
    }
  }

  return true;
}

// Keep only approved fields.
function compactSession(session) {
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    throw new TypeError("Invalid session for storage");
  }

  const compact = {};

  for (const field of SAVED_FIELDS) {
    compact[field] = session[field] === undefined ? null : session[field];
  }

  if (!isValidSession(compact)) {
    throw new TypeError("Invalid session for storage");
  }

  return compact;
}

// Read and validate stored history.
export function getSessions(storage = globalThis.localStorage) {
  const raw = storage.getItem(STORAGE_KEY);

  if (raw === null) {
    return [];
  }

  const sessions = JSON.parse(raw);

  if (
    !Array.isArray(sessions) ||
    sessions.some((session) => !isValidSession(session))
  ) {
    throw new TypeError("Invalid stored session history");
  }

  // Detect duplicate saved records.
  const ids = new Set();

  for (const session of sessions) {
    const key = JSON.stringify([session.sessionId, session.isMock]);

    if (ids.has(key)) {
      throw new TypeError("Duplicate stored session");
    }

    ids.add(key);
  }

  return sessions;
}

// Save one compact training record.
export function saveSession(session, storage = globalThis.localStorage) {
  const compact = compactSession(session);
  const sessions = getSessions(storage);

  const duplicate = sessions.some(
    (existing) =>
      existing.sessionId === compact.sessionId &&
      existing.isMock === compact.isMock
  );

  if (duplicate) {
    throw new Error("Session already saved");
  }

  const updated = [...sessions, compact];

  storage.setItem(STORAGE_KEY, JSON.stringify(updated));

  return compact;
}

// Clear v2 history only.
export function clearSessions(storage = globalThis.localStorage) {
  storage.removeItem(STORAGE_KEY);
}
