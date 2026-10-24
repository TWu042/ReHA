
export const DEEP_ENOUGH_ANGLE = 100;

export const DESCENT_START_ANGLE = 150;

export const STAND_ANGLE = 160;

export const MAX_TRUNK_LEAN_DEG = 45;

export const FEEDBACK_COOLDOWN_MS = 2000;

export const SMOOTHING_ALPHA = 0.3;

// 弯腰判定的工程初始值：持续 300ms 才记一次，回到 35° 以内才允许记下一次。
export const LEAN_HOLD_MS = 300;
export const LEAN_RECOVERY_DEG = 35;
