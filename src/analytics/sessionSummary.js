import { calculateBaselineROM } from "./statistics.js";

import {
  calculateRangeScore,
  calculateConsistencyScore,
  calculateQualityScore,
} from "./scoring.js";

/**
 * Generate an analytics summary for one completed session.
 *
 * currentSession: current training data
 * previousSessions: historical sessions before this training
 *
 * This is an experimental analytics report,
 * not a clinically validated rehabilitation assessment.
 */
export function generateSessionSummary(currentSession, previousSessions = []) {
  // STEP 1: Validate input objects
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
    isMock,
    completedReps,
    averageROM,
    reps,
    trackingQuality,
  } = currentSession;

  // STEP 2: Validate session fields
  if (
    typeof sessionId !== "string" ||
    !sessionId.trim() ||
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    typeof isMock !== "boolean" ||
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

  // STEP 3: Validate each counted repetition
  if (
    reps.some(
      (rep) =>
        !rep ||
        typeof rep !== "object" ||
        !Number.isFinite(rep.rom) ||
        rep.rom <= 0 ||
        !Number.isFinite(rep.durationMs) ||
        rep.durationMs <= 0
    )
  ) {
    throw new TypeError("Invalid repetition data");
  }

  // STEP 4: Verify averageROM
  if (completedReps === 0) {
    if (averageROM !== null) {
      throw new TypeError(
        "averageROM must be null when no repetitions are counted"
      );
    }
  } else {
    const calculatedAverageROM =
      reps.reduce((sum, rep) => sum + rep.rom, 0) / completedReps;

    // Allow normal rounding to one decimal place
    const ROM_TOLERANCE = 0.05 + 1e-9;

    if (
      !Number.isFinite(averageROM) ||
      averageROM <= 0 ||
      Math.abs(averageROM - calculatedAverageROM) > ROM_TOLERANCE
    ) {
      throw new TypeError("averageROM does not match counted repetitions");
    }
  }

  // STEP 5: Use only previous sessions of the same type
  const validPreviousSessions = previousSessions.filter(
    (session) =>
      session &&
      session.sessionId !== sessionId &&
      typeof session.date === "string" &&
      session.date < date &&
      session.isMock === isMock
  );

  // STEP 6: Calculate personal baseline
  const baselineROM = calculateBaselineROM(validPreviousSessions, isMock);

  // STEP 7: Calculate movement scores
  const rangeScore = calculateRangeScore(averageROM, baselineROM);

  const consistencyScore = calculateConsistencyScore(reps);

  // P2 provides samples, but smoothness calculation
  // has not been implemented in P3 yet.
  const smoothnessScore = null;

  // Missing smoothness means no overall score yet
  const qualityScore = calculateQualityScore({
    rangeScore,
    smoothnessScore,
    consistencyScore,
  });

  // STEP 8: Return summary for Dashboard and storage
  return {
    sessionId,
    date,
    isMock,
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
