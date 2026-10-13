import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// The wasm runtime is copied into /public/mediapipe/wasm by `npm run copy:wasm` (runs before dev/build).
const WASM_PATH = '/mediapipe/wasm';
const MODEL_URL =
  import.meta.env.VITE_HAND_MODEL_URL ||
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let landmarkerPromise;

/** Lazily creates one shared HandLandmarker, trying the GPU first and falling back to the CPU. */
export function getHandLandmarker() {
  landmarkerPromise ??= (async () => {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    const create = (delegate) =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: 'IMAGE',
        numHands: 2,
        minHandDetectionConfidence: 0.4,
        minHandPresenceConfidence: 0.4,
      });
    try {
      return await create('GPU');
    } catch {
      return create('CPU');
    }
  })().catch((err) => {
    landmarkerPromise = undefined; // allow a retry
    throw err;
  });
  return landmarkerPromise;
}

/**
 * @param {HTMLCanvasElement|HTMLImageElement|ImageBitmap} source
 * @returns {Promise<{ landmarks: Array<Array<{x:number,y:number,z:number}>>, handedness: string[] }>}
 */
export async function detectHands(source) {
  const landmarker = await getHandLandmarker();
  const result = landmarker.detect(source);
  return {
    landmarks: result.landmarks,
    handedness: result.handedness.map((h) => h[0]?.categoryName),
  };
}
