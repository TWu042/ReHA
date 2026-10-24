
import fs from "node:fs";

import { eventBus } from "../src/shared/eventBus.js";
import { EVENTS } from "../src/shared/contracts.js";

import { createRepCounter } from "../src/movement/repCounter.js";

import {
  startFormFeedback,
  stopFormFeedback,
  handleAbortedRep
} from "./formFeedback.js";

// 运行一份 mock 数据
function runMock(filename) {
  const frames = JSON.parse(
    fs.readFileSync(`mock/${filename}`, "utf8")
  );

  const counter = createRepCounter();

  const feedback = [];

  const unsubscribe = eventBus.on(
    EVENTS.FORM_FEEDBACK,
    data => feedback.push(data)
  );

  startFormFeedback();

  let completed = 0;
  let aborted = 0;

  for (const frame of frames) {
    // T：动作计数状态机
    const result = counter.processFrame(frame);

   if (result?.completedRep) {
  completed++;

  console.log("Completed rep:", {
    minKneeAngle: result.completedRep.minKneeAngle,
    maxKneeAngle: result.completedRep.maxKneeAngle,
    durationMs: result.completedRep.durationMs,
    romDeg: result.completedRep.romDeg
  });
}

    if (result?.abortedRep) {
  aborted++;

  // 打印中止动作的详细信息
  console.log("Aborted rep:", {
    reason: result.abortedRep.reason,
    minKneeAngle: result.abortedRep.minKneeAngle,
    maxKneeAngle: result.abortedRep.maxKneeAngle,
    durationMs: result.abortedRep.durationMs
  });

  // 把 T 的结果交给 X
  handleAbortedRep(result.abortedRep);
}

    // X：独立处理前倾
    eventBus.emit(EVENTS.POSE_FRAME, frame);
  }

  stopFormFeedback();
  unsubscribe();

  const codes = feedback.map(item => item.code);

  console.log(`\nFILE: ${filename}`);
  console.log(`Frames: ${frames.length}`);
  console.log(`Completed reps: ${completed}`);
  console.log(`Aborted reps: ${aborted}`);
  console.log("Feedback codes:", codes);

  return {
    completed,
    aborted,
    feedback
  };
}

// 1. 正常合成深蹲
runMock("synthetic_squat.json");

// 2. 浅蹲
runMock("shallow_squat.json");

// 3. P1 真人正常深蹲
runMock(
  "p1_normal_5_2026-10-24T20-07-57.148Z.json"
);

// 4. P1 真人浅蹲
runMock(
  "p1_shallow_3_2026-10-24T20-08-35.279Z.json"
);
