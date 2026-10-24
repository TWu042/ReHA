
import { eventBus } from "../shared/eventBus.js";

import {
  EVENTS,
  FEEDBACK
} from "../shared/contracts.js";

import { getPoseAngles } from "./poseAngles.js";
import { TRACKING_GAP_MS } from "./config.js";

import {
  MAX_TRUNK_LEAN_DEG,
  FEEDBACK_COOLDOWN_MS,
  SMOOTHING_ALPHA,
  LEAN_HOLD_MS,
  LEAN_RECOVERY_DEG
} from "./feedbackConfig.js";

// 保存 eventBus 的取消订阅函数
let unsubscribe = null;

// 指数平滑后的角度
let smoothedTrunkAngle = null;
let angleMode = 'auto';
let angleSource = null;
let lastTimestampMs = null;
let leanStartedMs = null;
let leanRecorded = false;

// 记录每种提示上一次发送时间
const lastFeedbackTime = new Map();

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
    return false;
  }

  const lastTime = lastFeedbackTime.get(code);

  // 同类提示的冷却时间
  if (
    lastTime !== undefined &&
    timestampMs - lastTime < FEEDBACK_COOLDOWN_MS
  ) {
    return false;
  }

  eventBus.emit(EVENTS.FORM_FEEDBACK, {
    timestampMs,
    code,
    message
  });

  lastFeedbackTime.set(code, timestampMs);
  return true;
}

// 每收到一帧 pose_frame，就执行一次
function handlePoseFrame(frame) {
  // 无效帧直接跳过
  if (!frame || frame.valid !== true || !Number.isFinite(frame.timestampMs)) {
    return;
  }

  const angles = getPoseAngles(frame, { mode: angleSource ?? angleMode });
  const trunkAngle = angles.trunkLeanDeg;

  // 角度无效时，不改变任何状态
  if (trunkAngle === null) {
    return;
  }

  if (lastTimestampMs !== null && frame.timestampMs <= lastTimestampMs) return;
  if (lastTimestampMs !== null && frame.timestampMs - lastTimestampMs > TRACKING_GAP_MS) {
    smoothedTrunkAngle = null;
    leanStartedMs = null;
    leanRecorded = false;
  }
  lastTimestampMs = frame.timestampMs;
  angleSource ??= angles.source;

  // 平滑躯干角
  smoothedTrunkAngle = smooth(
    smoothedTrunkAngle,
    trunkAngle
  );

  // 与下蹲阶段无关：先弯腰、后弯腰都检测。持续弯腰只记一次。
  if (smoothedTrunkAngle <= LEAN_RECOVERY_DEG) {
    leanStartedMs = null;
    leanRecorded = false;
  } else if (smoothedTrunkAngle <= MAX_TRUNK_LEAN_DEG) {
    leanStartedMs = null;
  } else {
    leanStartedMs ??= frame.timestampMs;
  }
  if (!leanRecorded && leanStartedMs !== null && frame.timestampMs - leanStartedMs >= LEAN_HOLD_MS) {
    leanRecorded = emitFeedback(
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
export function startFormFeedback(options = {}) {
  // 避免重复订阅
  if (unsubscribe) {
    unsubscribe();
  }

  // 重置当前训练状态
  smoothedTrunkAngle = null;
  angleMode = options.angleMode ?? 'auto';
  angleSource = null;
  lastTimestampMs = null;
  leanStartedMs = null;
  leanRecorded = false;
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

  smoothedTrunkAngle = null;
  angleSource = null;
  lastTimestampMs = null;
  leanStartedMs = null;
  leanRecorded = false;
  lastFeedbackTime.clear();
}
