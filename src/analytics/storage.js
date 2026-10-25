/**
 * ReHA P3 - Session History Storage
 *
 * Stores compact analytics summaries.
 * Separates mock/real and 2D/3D/unknown sources.
 * Never stores raw samples or camera frames.
 */

export const STORAGE_KEY = "rehab_sessions_v2";

const SAVED_FIELDS = [
  "sessionId",
  "date",
  "createdAt",
  "isMock",
  "angleSource",
  "completedReps",
  "averageROM",
  "baselineROM",
  "trackingQuality",
  "rangeScore",
  "consistencyScore",
  "smoothnessScore",
  "qualityScore",
];

const SCORE_FIELDS = [
  "rangeScore",
  "consistencyScore",
  "smoothnessScore",
  "qualityScore",
];

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);

  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function isValidCreatedAt(value) {
  if (value === null || value === undefined) {
    return true;
  }

  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    )
  ) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}

function isValidAngleSource(value) {
  return (
    value === undefined || value === null || value === "2d" || value === "3d"
  );
}

function isValidSession(session) {
  if (
    !session ||
    typeof session !== "object" ||
    Array.isArray(session) ||
    typeof session.sessionId !== "string" ||
    !session.sessionId.trim() ||
    !isValidDate(session.date) ||
    !isValidCreatedAt(session.createdAt) ||
    !isValidAngleSource(session.angleSource) ||
    typeof session.isMock !== "boolean" ||
    !Number.isInteger(session.completedReps) ||
    session.completedReps < 0
  ) {
    return false;
  }

  if (session.completedReps === 0) {
    if (session.averageROM !== null) {
      return false;
    }
  } else if (!Number.isFinite(session.averageROM) || session.averageROM <= 0) {
    return false;
  }

  if (
    session.baselineROM !== null &&
    (!Number.isFinite(session.baselineROM) || session.baselineROM <= 0)
  ) {
    return false;
  }

  if (
    session.trackingQuality !== null &&
    (!Number.isFinite(session.trackingQuality) ||
      session.trackingQuality < 0 ||
      session.trackingQuality > 1)
  ) {
    return false;
  }

  for (const field of SCORE_FIELDS) {
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

  storage.setItem(STORAGE_KEY, JSON.stringify([...sessions, compact]));

  return compact;
}

export function clearSessions(storage = globalThis.localStorage) {
  storage.removeItem(STORAGE_KEY);
}
