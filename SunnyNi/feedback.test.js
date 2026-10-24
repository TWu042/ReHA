
import assert from "node:assert/strict";

import { eventBus } from "../src/shared/eventBus.js";
import { EVENTS, FEEDBACK } from "../src/shared/contracts.js";

import {
  startFormFeedback,
  stopFormFeedback,
  handleAbortedRep
} from "./formFeedback.js";

// 收集纠错事件
const feedbackEvents = [];

const unsubscribe = eventBus.on(
  EVENTS.FORM_FEEDBACK,
  data => feedbackEvents.push(data)
);

// 生成模拟姿态：指定膝角和躯干角
function makeFrame(kneeDeg, trunkDeg, timestampMs) {
  const landmarks = Array.from(
    { length: 33 },
    () => ({ x: 0, y: 0, visibility: 0 })
  );

  const kneeRad = kneeDeg * Math.PI / 180;
  const trunkRad = trunkDeg * Math.PI / 180;

  // 左侧髋部
  landmarks[23] = {
    x: 0.5, y: 0.3, visibility: 0.99
  };

  // 左侧膝盖
  landmarks[25] = {
    x: 0.5, y: 0.5, visibility: 0.99
  };

  // 左侧脚踝
  landmarks[27] = {
    x: 0.5 + 0.2 * Math.sin(kneeRad),
    y: 0.5 - 0.2 * Math.cos(kneeRad),
    visibility: 0.99
  };

  // 左侧肩膀
  landmarks[11] = {
    x: 0.5 + 0.2 * Math.sin(trunkRad),
    y: 0.3 - 0.2 * Math.cos(trunkRad),
    visibility: 0.99
  };

  return {
    timestampMs,
    valid: true,
    aspectRatio: 1,
    landmarks
  };
}

function emitFrame(knee, trunk, time) {
  eventBus.emit(
    EVENTS.POSE_FRAME,
    makeFrame(knee, trunk, time)
  );
}

function resetTest() {
  stopFormFeedback();
  feedbackEvents.length = 0;
  startFormFeedback();
}

// TEST 1：正常深蹲不应产生纠错
{
  resetTest();

  const angles = [170, 145, 120, 90, 120, 145, 170];

  angles.forEach((angle, i) => {
    emitFrame(angle, 10, i * 200);
  });

  assert.equal(feedbackEvents.length, 0);

  console.log("PASS: Normal squat, no feedback");
}

// TEST 2：浅蹲应产生 not_deep_enough
{
  resetTest();

  handleAbortedRep({
    reason: "not_deep_enough",
    endTimestampMs: 3000
  });

  assert.equal(feedbackEvents.length, 1);

  assert.equal(
    feedbackEvents[0].code,
    FEEDBACK.NOT_DEEP_ENOUGH
  );

  console.log("PASS: Shallow squat feedback");
}

// TEST 3：前倾 60° 应触发提示
{
  resetTest();

  // 连续输入前倾姿态，保证平滑角度稳定
  for (let i = 0; i < 12; i++) {
    emitFrame(120, 60, 1000 + i * 100);
  }

  assert.ok(
    feedbackEvents.some(
      event => event.code === FEEDBACK.LEANING_FORWARD
    ),
    "Expected leaning_forward feedback"
  );

  console.log("PASS: Forward lean feedback");
}

// TEST 4：冷却时间内不能重复
{
  resetTest();

  handleAbortedRep({
    reason: "not_deep_enough",
    endTimestampMs: 1000
  });

  handleAbortedRep({
    reason: "not_deep_enough",
    endTimestampMs: 1500
  });

  assert.equal(feedbackEvents.length, 1);

  // 已超过 2000ms 冷却时间
  handleAbortedRep({
    reason: "not_deep_enough",
    endTimestampMs: 3100
  });

  assert.equal(feedbackEvents.length, 2);

  console.log("PASS: Feedback cooldown");
}

// TEST 5：停止订阅后不再响应 pose_frame
{
  resetTest();
  stopFormFeedback();

  for (let i = 0; i < 12; i++) {
    emitFrame(120, 60, 1000 + i * 100);
  }

  assert.equal(feedbackEvents.length, 0);

  console.log("PASS: Stop unsubscribes");
}

// 清理测试订阅
stopFormFeedback();
unsubscribe();

console.log("\nAll feedback tests passed!");
