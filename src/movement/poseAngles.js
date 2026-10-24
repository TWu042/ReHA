import { kneeAngleDeg, trunkLeanDeg } from './angles.js';
import { QUALITY } from '../pose/config.js';

const SIDES = [[11, 23, 25, 27], [12, 24, 26, 28]];
const EPSILON = 1e-8;
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const vector = (a, b) => [a.x - b.x, a.y - b.y, a.z - b.z];

function angle(a, b) {
  const length = Math.hypot(...a) * Math.hypot(...b);
  if (length < EPSILON) return null;
  return Math.acos(Math.max(-1, Math.min(1, dot(a, b) / length))) * 180 / Math.PI;
}

function reliable(point) {
  return point && ['x', 'y', 'z', 'visibility'].every(k => Number.isFinite(point[k])) &&
    point.visibility >= QUALITY.minVisibility;
}

// 新帧走三维；旧录制没有 worldLandmarks 字段才走二维。
// 有世界坐标但该帧不可靠时不回退，避免同一次动作混用两个坐标系。
export function getPoseAngles(frame, { mode = 'auto', aspectRatio = 1 } = {}) {
  const source = mode === 'auto' ? ('worldLandmarks' in frame ? '3d' : '2d') : mode;
  const empty = { source, kneeAngleDeg: null, trunkLeanDeg: null };
  if (frame.valid !== true) return empty;
  if (source === '2d') {
    const ratio = frame.aspectRatio ?? aspectRatio;
    return { source, kneeAngleDeg: kneeAngleDeg(frame.landmarks, ratio), trunkLeanDeg: trunkLeanDeg(frame.landmarks, ratio) };
  }
  const world = frame.worldLandmarks;
  if (!Array.isArray(world) || world.length !== 33) return empty;
  const margin = QUALITY.frameMargin;
  const candidates = SIDES.filter(indices => indices.every(i => {
    const image = frame.landmarks?.[i];
    return reliable(world[i]) && reliable(image) && image.x >= margin && image.x <= 1 - margin &&
      image.y >= margin && image.y <= 1 - margin;
  }));
  candidates.sort((a, b) =>
    b.reduce((s, i) => s + Math.min(world[i].visibility, frame.landmarks[i].visibility), 0) -
    a.reduce((s, i) => s + Math.min(world[i].visibility, frame.landmarks[i].visibility), 0));
  if (!candidates.length) return empty;
  const [shoulder, hip, knee, ankle] = candidates[0].map(i => world[i]);
  return {
    source,
    kneeAngleDeg: angle(vector(hip, knee), vector(ankle, knee)),
    // 相对模型坐标的竖直向上方向；摄像头应保持水平。不是脊柱曲率检测。
    trunkLeanDeg: angle(vector(shoulder, hip), [0, -1, 0]),
  };
}
