/**
 * ReHA P3 - Experimental Jitter Index
 *
 * Measures local knee-angle trajectory deviations.
 * Lower values indicate less local irregularity.
 *
 * Unit: degrees.
 * Not a clinically validated tremor measurement.
 *
 * Method (v2):
 * - Fit a local QUADRATIC trend around each sample, so the normal bend at the
 *   bottom of a squat is not counted as jitter (a straight-line fit was).
 * - The window adapts to the sampling interval and always holds at least
 *   MIN_POINTS samples, so 10 fps (uploaded video) and 15 fps (live camera)
 *   give values comparable to 66 fps instead of null / inflated values.
 *   Clean real squats: ~0.4° at 66 fps, ~0.6° at 15 fps, ~0.7° at 10 fps.
 */

const MIN_POINTS = 5;

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// Value at t = 0 of the least-squares quadratic a + b·t + c·t² (Cramer's rule).
function quadraticValueAtZero(points) {
  const S = [0, 0, 0, 0, 0];
  const T = [0, 0, 0];

  for (const { t, y } of points) {
    let power = 1;
    for (let k = 0; k < 5; k++) {
      S[k] += power;
      if (k < 3) T[k] += power * y;
      power *= t;
    }
  }

  const det3 = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

  const A = [
    [S[0], S[1], S[2]],
    [S[1], S[2], S[3]],
    [S[2], S[3], S[4]],
  ];
  const D = det3(A);

  if (!Number.isFinite(D) || Math.abs(D) < 1e-12) {
    return null;
  }

  const A0 = [
    [T[0], S[1], S[2]],
    [T[1], S[2], S[3]],
    [T[2], S[3], S[4]],
  ];

  return det3(A0) / D;
}

export function calculateJitterIndex(samples, windowMs = 400) {
  // STEP 1: Check input
  if (
    !Array.isArray(samples) ||
    samples.length < MIN_POINTS ||
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

  // STEP 3: Window = max(windowMs, enough time for MIN_POINTS samples)
  const intervals = [];
  for (let i = 1; i < samples.length; i++) {
    intervals.push(samples[i].timestampMs - samples[i - 1].timestampMs);
  }
  const halfWindow =
    Math.max(windowMs, (MIN_POINTS - 1) * median(intervals) * 1.01) / 2;

  let totalDeviation = 0;
  let validPoints = 0;

  // STEP 4: Deviation of each sample from its local quadratic trend
  for (let i = 0; i < samples.length; i++) {
    const centerTime = samples[i].timestampMs;

    const nearby = samples
      .filter((sample) => Math.abs(sample.timestampMs - centerTime) <= halfWindow)
      .map((sample) => ({
        t: (sample.timestampMs - centerTime) / 1000,
        y: sample.kneeAngleDeg,
      }));

    if (nearby.length < MIN_POINTS) {
      continue;
    }

    const predictedAngle = quadraticValueAtZero(nearby);

    if (predictedAngle === null) {
      continue;
    }

    totalDeviation += Math.abs(samples[i].kneeAngleDeg - predictedAngle);
    validPoints++;
  }

  // STEP 5: Return average deviation in degrees
  if (validPoints === 0) {
    return null;
  }

  return totalDeviation / validPoints;
}
