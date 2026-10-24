import { LM } from '../shared/contracts.js'
import { QUALITY } from './config.js'

export function assessPose(detected, config = QUALITY) {
  // 无人体、缺项或非有限值用 null，绝不填零或复用上一帧。
  const landmarks = Array.from({ length: 33 }, (_, i) => {
    const point = detected?.[i]
    if (!point || !['x', 'y', 'z', 'visibility'].every(key => Number.isFinite(point[key]))) return null
    const { x, y, z, visibility } = point
    return { x, y, z, visibility }
  })
  if (!detected?.length) return { landmarks, valid: false, reason: 'no_person' }
  if (detected.length !== 33 || landmarks.some(point => point === null)) {
    return { landmarks, valid: false, reason: 'incomplete_landmarks' }
  }
  const required = Object.values(LM).map(i => landmarks[i])
  if (required.some(point => point.visibility < config.minVisibility)) {
    return { landmarks, valid: false, reason: 'low_visibility' }
  }
  const margin = config.frameMargin
  if (required.some(({ x, y }) => x < margin || x > 1 - margin || y < margin || y > 1 - margin)) {
    return { landmarks, valid: false, reason: 'out_of_frame' }
  }
  return { landmarks, valid: true, reason: null }
}
