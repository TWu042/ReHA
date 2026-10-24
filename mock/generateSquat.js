/* global process */
// mock/generateSquat.js
// 合成深蹲数据。原理：固定脚踝，按想要的膝角反推膝盖和髋的位置，所以角度一定准确。
//
// 运行（一次生成全部 5 个文件到 mock/）：
//   node mock/generateSquat.js
//
// 不要用 `node ... > xxx.json` 重定向：Windows PowerShell 5.1 会把输出存成 UTF-16，
// 之后 JSON.parse 会报错。这里直接用 fs 写 UTF-8 文件。

import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const SHIN = 0.2, THIGH = 0.2;
const ANKLE = { x: 0.5, y: 0.9 };

// 固定种子的随机数，保证每次生成的文件一样，测试结果可复现
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function frameFromKneeAngle(kneeAngleDeg, timestampMs, noise = 0.003, rand = Math.random) {
  const phi = ((180 - kneeAngleDeg) / 2) * Math.PI / 180;
  const knee = { x: ANKLE.x + SHIN * Math.sin(phi), y: ANKLE.y - SHIN * Math.cos(phi) };
  const hip  = { x: knee.x - THIGH * Math.sin(phi), y: knee.y - THIGH * Math.cos(phi) };
  const shoulder = { x: hip.x + 0.05, y: hip.y - 0.25 };
  const jitter = () => (rand() - 0.5) * noise;
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
  const set = (i, p) => (landmarks[i] = { x: p.x + jitter(), y: p.y + jitter(), z: 0, visibility: 0.95 });
  [11, 12].forEach(i => set(i, shoulder));
  [23, 24].forEach(i => set(i, hip));
  [25, 26].forEach(i => set(i, knee));
  [27, 28].forEach(i => set(i, ANKLE));
  return { timestampMs, landmarks, valid: true };
}

/**
 * 生成一段深蹲数据，返回 PoseFrame 数组。
 * 每次深蹲：下蹲（repDurationMs 的一半）→ 底部停 pauseAtBottomMs → 起身（另一半）→ 站 standDurationMs。
 * 默认参数 = 第 7.1 节的 3 次标准深蹲。
 */
export function generate({
  reps = 3,
  standAngle = 170,
  minAngle = 90,
  repDurationMs = 2000,
  standDurationMs = 1000,
  pauseAtBottomMs = 0,
  returnToStand = true,     // false = 蹲下不起（只做一次下蹲，然后停在底部）
  invalidRange = null,      // [起始帧, 结束帧)，这段帧设为 valid: false
  fps = 30,
  noise = 0.003,
  seed = 42,
} = {}) {
  const rand = seededRandom(seed);
  const range = standAngle - minAngle;
  const half = Math.round((fps * repDurationMs) / 2000);   // 下蹲或起身各占多少帧
  const pause = Math.round((fps * pauseAtBottomMs) / 1000);
  const stand = Math.round((fps * standDurationMs) / 1000);

  const angles = [];
  for (let rep = 0; rep < reps; rep++) {
    for (let i = 0; i < half; i++) angles.push(standAngle - range * (1 - Math.cos(Math.PI * i / half)) / 2);
    for (let i = 0; i < pause; i++) angles.push(minAngle);
    if (!returnToStand) {
      for (let i = 0; i < fps * 2; i++) angles.push(minAngle);   // 停在底部 2 秒，结束
      break;
    }
    for (let i = 0; i < half; i++) angles.push(standAngle - range * (1 + Math.cos(Math.PI * i / half)) / 2);
    for (let i = 0; i < stand; i++) angles.push(standAngle);
  }

  return angles.map((angle, i) => {
    const t = Math.round((i * 1000) / fps);
    if (invalidRange && i >= invalidRange[0] && i < invalidRange[1]) {
      // 丢失追踪：valid: false，而且关键点故意给成"站直"的错误位置。
      // 如果计数器没有跳过这些帧，就会多算或少算，测试能发现。
      return { ...frameFromKneeAngle(178, t, noise * 10, rand), valid: false };
    }
    return frameFromKneeAngle(angle, t, noise, rand);
  });
}

// 5 份测试数据
const STANDARD_FRAMES = 3 * 90; // 3 次 × (60 帧动作 + 30 帧站立)
export const DATASETS = {
  'synthetic_squat.json': {},
  'shallow_squat.json':   { minAngle: 150 },   // 真人浅蹲约 144–153°
  'pause_at_bottom.json': { pauseAtBottomMs: 2000 },
  'half_rep.json':        { reps: 1, returnToStand: false },
  'tracking_lost.json':   { invalidRange: [STANDARD_FRAMES / 2 - 15, STANDARD_FRAMES / 2 + 15] },
};

// 命令行入口
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outDir = dirname(fileURLToPath(import.meta.url));
  for (const [name, options] of Object.entries(DATASETS)) {
    const frames = generate(options);
    writeFileSync(join(outDir, name), JSON.stringify(frames));
    const seconds = (frames.at(-1).timestampMs / 1000).toFixed(1);
    const invalid = frames.filter(f => !f.valid).length;
    console.log(`${name.padEnd(22)} ${String(frames.length).padStart(4)} 帧  ${seconds}s  无效帧 ${invalid}`);
  }
}
