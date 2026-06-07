import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

const WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

let cachedPoseLandmarker: Promise<PoseLandmarker> | null = null;

export function loadPoseLandmarker() {
  if (!cachedPoseLandmarker) {
    cachedPoseLandmarker = FilesetResolver.forVisionTasks(WASM_BASE_URL).then(
      (vision) =>
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
        }),
    );
  }
  return cachedPoseLandmarker;
}
