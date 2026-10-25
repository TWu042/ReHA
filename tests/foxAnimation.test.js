import test from 'node:test';
import assert from 'node:assert/strict';
import { createFoxTimeline, spriteCrop, mountFoxAnimation } from '../src/story/foxAnimation.js';
import { EVENTS } from '../src/shared/contracts.js';

test('待机四帧循环，庆祝十二帧按时序播放，重复触发不重启或排队', () => {
  const timeline = createFoxTimeline(0);
  assert.deepEqual([0, 249, 250, 500, 750, 1000].map(timeline.frameAt), [0, 0, 1, 2, 3, 0]);
  assert.equal(timeline.celebrate(1100), true);
  for (let i = 0; i < 12; i++) {
    assert.equal(timeline.frameAt(1100 + i * 140), i + 4);
    assert.equal(timeline.celebrate(1100 + i * 140 + 1), false);
  }
  assert.equal(timeline.frameAt(2779), 15);
  assert.equal(timeline.frameAt(2780), 0);
  assert.equal(timeline.frameAt(3030), 1);
  assert.equal(timeline.celebrate(3100), true);
});

test('真实图片的分数像素分格：每帧裁剪严格位于自身格内且保持 3:4', () => {
  for (let i = 0; i < 16; i++) {
    const crop = spriteCrop(1086, 1448, i);
    const left = (i % 4) * 1086 / 4;
    const top = Math.floor(i / 4) * 1448 / 4;
    assert.ok(crop.x >= left + 1);
    assert.ok(crop.y >= top + 1);
    assert.ok(crop.x + crop.width <= left + 1086 / 4 - 1);
    assert.ok(crop.y + crop.height <= top + 1448 / 4 - 1);
    assert.ok(Math.abs(crop.width / crop.height - 3 / 4) < 1e-10);
  }
});

test('预加载之后才开启循环，事件驱动庆祝，卸载取消循环和订阅', async () => {
  let handler, clock = 0, callback;
  let offCount = 0, cancelCount = 0;
  const draws = [];
  const statuses = [];
  const image = { naturalWidth: 1086, naturalHeight: 1448, decode: async () => {} };
  const canvas = {
    width: 0, height: 0,
    getBoundingClientRect: () => ({ width: 270 }),
    getContext: () => ({ clearRect() {}, drawImage(...args) { draws.push(args); } }),
  };
  const dispose = mountFoxAnimation(canvas, {
    src: 'test.png', makeImage: () => image,
    bus: { on(type, fn) { assert.equal(type, EVENTS.REP_COMPLETED); handler = fn; return () => { offCount++; }; } },
    requestFrame(fn) { callback = fn; return 1; }, cancelFrame() { cancelCount++; },
    now: () => clock, pixelRatio: () => 2, onStatus: value => statuses.push(value),
  });
  handler();
  assert.equal(callback, undefined);
  await image.onload();
  assert.deepEqual(statuses, ['loading', 'ready']);
  callback(0);
  assert.equal(canvas.width / canvas.height, 3 / 4);
  assert.equal(draws.length, 1);
  clock = 100;
  handler();
  callback(100);
  const celebrating = spriteCrop(1086, 1448, 4);
  assert.equal(draws.at(-1)[2], celebrating.y);
  dispose();
  assert.equal(offCount, 1);
  assert.equal(cancelCount, 1);
  assert.equal(image.onload, null);
});

test('加载失败和预加载期间卸载不会留下动画循环', async () => {
  for (const failure of [true, false]) {
    let started = 0;
    const image = { naturalWidth: 1086, naturalHeight: 1448, decode: async () => {} };
    const statuses = [];
    const dispose = mountFoxAnimation({ getContext: () => ({}) }, {
      src: 'test.png', makeImage: () => image,
      bus: { on: () => () => {} }, now: () => 0,
      requestFrame: () => { started++; }, onStatus: status => statuses.push(status),
    });
    if (failure) image.onerror();
    else { const load = image.onload; dispose(); await load(); }
    assert.equal(started, 0);
    if (failure) { assert.deepEqual(statuses, ['loading', 'error']); dispose(); }
  }
});
