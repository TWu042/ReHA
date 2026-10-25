/**
 * ReHA P3 - Experimental Movement Smoothness
 *
 * Uses the Jitter Index calculated from P2's
 * smoothed knee-angle samples.
 *
 * Output: 0–100 score, or null when unavailable.
 *
 * This is a demo metric, not a clinical assessment.
 */

import { calculateJitterIndex } from "./jitter.js";

// Experimental reference scale in degrees.
// Must be reviewed after robustness testing.
export const SMOOTHNESS_REFERENCE_DEG = 2;

/**
 * Calculate smoothness for one valid repetition.
 *
 * Higher score = less local trajectory irregularity.
 *
 * @param {Array} samples - P2 knee-angle samples
 * @returns {number|null}
 */
export function calculateRepSmoothness(samples) {
  const jitter = calculateJitterIndex(samples);

  if (jitter === null || !Number.isFinite(jitter) || jitter < 0) {
    return null;
  }

  const score = 100 * Math.exp(-jitter / SMOOTHNESS_REFERENCE_DEG);

  return score;
}

/**
 * Calculate mean smoothness across counted reps.
 *
 * If any rep lacks valid samples, return null
 * instead of inventing a score.
 *
 * @param {Array} reps - P2 counted repetitions
 * @returns {number|null}
 */
export function calculateSessionSmoothness(reps) {
  if (!Array.isArray(reps) || reps.length === 0) {
    return null;
  }

  const scores = reps.map((rep) => calculateRepSmoothness(rep?.samples));

  if (scores.some((score) => score === null)) {
    return null;
  }

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
