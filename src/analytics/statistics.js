/**
 * ReHA P3 - Baseline ROM Statistics
 *
 * Baseline = average ROM of the earliest
 * three valid historical sessions.
 *
 * Separates:
 * - Mock vs Real
 * - 2D vs 3D vs Unknown angle sources
 *
 * The caller must exclude current/future sessions.
 * This is not a clinical assessment.
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

function normalizeAngleSource(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (value === "2d" || value === "3d") {
    return value;
  }

  return undefined;
}

function getSessionTime(session) {
  if (!isValidDate(session.date)) {
    return null;
  }

  if (session.createdAt === undefined || session.createdAt === null) {
    return {
      date: session.date,
      time: null,
    };
  }

  if (
    typeof session.createdAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      session.createdAt
    )
  ) {
    return null;
  }

  const time = Date.parse(session.createdAt);

  if (!Number.isFinite(time)) {
    return null;
  }

  return {
    date: session.date,
    time,
  };
}

/**
 * Calculate personal ROM baseline.
 *
 * @param {Array} sessions
 * @param {boolean} isMock
 * @param {"2d"|"3d"|null} angleSource
 * @returns {number|null}
 */
export function calculateBaselineROM(
  sessions,
  isMock = false,
  angleSource = null
) {
  if (!Array.isArray(sessions)) {
    return null;
  }

  const source = normalizeAngleSource(angleSource);

  if (source === undefined) {
    return null;
  }

  const validSessions = sessions
    .map((session, index) => ({
      session,
      index,
      chronology:
        session && typeof session === "object" ? getSessionTime(session) : null,
    }))
    .filter(
      ({ session, chronology }) =>
        session !== null &&
        typeof session === "object" &&
        !Array.isArray(session) &&
        session.isMock === isMock &&
        normalizeAngleSource(session.angleSource) === source &&
        Number.isInteger(session.completedReps) &&
        session.completedReps > 0 &&
        Number.isFinite(session.averageROM) &&
        session.averageROM > 0 &&
        chronology !== null
    )
    .sort((a, b) => {
      const dateComparison = a.chronology.date.localeCompare(b.chronology.date);

      if (dateComparison !== 0) {
        return dateComparison;
      }

      if (a.chronology.time !== null && b.chronology.time !== null) {
        return a.chronology.time - b.chronology.time;
      }

      // Legacy same-day order is uncertain.
      return a.index - b.index;
    })
    .slice(0, 3);

  if (validSessions.length === 0) {
    return null;
  }

  const totalROM = validSessions.reduce(
    (sum, item) => sum + item.session.averageROM,
    0
  );

  return totalROM / validSessions.length;
}
