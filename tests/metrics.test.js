import assert from "node:assert/strict";

import {
  computeRepMetrics,
  computeTrackingQuality
} from "../src/movement/metrics.js";

// Test 1: 正常深蹲
{
  const samples = [
    { timestampMs: 0, kneeAngleDeg: 170 },
    { timestampMs: 500, kneeAngleDeg: 140 },
    { timestampMs: 1000, kneeAngleDeg: 95 },
    { timestampMs: 1500, kneeAngleDeg: 130 },
    { timestampMs: 2000, kneeAngleDeg: 170 }
  ];

  const result = computeRepMetrics(samples);

  assert.deepEqual(result, {
    rom: 75,
    durationMs: 2000,
    minKneeAngle: 95,
    maxKneeAngle: 170
  });

  console.log("PASS: Normal squat metrics");
}

// Test 2: 时间顺序打乱
{
  const samples = [
    { timestampMs: 2000, kneeAngleDeg: 170 },
    { timestampMs: 1000, kneeAngleDeg: 95 },
    { timestampMs: 0, kneeAngleDeg: 170 }
  ];

  const result = computeRepMetrics(samples);

  assert.equal(result.rom, 75);
  assert.equal(result.durationMs, 2000);

  console.log("PASS: Unsorted samples");
}

// Test 3: 数据不足
{
  const result = computeRepMetrics([
    { timestampMs: 0, kneeAngleDeg: 170 }
  ]);

  assert.equal(result, null);

  console.log("PASS: Insufficient samples");
}

// Test 4: Tracking Quality
{
  const frames = [
    { valid: true },
    { valid: true },
    { valid: false },
    { valid: true },
    { valid: true }
  ];

  const result = computeTrackingQuality(frames);

  assert.equal(result, 0.8);

  console.log("PASS: Tracking quality");
}

// Test 5: 空数组
{
  assert.equal(computeRepMetrics([]), null);
  assert.equal(computeTrackingQuality([]), null);

  console.log("PASS: Empty input");
}

console.log("\nAll metrics tests passed!");