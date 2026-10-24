import assert from "node:assert/strict";

import {
  pickSide,
  kneeAngleDeg,
  trunkLeanDeg
} from "../src/movement/angles.js";

// 构造一个具有指定膝关节角度的模拟人体
function frameFromKneeAngle(angleDeg) {
  const landmarks = Array.from(
    { length: 33 },
    () => ({
      x: 0,
      y: 0,
      visibility: 0
    })
  );

  const radians = angleDeg * Math.PI / 180;

  // 左侧关键点
  landmarks[11] = {
    x: 0.5,
    y: 0.1,
    visibility: 0.99
  };

  landmarks[23] = {
    x: 0.5,
    y: 0.3,
    visibility: 0.99
  };

  landmarks[25] = {
    x: 0.5,
    y: 0.5,
    visibility: 0.99
  };

  landmarks[27] = {
    x: 0.5 + 0.2 * Math.sin(radians),
    y: 0.5 - 0.2 * Math.cos(radians),
    visibility: 0.99
};

  return landmarks;
}

// 测试膝关节角度
for (const targetAngle of [170, 130, 90]) {
  const landmarks = frameFromKneeAngle(targetAngle);

  const result = kneeAngleDeg(landmarks, 1);

  assert.ok(
    Math.abs(result - targetAngle) < 2,
    `Expected ${targetAngle}°, got ${result}°`
  );

  console.log(
    `PASS: Knee angle ${targetAngle}° → ${result.toFixed(2)}°`
  );
}

// 测试左右侧选择
{
  const landmarks = frameFromKneeAngle(130);

  assert.equal(pickSide(landmarks), "left");

  console.log("PASS: Side selection");
}

// 测试躯干角度
{
  const landmarks = frameFromKneeAngle(170);

  const result = trunkLeanDeg(landmarks, 1);

  assert.ok(
    Math.abs(result) < 2,
    `Expected trunk angle 0°, got ${result}°`
  );

  console.log("PASS: Trunk angle");
}

// 测试 visibility 过低时返回 null
{
  const landmarks = frameFromKneeAngle(130);

  landmarks[25].visibility = 0.2;

  const result = kneeAngleDeg(landmarks, 1);

  assert.equal(result, null);

  console.log("PASS: Low visibility returns null");
}

console.log("\nAll angle tests passed!");