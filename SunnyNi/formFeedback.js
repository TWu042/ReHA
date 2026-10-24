import { eventBus } from "../src/shared/eventBus.js";

import {
  EVENTS,
  FEEDBACK
} from "../src/shared/contracts.js";

import {
  kneeAngleDeg,
  trunkLeanDeg
} from "./angles.js";

import {
  DESCENT_START_ANGLE,
  MAX_TRUNK_LEAN_DEG,
  FEEDBACK_COOLDOWN_MS,
  SMOOTHING_ALPHA
} from "./feedbackConfig.js";

// 保存 eventBus 的取消订阅函数
let unsubscribe = null;

// 指数平滑后的角度
let smoothedKneeAngle = null;
let smoothedTrunkAngle = null;

// 记录每种提示上一次发送时间
const lastFeedbackTime = new Map();

// 是否处于下蹲过程中
let isSquatting = false;

// 指数移动平均
function smooth(previous, current) {
  if (previous === null) {
    return current;
  }

  return (
    SMOOTHING_ALPHA * current +
    (1 - SMOOTHING_ALPHA) * previous
  );
}

// 统一发送纠错提示
function emitFeedback(timestampMs, code, message) {
  if (!Number.isFinite(timestampMs)) {
    return;
  }

  const lastTime = lastFeedbackTime.get(code);

  // 同类提示的冷却时间
  if (
    lastTime !== undefined &&
    timestampMs - lastTime < FEEDBACK_COOLDOWN_MS
  ) {
    return;
  }

  eventBus.emit(EVENTS.FORM_FEEDBACK, {
    timestampMs,
    code,
    message
  });

  lastFeedbackTime.set(code, timestampMs);
}

// 每收到一帧 pose_frame，就执行一次
function handlePoseFrame(frame) {
  // 无效帧直接跳过
  if (!frame || frame.valid === false) {
    return;
  }

  const aspectRatio = frame.aspectRatio ?? 1;

  const kneeAngle = kneeAngleDeg(
    frame.landmarks,
    aspectRatio
  );

  const trunkAngle = trunkLeanDeg(
    frame.landmarks,
    aspectRatio
  );

  // 角度无效时，不改变任何状态
  if (kneeAngle === null || trunkAngle === null) {
    return;
  }

  if (!Number.isFinite(frame.timestampMs)) {
    return;
  }

  // 平滑膝角
  smoothedKneeAngle = smooth(
    smoothedKneeAngle,
    kneeAngle
  );

  // 平滑躯干角
  smoothedTrunkAngle = smooth(
    smoothedTrunkAngle,
    trunkAngle
  );

  // 判断是否开始下蹲
  if (smoothedKneeAngle < DESCENT_START_ANGLE) {
    isSquatting = true;
  }

  // 判断是否回到站立
  if (smoothedKneeAngle >= 160) {
    isSquatting = false;
  }

  // 检测上身倾斜
  if (
    isSquatting &&
    smoothedTrunkAngle > MAX_TRUNK_LEAN_DEG
  ) {
    emitFeedback(
      frame.timestampMs,
      FEEDBACK.LEANING_FORWARD,
      "胸口抬起来，背挺直"
    );
  }
}

// 处理 T 的状态机返回的 abortedRep
export function handleAbortedRep(abortedRep) {
  if (!abortedRep) {
    return;
  }

  if (abortedRep.reason === "not_deep_enough") {
    emitFeedback(
      abortedRep.endTimestampMs,
      FEEDBACK.NOT_DEEP_ENOUGH,
      "再蹲低一点"
    );
  }
}

// 开始监听动作数据
export function startFormFeedback() {
  // 避免重复订阅
  if (unsubscribe) {
    unsubscribe();
  }

  // 重置当前训练状态
  smoothedKneeAngle = null;
  smoothedTrunkAngle = null;
  isSquatting = false;
  lastFeedbackTime.clear();

  // 订阅 pose_frame
  unsubscribe = eventBus.on(
    EVENTS.POSE_FRAME,
    handlePoseFrame
  );
}

// 结束监听
export function stopFormFeedback() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  smoothedKneeAngle = null;
  smoothedTrunkAngle = null;
  isSquatting = false;
  lastFeedbackTime.clear();
}
