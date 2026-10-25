import { eventBus } from '../shared/eventBus.js';
import { EVENTS } from '../shared/contracts.js';

export const IDLE_FRAME_MS = 250;
export const CELEBRATION_FRAME_MS = 140;
export const CELEBRATION_DURATION_MS = 12 * CELEBRATION_FRAME_MS;

// 内部使用 0 起始编号：0–3 待机，4–15 庆祝。
export function createFoxTimeline(startedAt) {
  let idleStartedAt = startedAt;
  let celebrationStartedAt = null;

  function frameAt(now) {
    if (celebrationStartedAt !== null) {
      const elapsed = Math.max(0, now - celebrationStartedAt);
      if (elapsed < CELEBRATION_DURATION_MS) return 4 + Math.floor(elapsed / CELEBRATION_FRAME_MS);
      idleStartedAt = celebrationStartedAt + CELEBRATION_DURATION_MS;
      celebrationStartedAt = null;
    }
    return Math.floor(Math.max(0, now - idleStartedAt) / IDLE_FRAME_MS) % 4;
  }

  function celebrate(now) {
    frameAt(now);
    if (celebrationStartedAt !== null) return false;
    celebrationStartedAt = now;
    return true;
  }

  return { frameAt, celebrate };
}

export function spriteCrop(width, height, index) {
  const cellWidth = width / 4;
  const cellHeight = height / 4;
  // 宽度可能不能整除 4，保留小数；边缘内缩 1px，源区域本身也是 3:4。
  const cropWidth = Math.min(cellWidth - 2, (cellHeight - 2) * 3 / 4);
  const cropHeight = cropWidth * 4 / 3;
  if (cropWidth <= 0) throw new Error('Fox sprite sheet is too small.');
  return {
    x: (index % 4) * cellWidth + (cellWidth - cropWidth) / 2,
    y: Math.floor(index / 4) * cellHeight + (cellHeight - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}

export function mountFoxAnimation(canvas, {
  src,
  bus = eventBus,
  onStatus = () => {},
  makeImage = () => new Image(),
  requestFrame = fn => requestAnimationFrame(fn),
  cancelFrame = id => cancelAnimationFrame(id),
  now = () => performance.now(),
  pixelRatio = () => Math.min(window.devicePixelRatio || 1, 2),
} = {}) {
  let disposed = false;
  let rafId = null;
  let ready = false;
  let timeline = null;
  let lastFrame = -1;
  const image = makeImage();
  const ctx = canvas.getContext('2d');
  onStatus('loading');

  const off = bus.on(EVENTS.REP_COMPLETED, () => {
    // 加载前事件不排队，庆祝期间事件不叠加、不重启。
    if (ready && !disposed) timeline.celebrate(now());
  });

  function draw(timestamp) {
    rafId = null;
    if (disposed || !ready) return;
    const width = Math.max(3, Math.round(canvas.getBoundingClientRect().width * pixelRatio()));
    const height = Math.round(width * 4 / 3);
    const resized = canvas.width !== width || canvas.height !== height;
    if (resized) {
      canvas.width = width;
      canvas.height = height;
    }
    const index = timeline.frameAt(timestamp);
    if (resized || index !== lastFrame) {
      const crop = spriteCrop(image.naturalWidth, image.naturalHeight, index);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
      lastFrame = index;
    }
    rafId = requestFrame(draw);
  }

  image.onload = async () => {
    try {
      if (image.decode) await image.decode();
      if (disposed) return;
      if (!ctx || !image.naturalWidth || !image.naturalHeight) throw new Error('Image or Canvas unavailable.');
      spriteCrop(image.naturalWidth, image.naturalHeight, 15);
      timeline = createFoxTimeline(now());
      ready = true;
      onStatus('ready');
      rafId = requestFrame(draw);
    } catch {
      if (!disposed) onStatus('error');
    }
  };
  image.onerror = () => { if (!disposed) onStatus('error'); };
  image.src = src;

  return () => {
    disposed = true;
    ready = false;
    off();
    if (rafId !== null) cancelFrame(rafId);
    image.onload = null;
    image.onerror = null;
  };
}
