/**
 * ReHA experimental movement scoring.
 *
 * This is a demonstration score, not a clinical assessment.
 */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Range score: compare average ROM with personal baseline.
 */
export function calculateRangeScore(averageROM, baselineROM) {
  if (
    !Number.isFinite(averageROM) ||
    !Number.isFinite(baselineROM) ||
    averageROM <= 0 ||
    baselineROM <= 0
  ) {
    return null;
  }

  return clamp((averageROM / baselineROM) * 100, 0, 100);
}

/**
 * Consistency score: compare ROM across completed repetitions.
 */
export function calculateConsistencyScore(reps) {
  if (!Array.isArray(reps) || reps.length === 0) {
    return null;
  }

  const romValues = reps.map((rep) => rep?.rom);

  if (romValues.some((rom) => !Number.isFinite(rom) || rom <= 0)) {
    return null;
  }

  const mean = romValues.reduce((sum, rom) => sum + rom, 0) / romValues.length;

  const variance =
    romValues.reduce((sum, rom) => sum + (rom - mean) ** 2, 0) /
    romValues.length;

  const standardDeviation = Math.sqrt(variance);

  const coefficientOfVariation = standardDeviation / mean;

  return clamp(100 - coefficientOfVariation * 100, 0, 100);
}

/**
 * Overall quality score.
 *
 * Q = 0.4 * Range + 0.3 * Smoothness + 0.3 * Consistency
 *
 * Missing metrics must not be treated as zero.
 */
export function calculateQualityScore({
  rangeScore,
  smoothnessScore,
  consistencyScore,
}) {
  const scores = [rangeScore, smoothnessScore, consistencyScore];

  if (
    scores.some((score) => !Number.isFinite(score) || score < 0 || score > 100)
  ) {
    return null;
  }

  return 0.4 * rangeScore + 0.3 * smoothnessScore + 0.3 * consistencyScore;
}
