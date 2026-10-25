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
let analyzing = false;    // 正在分析上传的视频
let roundMin = Infinity;  // 本轮平滑膝角的最小、最大值（判断站直 / 蹲到底阈值是否合适）
let roundMax = -Infinity;
const OFFLINE_FPS = 10;   // 和训练页的离线分析一样

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
// 每轮自动录制：开始一轮就从头录，点"下载本轮录制"下载这一轮到现在的数据
function restartRecording() {
  try {
    if (recorder.isRecording) recorder.stop();
    if (recorder.frameCount) recorder.clear();
    recorder.start();
  } catch (error) {
    log(`⚠ 录制出错：${error.message}`);
  }
}

function beginRound() {
  startMovement({ angleMode: $('angleMode').value });
  restartRecording();
  history = [];
  roundMin = Infinity;
  roundMax = -Infinity;
  offHistory?.();
  // 在 startMovement 之后订阅，保证读到的是这一帧处理完的状态
  offHistory = eventBus.on(EVENTS.POSE_FRAME, frame => {
    const s = getMovementState();
    if (frame.valid && s?.smoothedAngle != null) {
      roundMin = Math.min(roundMin, s.smoothedAngle);
      roundMax = Math.max(roundMax, s.smoothedAngle);
    }
    history.push({ t: frame.timestampMs, a: frame.valid ? s?.smoothedAngle ?? null : null });
    const cutoff = frame.timestampMs - 10000;
    while (history.length && history[0].t < cutoff) history.shift();
  });
}

function endRound() {
  if (recorder.isRecording) recorder.stop();   // 保留这一轮的数据，停止后仍可下载
  offHistory?.();
  offHistory = null;
  const source = getMovementState()?.angleSource ?? '--';
  const result = stopMovement();
  if (Number.isFinite(roundMin)) {
    log(`📐 本轮膝角（平滑）最小 ${roundMin.toFixed(1)}°、最大 ${roundMax.toFixed(1)}°，角度来源 ${source}` +
      (roundMax < STAND_ANGLE ? `。最大值没到站直阈值 ${STAND_ANGLE}°，所以一直在等站直` : ''));
  }
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
  analyzing = false;
  if (running) endRound();
  running = false;
  tracker.stop();
  camera.stop();
  cancelAnimationFrame(rafId);
  drawStats();
  setButtons();
}

function setButtons() {
  $('start').disabled = running;
  $('newRound').disabled = !running || analyzing;
  $('videoFile').disabled = analyzing;
  $('stop').disabled = !running;
  $('saveRecord').disabled = recorder.frameCount === 0;
}

$('start').onclick = async () => {
  const token = ++request;
  $('start').disabled = true;
  statusEl.textContent = '正在启动摄像头和加载模型……';
  try {
    videoEl.removeAttribute('src');
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

// 换角度模式：正在用摄像头就马上开新一轮
$('angleMode').onchange = () => {
  if (running && !analyzing) {
    endRound();
    beginRound();
    log(`▶ 角度模式改为 ${$('angleMode').value}，开始新一轮`);
  }
};

// ---------- 上传视频（和训练页一样每秒 10 帧逐帧分析） ----------
function waitForVideoData(video) {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    video.addEventListener('loadeddata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error(
      video.error?.code === 3 || video.error?.code === 4
        ? '浏览器播放不了这个视频，可能是 HEVC（H.265，iPhone 默认格式），请转成 H.264 MP4'
        : '视频加载失败')), { once: true });
  });
}

function seekTo(video, time) {
  return new Promise(resolve => {
    const done = () => { video.removeEventListener('seeked', done); resolve(); };
    video.addEventListener('seeked', done);
    video.currentTime = time;
    if (!video.seeking) done();   // 已经在这个位置时不会触发 seeked
  });
}

$('videoFile').onchange = async event => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!file.size) {
    statusEl.textContent = '这个文件是空的（0 字节），请重新下载或拷贝。';
    return;
  }
  stopAll();
  const token = ++request;
  const url = URL.createObjectURL(file);
  try {
    statusEl.textContent = '正在加载视频和模型……';
    videoEl.srcObject = null;
    videoEl.src = url;
    videoEl.load();
    await waitForVideoData(videoEl);
    if (token !== request) return;
    videoEl.pause();
    await tracker.start({ manual: true });
    if (token !== request) return;

    running = true;
    analyzing = true;
    beginRound();
    setButtons();
    rafId = requestAnimationFrame(draw);
    log(`▶ 分析视频 ${file.name}（${videoEl.duration.toFixed(1)} 秒，角度模式 ${$('angleMode').value}）`);

    const base = performance.now();
    const total = Math.max(1, Math.ceil(videoEl.duration * OFFLINE_FPS));
    for (let i = 0; i < total; i++) {
      if (token !== request) return;
      await seekTo(videoEl, Math.min(i / OFFLINE_FPS, Math.max(0, videoEl.duration - 0.001)));
      if (token !== request) return;
      tracker.analyzeFrame(base + (i * 1000) / OFFLINE_FPS);
      statusEl.textContent = `正在分析视频…… ${Math.round(((i + 1) / total) * 100)}%`;
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    endRound();
    running = false;
    analyzing = false;
    tracker.stop();
    cancelAnimationFrame(rafId);
    drawStats();
    statusEl.textContent = '视频分析完成。填好实际次数后可以下载录制；换角度模式后重新上传可以对比。';
  } catch (error) {
    if (token !== request) return;
    analyzing = false;
    stopAll();
    statusEl.textContent = error.message;
  } finally {
    if (token === request) analyzing = false;
    setButtons();
  }
};

$('stop').onclick = () => {
  stopAll();
  statusEl.textContent = '已停止，摄像头已释放。';
};

// ---------- 录制 ----------
$('saveRecord').onclick = () => {
  if (recorder.isRecording) recorder.stop();
  if (!recorder.frameCount) return;
  const who = ($('tester').value.trim() || 'anon').replace(/[^\w一-龥-]/g, '_');
  const actual = $('actual').value ? `${$('actual').value}reps` : 'unknown';
  const stamp = new Date().toISOString().replaceAll(':', '-');
  recorder.download(`p2_${who}_${actual}_${stamp}.json`);
  log(`● 已下载录制，${recorder.frameCount} 帧（${actual}）`);
  recorder.clear();
  // 还在识别就接着录下一段
  if (running) recorder.start();
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
  setButtons();   // 录到第一帧后"下载本轮录制"变为可点
  if (running) rafId = requestAnimationFrame(draw);
}

$('actual').oninput = () => updateAccuracy(getMovementState()?.repCount ?? lastCount);
drawChart();

function dispose() { stopAll(); }
window.addEventListener('pagehide', dispose, { once: true });
if (import.meta.hot) import.meta.hot.dispose(dispose);
