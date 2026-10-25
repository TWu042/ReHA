/**
 * ReHA P3 - Experimental Jitter Index
 *
 * Measures local knee-angle trajectory deviations.
 * Lower values indicate less local irregularity.
 *
 * Unit: degrees.
 * Not a clinically validated tremor measurement.
 */

export function calculateJitterIndex(samples, windowMs = 200) {
  // STEP 1: Check input
  if (
    !Array.isArray(samples) ||
    samples.length < 5 ||
    !Number.isFinite(windowMs) ||
    windowMs <= 0
  ) {
    return null;
  }

  // STEP 2: Validate timestamps and angles
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];

    if (
      !sample ||
      !Number.isFinite(sample.timestampMs) ||
      !Number.isFinite(sample.kneeAngleDeg) ||
      sample.kneeAngleDeg < 0 ||
      sample.kneeAngleDeg > 180
    ) {
      return null;
    }

    if (i > 0 && sample.timestampMs <= samples[i - 1].timestampMs) {
      return null;
    }
  }

  let totalDeviation = 0;
  let validPoints = 0;

  // STEP 3: Estimate local trend at each sample
  for (let i = 0; i < samples.length; i++) {
    const centerTime = samples[i].timestampMs;

    const nearby = samples.filter(
      (sample) => Math.abs(sample.timestampMs - centerTime) <= windowMs / 2
    );

    if (nearby.length < 3) {
      continue;
    }

    const count = nearby.length;

    const meanTime =
      nearby.reduce((sum, sample) => sum + sample.timestampMs - centerTime, 0) /
      count;

    const meanAngle =
      nearby.reduce((sum, sample) => sum + sample.kneeAngleDeg, 0) / count;

    let covariance = 0;
    let timeVariance = 0;

    for (const sample of nearby) {
      const dt = sample.timestampMs - centerTime - meanTime;

      covariance += dt * (sample.kneeAngleDeg - meanAngle);

      timeVariance += dt * dt;
    }

    if (timeVariance === 0) {
      continue;
    }

    const slope = covariance / timeVariance;

    // Predicted knee angle at centerTime
    const predictedAngle = meanAngle - slope * meanTime;

    // STEP 4: Measure deviation from trend
    const deviation = Math.abs(samples[i].kneeAngleDeg - predictedAngle);

    totalDeviation += deviation;
    validPoints++;
  }

  // STEP 5: Return average deviation in degrees
  if (validPoints === 0) {
    return null;
  }

  return totalDeviation / validPoints;
}
