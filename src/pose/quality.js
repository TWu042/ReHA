import { LM } from '../shared/contracts.js'
import { QUALITY } from './config.js'

export function copyLandmarks(detected) {
  return Array.from({ length: 33 }, (_, i) => {
    const point = detected?.[i]
    if (!point || !['x', 'y', 'z', 'visibility'].every(key => Number.isFinite(point[key]))) return null
    const { x, y, z, visibility } = point
    return { x, y, z, visibility }
  })
}

export function assessPose(detected, config = QUALITY) {
  // 无人体、缺项或非有限值用 null，绝不填零或复用上一帧。
  const landmarks = copyLandmarks(detected)
  if (!detected?.length) return { landmarks, valid: false, reason: 'no_person' }
  if (detected.length !== 33 || landmarks.some(point => point === null)) {
    return { landmarks, valid: false, reason: 'incomplete_landmarks' }
  }
  const sides = [
    [LM.LEFT_SHOULDER, LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE],
    [LM.RIGHT_SHOULDER, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
  ].map(indices => indices.map(i => landmarks[i]))
  const visible = sides.filter(side => side.every(point => point.visibility >= config.minVisibility))
  if (!visible.length) {
    return { landmarks, valid: false, reason: 'low_visibility' }
  }
  const margin = config.frameMargin
  if (!visible.some(side => side.every(({ x, y }) => x >= margin && x <= 1 - margin && y >= margin && y <= 1 - margin))) {
    return { landmarks, valid: false, reason: 'out_of_frame' }
  }
  return { landmarks, valid: true, reason: null }
}
