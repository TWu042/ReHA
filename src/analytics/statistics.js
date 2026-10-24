/**
 * Calculate the baseline range of motion (ROM).
 *
 * Rules:
 * - Use the earliest 3 valid sessions.
 * - If fewer than 3 valid sessions exist, use what is available.
 * - Ignore sessions with no completed reps or invalid ROM.
 * - Never mix mock sessions with real sessions.
 * - Return null if no valid sessions exist.
 *
 * @param {Array} sessions - Historical training sessions
 * @param {boolean} isMock - Whether to use mock or real sessions
 * @returns {number|null}
 */
export function calculateBaselineROM(sessions, isMock = false) {
  if (!Array.isArray(sessions)) {
    return null;
  }

  const validSessions = sessions
    .filter((session) => {
      return (
        session !== null &&
        typeof session === "object" &&
        session.isMock === isMock &&
        Number.isInteger(session.completedReps) &&
        session.completedReps > 0 &&
        Number.isFinite(session.averageROM) &&
        session.averageROM > 0 &&
        typeof session.date === "string"
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  if (validSessions.length === 0) {
    return null;
  }

  const totalROM = validSessions.reduce(
    (sum, session) => sum + session.averageROM,
    0
  );

  return totalROM / validSessions.length;
}
