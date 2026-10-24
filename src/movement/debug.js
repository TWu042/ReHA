// P2 深蹲计数实时测试页。打开方式：npm run dev，然后访问 /src/movement/debug.html
// 用的是和正式训练页一样的模块：P1 摄像头和姿态识别 → P2 计数（含 P4 纠错）。
// 每帧的数据不放进任何会触发重绘的状态里；画面和文字在 requestAnimationFrame 里统一刷新。

import { createCamera } from '../pose/camera.js';
import { createPoseTracker } from '../pose/poseTracker.js';
import { createRecorder } from '../pose/recorder.js';
import { eventBus } from '../shared/eventBus.js';
import { EVENTS, LM, PHASE } from '../shared/contracts.js';
import { startMovement, stopMovement, getMovementState } from './movementModule.js';
import { STAND_ANGLE, BOTTOM_ENTER_ANGLE, BOTTOM_EXIT_ANGLE, WORLD_BOTTOM_ENTER_ANGLE, WORLD_BOTTOM_EXIT_ANGLE } from './config.js';

const $ = id => document.getElementById(id);
const videoEl = $('video');
const overlay = $('overlay');
const chart = $('chart');
const statusEl = $('status');

const PHASE_TEXT = {
  [PHASE.STANDING]: '站立', [PHASE.DESCENDING]: '下蹲中',
  [PHASE.BOTTOM]: '到底', [PHASE.ASCENDING]: '起身中',
};
const LOST_TEXT = {
  no_person: '画面里没有人', incomplete_landmarks: '关键点不完整',
  low_visibility: '身体部位看不清（光线或遮挡）', out_of_frame: '身体超出画面',
  video_stalled: '画面卡住了', detection_error: '识别出错',
};

const camera = createCamera(videoEl);
const recorder = createRecorder();
let request = 0;
let running = false;
let latestFrame = null;
let lastLostReason = null;
let history = [];          // [{ t, a }]，a 为 null 表示这一帧无效
let offHistory = null;
let rafId = null;
let lastCount = 0;        // 上一轮的次数，停止后还能看准确率

const tracker = createPoseTracker(videoEl, {
  onError(error) {
    stopAll();
    statusEl.textContent = `识别已停止：${error.message}`;
  },
});

