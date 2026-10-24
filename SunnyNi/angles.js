
const MIN_VISIBILITY = 0.5;
const EPSILON = 1e-8;

const LEFT = {
  shoulder: 11,
  hip: 23,
  knee: 25,
  ankle: 27
};

const RIGHT = {
  shoulder: 12,
  hip: 24,
  knee: 26,
  ankle: 28
};

// 检查关键点是否有效
function isValidPoint(point) {
  return (
    point != null &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.visibility) &&
    point.visibility >= MIN_VISIBILITY
  );
}

// 计算指定一侧四个关键点的平均可见度
function averageVisibility(landmarks, side) {
  const indices = Object.values(side);

  const total = indices.reduce((sum, index) => {
    const visibility = landmarks[index]?.visibility;
    return sum + (
      Number.isFinite(visibility) ? visibility : 0
    );
  }, 0);

  return total / indices.length;
}

// 1. 选择可见度更高的一侧
export function pickSide(landmarks) {
  if (!Array.isArray(landmarks)) {
    return "left";
  }

  const leftVisibility = averageVisibility(landmarks, LEFT);
  const rightVisibility = averageVisibility(landmarks, RIGHT);

  return leftVisibility >= rightVisibility
    ? "left"
    : "right";
}

// 计算三个点构成的夹角，B 是顶点
function angleBetweenPoints(A, B, C, aspectRatio = 1) {
  if (
    !isValidPoint(A) ||
    !isValidPoint(B) ||
    !isValidPoint(C) ||
    !Number.isFinite(aspectRatio) ||
    aspectRatio <= 0
  ) {
    return null;
  }

  const ux = (A.x - B.x) * aspectRatio;
  const uy = A.y - B.y;

  const vx = (C.x - B.x) * aspectRatio;
  const vy = C.y - B.y;

  const lengthU = Math.hypot(ux, uy);
  const lengthV = Math.hypot(vx, vy);

  if (lengthU < EPSILON || lengthV < EPSILON) {
    return null;
  }

  const dotProduct = ux * vx + uy * vy;

  const cosine = dotProduct / (lengthU * lengthV);

  // 防止浮点误差使 acos 得到 NaN
  const clampedCosine = Math.max(
    -1,
    Math.min(1, cosine)
  );

  return Math.acos(clampedCosine) * 180 / Math.PI;
}

// 2. 计算膝关节角度
export function kneeAngleDeg(landmarks, aspectRatio = 1) {
  if (!Array.isArray(landmarks)) {
    return null;
  }

  const side = pickSide(landmarks);
  const indices = side === "left" ? LEFT : RIGHT;

  return angleBetweenPoints(
    landmarks[indices.hip],
    landmarks[indices.knee],
    landmarks[indices.ankle],
    aspectRatio
  );
}

// 3. 计算躯干相对竖直方向的倾斜角度
export function trunkLeanDeg(landmarks, aspectRatio = 1) {
  if (
    !Array.isArray(landmarks) ||
    !Number.isFinite(aspectRatio) ||
    aspectRatio <= 0
  ) {
    return null;
  }

  const side = pickSide(landmarks);
  const indices = side === "left" ? LEFT : RIGHT;

  const shoulder = landmarks[indices.shoulder];
  const hip = landmarks[indices.hip];

  if (!isValidPoint(shoulder) || !isValidPoint(hip)) {
    return null;
  }

  // 从髋部指向肩膀
  const dx = (shoulder.x - hip.x) * aspectRatio;
  const dy = shoulder.y - hip.y;

  const length = Math.hypot(dx, dy);

  if (length < EPSILON) {
    return null;
  }

  // 与竖直向上向量 (0, -1) 的夹角
  const cosine = -dy / length;

  const clampedCosine = Math.max(
    -1,
    Math.min(1, cosine)
  );

  return Math.acos(clampedCosine) * 180 / Math.PI;
}

