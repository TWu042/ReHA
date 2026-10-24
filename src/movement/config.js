// 深蹲计数阈值。都是起始值，要用 P1 的录制数据和真人测试来调。
// 角度单位：度。时间单位：毫秒。

export const STAND_ANGLE = 160;          // 膝角高于这个值算站直
export const BOTTOM_ENTER_ANGLE = 133;   // 膝角低于这个值进入底部（按 P1 真人录制调过，原值 100）
export const BOTTOM_EXIT_ANGLE = 143;    // 膝角高于这个值才离开底部（滞回，比进入值高 10°，防止抖动）
export const MIN_REP_DURATION_MS = 800;  // 一次动作短于这个时长不计数（防抖动误计）
export const SMOOTHING_ALPHA = 0.3;      // 膝角指数平滑系数，越小越平滑、越滞后
