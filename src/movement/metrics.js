
/**
 * 计算一次深蹲的运动指标
 *
 * @param {Array} samples
 * 每个元素包含：
 * { timestampMs, kneeAngleDeg }
 *
 * @returns {Object|null}
 */
export function computeRepMetrics(samples) {
  // 至少需要两帧才能计算运动时长
  if (!Array.isArray(samples) || samples.length < 2) {
    return null;
  }

  // 只保留时间戳和角度有效的样本
  const validSamples = samples.filter(sample =>
    sample != null &&
    Number.isFinite(sample.timestampMs) &&
    Number.isFinite(sample.kneeAngleDeg)
  );

  if (validSamples.length < 2) {
    return null;
  }

  // 按时间排序，避免输入数据顺序混乱
  const sortedSamples = [...validSamples].sort(
    (a, b) => a.timestampMs - b.timestampMs
  );

  const angles = sortedSamples.map(
    sample => sample.kneeAngleDeg
  );

  const minKneeAngle = Math.min(...angles);
  const maxKneeAngle = Math.max(...angles);

  const rom = maxKneeAngle - minKneeAngle;

  const durationMs =
    sortedSamples[sortedSamples.length - 1].timestampMs -
    sortedSamples[0].timestampMs;

  // 没有有效的时间跨度，不能计算一次动作
  if (durationMs <= 0) {
    return null;
  }

  return {
    rom,
    durationMs,
    minKneeAngle,
    maxKneeAngle
  };
}

/**
 * 计算人体姿态追踪质量
 *
 * @param {Array} frames
 * 每个元素至少包含 valid 字段
 *
 * @returns {number|null}
 * 返回 0 到 1 的比例
 */
export function computeTrackingQuality(frames) {
  if (!Array.isArray(frames) || frames.length === 0) {
    return null;
  }

  const validCount = frames.filter(
    frame => frame?.valid === true
  ).length;

  return validCount / frames.length;
}
