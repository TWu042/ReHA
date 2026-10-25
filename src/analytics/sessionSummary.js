import { calculateBaselineROM } from "./statistics.js";

import {
  calculateRangeScore,
  calculateConsistencyScore,
  calculateQualityScore,
} from "./scoring.js";

import { calculateSessionSmoothness } from "./smoothness.js";

/**
 * ReHA P3 - Session Analytics Summary
 *
 * Supports:
 * - Mock / Real isolation
 * - 2D / 3D / Unknown angle-source isolation
 * - Same-day chronological history
 * - ROM validation
 * - Experimental Smoothness and Quality scores
 */

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

function parseCreatedAt(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    )
  ) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeAngleSource(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (value === "2d" || value === "3d") {
    return value;
  }

  return undefined;
}

/**
 * Confirm a historical session occurred before
 * the current session and uses the same angle source.
 */
function isPreviousSession(history, current) {
  if (
    !history ||
    typeof history !== "object" ||
    Array.isArray(history) ||
    history.sessionId === current.sessionId ||
    history.isMock !== current.isMock ||
    normalizeAngleSource(history.angleSource) !==
      normalizeAngleSource(current.angleSource) ||
    !isValidDate(history.date)
  ) {
    return false;
  }

  const currentTime = parseCreatedAt(current.createdAt);
  const historyTime = parseCreatedAt(history.createdAt);

  if (currentTime !== null && historyTime !== null) {
    return historyTime < currentTime;
  }

  // Legacy date-only records:
  // include only strictly earlier calendar dates.
  return history.date < current.date;
}

export function generateSessionSummary(currentSession, previousSessions = []) {
  if (
    !currentSession ||
    typeof currentSession !== "object" ||
    Array.isArray(currentSession) ||
    !Array.isArray(previousSessions)
  ) {
    throw new TypeError("Invalid session input");
  }

  const {
    sessionId,
    date,
    createdAt,
    isMock,
    angleSource,
    completedReps,
    averageROM,
    reps,
    trackingQuality,
  } = currentSession;

  const normalizedSource = normalizeAngleSource(angleSource);

  if (
    typeof sessionId !== "string" ||
    !sessionId.trim() ||
    !isValidDate(date) ||
    (createdAt !== undefined &&
      createdAt !== null &&
      parseCreatedAt(createdAt) === null) ||
    typeof isMock !== "boolean" ||
    normalizedSource === undefined ||
    !Number.isInteger(completedReps) ||
    completedReps < 0 ||
    !Array.isArray(reps) ||
    completedReps !== reps.length ||
    (trackingQuality !== null &&
      (!Number.isFinite(trackingQuality) ||
        trackingQuality < 0 ||
        trackingQuality > 1))
  ) {
    throw new TypeError("Invalid current session structure");
  }

  // Validate counted repetitions.
  if (
    reps.some(
      (rep) =>
        !rep ||
        typeof rep !== "object" ||
        Array.isArray(rep) ||
        !Number.isFinite(rep.rom) ||
        rep.rom <= 0 ||
        !Number.isFinite(rep.durationMs) ||
        rep.durationMs <= 0
    )
  ) {
    throw new TypeError("Invalid repetition data");
  }

  // Validate P2 averageROM without overriding it.
  if (completedReps === 0) {
    if (averageROM !== null) {
      throw new TypeError("averageROM must be null when no reps are counted");
    }
  } else {
    const calculatedAverageROM =
      reps.reduce((sum, rep) => sum + rep.rom, 0) / completedReps;

    const ROM_TOLERANCE = 0.05 + 1e-9;

    if (
      !Number.isFinite(averageROM) ||
      averageROM <= 0 ||
      Math.abs(averageROM - calculatedAverageROM) > ROM_TOLERANCE
    ) {
      throw new TypeError("averageROM does not match counted repetitions");
    }
  }

  // Filter previous sessions.
  const validPreviousSessions = previousSessions.filter((session) =>
    isPreviousSession(session, currentSession)
  );

  // Use only matching angle-source history.
  const baselineROM = calculateBaselineROM(
    validPreviousSessions,
    isMock,
    normalizedSource
  );

  const rangeScore = calculateRangeScore(averageROM, baselineROM);

  const consistencyScore = calculateConsistencyScore(reps);

  const smoothnessScore = calculateSessionSmoothness(reps);

  const qualityScore = calculateQualityScore({
    rangeScore,
    smoothnessScore,
    consistencyScore,
  });

  return {
    sessionId,
    date,
    createdAt: createdAt ?? null,
    isMock,
    angleSource: normalizedSource,
    completedReps,
    averageROM,
    baselineROM,
    trackingQuality,
    rangeScore,
    consistencyScore,
    smoothnessScore,
    qualityScore,
  };
}
