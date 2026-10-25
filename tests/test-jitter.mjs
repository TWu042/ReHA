// Jitter / Smoothness v2：不同帧率结果一致、能分辨抖动、正常的到底掉头不算抖动
// 运行：node tests/test-jitter.mjs
import assert from "node:assert/strict";
import { calculateJitterIndex } from "../src/analytics/jitter.js";
import { calculateRepSmoothness } from "../src/analytics/smoothness.js";

// 一次平滑深蹲：1.2 秒，170° → 90° → 170°（余弦曲线）
function squat(fps, noiseDeg = 0) {
  const samples = [];
  const step = 1000 / fps;
  for (let i = 0, t = 0; t <= 1200; i++, t = i * step) {
    const angle = 130 + 40 * Math.cos((2 * Math.PI * t) / 1200);
    const noise = noiseDeg * (i % 2 === 0 ? 1 : -1);
    samples.push({ timestampMs: t, kneeAngleDeg: angle + noise });
  }
  return samples;
}

const clean = [66, 30, 15, 10].map((fps) => calculateJitterIndex(squat(fps)));

// 1. 每种帧率都有值（旧方法 10 fps 会得到 null）
assert.ok(clean.every((j) => Number.isFinite(j)), `有 null：${clean}`);

// 2. 平滑动作在各帧率下都接近 0：到底掉头的弯曲不算抖动（旧的直线拟合 10 fps 约 2°）
assert.ok(clean.every((j) => j < 0.5), `平滑动作 jitter 过大：${clean}`);

// 3. 加 ±2° 抖动后明显变大，平稳度明显变低
for (const fps of [30, 15, 10]) {
  const noisy = calculateJitterIndex(squat(fps, 2));
  assert.ok(noisy > 1, `${fps} fps 抖动没被识别：${noisy}`);
  assert.ok(calculateRepSmoothness(squat(fps, 2)) < calculateRepSmoothness(squat(fps)) - 30);
}

// 4. 样本太少、时间不递增仍然返回 null
assert.equal(calculateJitterIndex(squat(10).slice(0, 4)), null);
assert.equal(calculateJitterIndex([...squat(15)].reverse()), null);

console.log("jitter v2 测试通过", clean.map((j) => j.toFixed(3)).join(" / "));