// ---------- 记录 ----------
function log(text) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString()}  ${text}`;
  $('log').prepend(li);
  while ($('log').children.length > 50) $('log').lastChild.remove();
}

eventBus.on(EVENTS.POSE_FRAME, frame => {
  latestFrame = frame;
  if (frame.valid) lastLostReason = null;
});
eventBus.on(EVENTS.TRACKING_LOST, e => {
  lastLostReason = e.reason;
  if (running) log(`⚠ 丢失追踪：${LOST_TEXT[e.reason] || e.reason}`);
});
eventBus.on(EVENTS.REP_COMPLETED, e => log(`✓ 第 ${e.repCount} 次，ROM ${e.rom}°`));
eventBus.on(EVENTS.FORM_FEEDBACK, e => log(`✎ 纠错：${e.message}`));

// ---------- 开始 / 停止 ----------
function beginRound() {
  startMovement();
  history = [];
  offHistory?.();
  // 在 startMovement 之后订阅，保证读到的是这一帧处理完的状态
  offHistory = eventBus.on(EVENTS.POSE_FRAME, frame => {
    const s = getMovementState();
    history.push({ t: frame.timestampMs, a: frame.valid ? s?.smoothedAngle ?? null : null });
    const cutoff = frame.timestampMs - 10000;
    while (history.length && history[0].t < cutoff) history.shift();
  });
}

function endRound() {
  offHistory?.();
  offHistory = null;
  const result = stopMovement();
  if (result) {
    lastCount = result.repCount;
    const roms = result.reps.map(r => r.rom).join('°、');
    log(`■ 本轮结束：${result.repCount} 次，平均 ROM ${result.averageROM ?? '--'}°，追踪质量 ${
      result.trackingQuality == null ? '--' : Math.round(result.trackingQuality * 100) + '%'}${roms ? `（每次 ${roms}°）` : ''}`);
  }
  return result;
}

function stopAll() {
  request++;
  if (running) endRound();
  running = false;
  if (recorder.isRecording) recorder.stop();
  tracker.stop();
  camera.stop();
  cancelAnimationFrame(rafId);
  drawStats();
  setButtons();
}

function setButtons() {
  $('start').disabled = running;
  $('newRound').disabled = !running;
  $('stop').disabled = !running;
  $('record').disabled = !running || recorder.isRecording;
  $('saveRecord').disabled = !recorder.isRecording;
}

$('start').onclick = async () => {
  const token = ++request;
  $('start').disabled = true;
  statusEl.textContent = '正在启动摄像头和加载模型……';
  try {
    await camera.start();
    if (token !== request) return;
    await tracker.start();
    if (token !== request) return;
    running = true;
    beginRound();
    statusEl.textContent = '识别中。先站直，再开始蹲。';
    log('▶ 开始新一轮');
    rafId = requestAnimationFrame(draw);
  } catch (error) {
    if (token !== request) return;
    stopAll();
    statusEl.textContent = error.message;
  } finally {
    setButtons();
  }
};

$('newRound').onclick = () => {
  endRound();
  beginRound();
  log('▶ 开始新一轮');
};

$('stop').onclick = () => {
  stopAll();
  statusEl.textContent = '已停止，摄像头已释放。';
};

// ---------- 录制 ----------
$('record').onclick = () => {
  try {
    if (recorder.frameCount) recorder.clear();
    recorder.start();
    log('● 开始录制');
  } catch (error) {
    statusEl.textContent = error.message;
  }
  setButtons();
};

$('saveRecord').onclick = () => {
  recorder.stop();
  const who = ($('tester').value.trim() || 'anon').replace(/[^\w一-龥-]/g, '_');
  const actual = $('actual').value ? `${$('actual').value}reps` : 'unknown';
  const stamp = new Date().toISOString().replaceAll(':', '-');
  recorder.download(`p2_${who}_${actual}_${stamp}.json`);
  log(`● 已下载录制，${recorder.frameCount} 帧`);
  recorder.clear();
  setButtons();
};

// ---------- 准确率 ----------
function updateAccuracy(counted) {
  const actual = Number($('actual').value);
  if (!$('actual').value || !(actual > 0)) {
    $('accuracy').textContent = '做完一轮后填入实际次数。';
    return;
  }
  const diff = counted - actual;
  const pct = Math.round((Math.min(counted, actual) / actual) * 100);
  $('accuracy').textContent = `计数 ${counted} / 实际 ${actual}，准确率 ${pct}%` +
    (diff > 0 ? `，多算了 ${diff} 次` : diff < 0 ? `，少算了 ${-diff} 次` : '，完全正确');
}

// ---------- 绘制 ----------
function sizeCanvas(canvas, width, height) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(width * dpr), h = Math.round(height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

const BONES = [
  [LM.LEFT_SHOULDER, LM.LEFT_HIP], [LM.LEFT_HIP, LM.LEFT_KNEE], [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP], [LM.RIGHT_HIP, LM.RIGHT_KNEE], [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER], [LM.LEFT_HIP, LM.RIGHT_HIP],
];

function drawSkeleton() {
  if (videoEl.videoWidth) $('stage').style.aspectRatio = `${videoEl.videoWidth} / ${videoEl.videoHeight}`;
  const { clientWidth: w, clientHeight: h } = overlay;
  const ctx = sizeCanvas(overlay, w, h);
  ctx.clearRect(0, 0, w, h);
  const lm = latestFrame?.landmarks;
  if (!lm) return;
  const color = latestFrame.valid ? '#3ddc84' : '#ff5c5c';
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const [a, b] of BONES) {
    if (!lm[a] || !lm[b]) continue;
    ctx.beginPath();
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
    ctx.stroke();
  }
  for (const i of Object.values(LM)) {
    if (!lm[i]) continue;
    ctx.beginPath();
    ctx.arc(lm[i].x * w, lm[i].y * h, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

const Y_MIN = 60, Y_MAX = 185;
function drawChart() {
  const w = chart.clientWidth, h = chart.clientHeight;
  const ctx = sizeCanvas(chart, w, h);
  ctx.clearRect(0, 0, w, h);
  const y = a => h - ((a - Y_MIN) / (Y_MAX - Y_MIN)) * h;

  const lines = [
    [STAND_ANGLE, '#2f9e44', `站直 ${STAND_ANGLE}°`],
    [getMovementState()?.angleSource === '3d' ? WORLD_BOTTOM_EXIT_ANGLE : BOTTOM_EXIT_ANGLE, '#e8590c', '离开底部'],
    [getMovementState()?.angleSource === '3d' ? WORLD_BOTTOM_ENTER_ANGLE : BOTTOM_ENTER_ANGLE, '#c92a2a', '进入底部'],
  ];
  ctx.font = '12px system-ui, sans-serif';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1;
  for (const [a, color, label] of lines) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, y(a)); ctx.lineTo(w, y(a)); ctx.stroke();
    ctx.fillText(`${label} (${a}°)`, 4, y(a) - 3);
  }
  ctx.setLineDash([]);

  if (!history.length) return;
  const tEnd = history.at(-1).t, tStart = tEnd - 10000;
  const x = t => ((t - tStart) / 10000) * w;
  ctx.strokeStyle = '#1d5fd1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  let drawing = false;
  for (const p of history) {
    if (p.a == null) { drawing = false; continue; }   // 无效帧断开曲线
    if (drawing) ctx.lineTo(x(p.t), y(p.a)); else ctx.moveTo(x(p.t), y(p.a));
    drawing = true;
  }
  ctx.stroke();
}

function drawStats() {
  const s = getMovementState();
  $('reps').textContent = s ? s.repCount : lastCount;
  $('angle').textContent = s?.smoothedAngle != null ? `${Math.round(s.smoothedAngle)}° (${s.angleSource})` : '--';
  $('phase').textContent = s ? PHASE_TEXT[s.phase] : '--';

  const banner = $('banner');
  if (latestFrame && !latestFrame.valid) {
    banner.className = 'bad';
    banner.textContent = `看不到完整身体：${LOST_TEXT[lastLostReason] || '请调整位置'}`;
  } else if (s?.waitingForStand) {
    banner.className = 'warn';
    banner.textContent = '请先站直，站直后才开始计数';
  } else if (s) {
    banner.className = 'ok';
    banner.textContent = '追踪正常，可以开始蹲';
  }
  updateAccuracy(s ? s.repCount : lastCount);
}

function draw() {
  drawSkeleton();
  drawChart();
  drawStats();
  if (running) rafId = requestAnimationFrame(draw);
}

$('actual').oninput = () => updateAccuracy(getMovementState()?.repCount ?? lastCount);
drawChart();

function dispose() { stopAll(); }
window.addEventListener('pagehide', dispose, { once: true });
if (import.meta.hot) import.meta.hot.dispose(dispose);
