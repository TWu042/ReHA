// 深蹲计数阈值。都是起始值，要用 P1 的录制数据和真人测试来调。
// 角度单位：度。时间单位：毫秒。

export const STAND_ANGLE = 160;          // 膝角高于这个值算站直
export const BOTTOM_ENTER_ANGLE = 133;   // 膝角低于这个值进入底部（按 P1 真人录制调过，原值 100）
export const BOTTOM_EXIT_ANGLE = 143;    // 膝角高于这个值才离开底部（滞回，比进入值高 10°，防止抖动）
export const MIN_REP_DURATION_MS = 800;  // 一次动作短于这个时长不计数（防抖动误计）
// 膝角平滑的时间常数（毫秒），越大越平滑、越滞后。按时间而不是按帧平滑，帧率高低不影响 ROM。
// 42ms 在 66 帧/秒（P1 真人录制）时等于原来每帧 alpha = 0.3，所以按真人录制调好的阈值不用改。
// 原来按帧固定 alpha 时，15 帧/秒的 ROM 会比 66 帧/秒小约 5°，还会少算动作。
export const SMOOTHING_TIME_MS = 42;
export const TRACKING_GAP_MS = 1500;     // 丢失追踪超过这个时长，放弃正在做的这一次，要先站直才继续计数

// 三维世界坐标专用工程初始值，尚无真人三维录制校准，不是医疗标准。
export const WORLD_BOTTOM_ENTER_ANGLE = 120;
export const WORLD_BOTTOM_EXIT_ANGLE = 130;
