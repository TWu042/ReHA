// 给录制加干扰，用来测试计数在不同帧率、抖动、掉帧下是否稳定。所有随机数都用固定种子，结果可复现。

export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 标准正态分布随机数（Box–Muller）
function gaussian(rand) {
  const u = Math.max(rand(), 1e-12), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 降低帧率：按目标帧率的时间间隔挑帧（只能降，不能升）。 */
export function resample(frames, targetFps) {
  const step = 1000 / targetFps;
  const out = [];
  let next = frames[0]?.timestampMs ?? 0;
  for (const f of frames) {
    if (f.timestampMs >= next) {
      out.push(f);
      next += step;
      if (f.timestampMs > next) next = f.timestampMs + step;   // 原始帧间隔比目标大时不要积压
    }
  }
  return out;
}

/** 关键点坐标加高斯噪声（sigma 为归一化坐标，0.005 ≈ 640 宽画面上 3 像素）。 */
export function jitterLandmarks(frames, sigma, seed = 1) {
  const rand = seededRandom(seed);
  const noisy = lm => lm && lm.map(p => p && ({ ...p, x: p.x + gaussian(rand) * sigma, y: p.y + gaussian(rand) * sigma }));
  return frames.map(f => ({ ...f, landmarks: noisy(f.landmarks) }));
}

/**
 * 时间戳抖动 + 随机掉帧：模拟浏览器卡顿。
 * @param {number} jitterMs  每帧时间戳随机偏移 ±jitterMs（保证仍然严格递增）
 * @param {number} dropRate  每帧被丢掉的概率（0–1）
 */
export function jitterTiming(frames, { jitterMs = 0, dropRate = 0, seed = 2 } = {}) {
  const rand = seededRandom(seed);
  const out = [];
  let last = -Infinity;
  for (const f of frames) {
    if (rand() < dropRate) continue;
    let t = f.timestampMs + (rand() * 2 - 1) * jitterMs;
    if (t <= last) t = last + 0.5;
    last = t;
    out.push({ ...f, timestampMs: t });
  }
  return out;
}

/** 估算帧率 */
export function fpsOf(frames) {
  if (frames.length < 2) return null;
  return (frames.length - 1) / ((frames.at(-1).timestampMs - frames[0].timestampMs) / 1000);
}
