import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import simdLoader from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import simdBinary from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import plainLoader from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.js?url'
import plainBinary from '@mediapipe/tasks-vision/vision_wasm_nosimd_internal.wasm?url'
import localModel from './models/pose_landmarker_lite.task?url'

export async function createLandmarker(modelAssetPath = localModel) {
  // JS 和 WASM 均来自同一锁定依赖，不使用 latest CDN。
  const simd = await FilesetResolver.isSimdSupported()
  return PoseLandmarker.createFromOptions({
    wasmLoaderPath: simd ? simdLoader : plainLoader,
    wasmBinaryPath: simd ? simdBinary : plainBinary,
  }, {
    baseOptions: { modelAssetPath, delegate: 'CPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  })
}
