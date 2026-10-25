/**
 * ReHA P3 - Progress Analytics
 *
 * Tracks ROM changes against personal baseline.
 *
 * Separates:
 * - Mock vs Real sessions
 * - 2D vs 3D vs Unknown angle sources
 *
 * Experimental analytics, not clinical assessment.
 */

function normalizeAngleSource(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (value === "2d" || value === "3d") {
    return value;
  }

  return undefined;
}

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

function getTime(session) {
  if (
    typeof session.createdAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      session.createdAt
    )
  ) {
    return null;
  }

  const time = Date.parse(session.createdAt);

  return Number.isFinite(time) ? time : null;
}

function isValidROM(session) {
  return (
    session &&
    typeof session === "object" &&
    !Array.isArray(session) &&
    Number.isInteger(session.completedReps) &&
    session.completedReps > 0 &&
    Number.isFinite(session.averageROM) &&
    session.averageROM > 0
  );
}

export function calculateProgress(currentSummary, previousSessions = []) {
  if (
    !currentSummary ||
    typeof currentSummary !== "object" ||
    Array.isArray(currentSummary) ||
    !Array.isArray(previousSessions)
  ) {
    throw new TypeError("Invalid progress input");
  }

  const {
    sessionId,
    date,
    createdAt,
    isMock,
    angleSource,
    averageROM,
    baselineROM,
  } = currentSummary;

  const source = normalizeAngleSource(angleSource);

  if (
    typeof sessionId !== "string" ||
    !sessionId.trim() ||
    !isValidDate(date) ||
    typeof isMock !== "boolean" ||
    source === undefined ||
    (createdAt !== undefined &&
      createdAt !== null &&
      getTime(currentSummary) === null)
  ) {
    throw new TypeError("Invalid current summary");
  }

  const currentTime = getTime(currentSummary);

  const history = previousSessions.filter((session) => {
    if (
      !isValidROM(session) ||
      !isValidDate(session.date) ||
      session.isMock !== isMock ||
      session.sessionId === sessionId ||
      normalizeAngleSource(session.angleSource) !== source
    ) {
      return false;
    }

    const historyTime = getTime(session);

    if (currentTime !== null && historyTime !== null) {
      return historyTime < currentTime;
    }

    // Legacy date-only records:
    // only definitely earlier dates are included.
    return session.date < date;
  });

  const orderedHistory = history
    .map((session, index) => ({
      session,
      index,
      time: getTime(session),
    }))
    .sort((a, b) => {
      const dateDiff = a.session.date.localeCompare(b.session.date);

      if (dateDiff !== 0) {
        return dateDiff;
      }

      if (a.time !== null && b.time !== null) {
        return a.time - b.time;
      }

      return a.index - b.index;
    })
    .map(({ session }) => session);

  const currentROM =
    Number.isFinite(averageROM) && averageROM > 0 ? averageROM : null;

  const validBaseline =
    Number.isFinite(baselineROM) && baselineROM > 0 ? baselineROM : null;

  const romChangeDeg =
    currentROM !== null && validBaseline !== null
      ? currentROM - validBaseline
      : null;

  const romChangePercent =
    romChangeDeg !== null ? (romChangeDeg / validBaseline) * 100 : null;

  const trend = orderedHistory.map((session) => ({
    sessionId: session.sessionId,
    date: session.date,
    createdAt: session.createdAt ?? null,
    angleSource: source,
    averageROM: session.averageROM,
  }));

  if (currentROM !== null) {
    trend.push({
      sessionId,
      date,
      createdAt: createdAt ?? null,
      angleSource: source,
      averageROM: currentROM,
    });
  }

  return {
    currentROM,
    baselineROM: validBaseline,
    romChangeDeg,
    romChangePercent,
    validSessionCount: orderedHistory.length,
    angleSource: source,
    trend,
  };
}
