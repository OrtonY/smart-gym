import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

import { emitPoseError, emitPoseLog, toErrorDiagnostics } from "./debugLog";

const POSE_LANDMARKER_ASSET_CONFIG = {
  wasmBaseUrl: "/mediapipe/wasm",
  modelUrl: "/mediapipe/models/pose_landmarker_lite.task",
  delegate: "CPU" as const,
};

let cachedPoseLandmarker: Promise<PoseLandmarker> | null = null;

export function getPoseLandmarkerAssetConfig() {
  return POSE_LANDMARKER_ASSET_CONFIG;
}

export function loadPoseLandmarker() {
  const { delegate, modelUrl, wasmBaseUrl } = getPoseLandmarkerAssetConfig();

  if (!cachedPoseLandmarker) {
    emitPoseLog("mediapipe:create-start", {
      wasmBaseUrl,
      modelUrl,
      delegate,
    });
    cachedPoseLandmarker = FilesetResolver.forVisionTasks(wasmBaseUrl)
      .then((vision) => {
        emitPoseLog("mediapipe:vision-ready");
        return PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelUrl,
            delegate,
          },
          runningMode: "VIDEO",
          numPoses: 1,
        });
      })
      .then((landmarker) => {
        emitPoseLog("mediapipe:create-success");
        return landmarker;
      })
      .catch((caught) => {
        cachedPoseLandmarker = null;
        emitPoseError(
          "mediapipe:create-error",
          toErrorDiagnostics(caught),
          caught,
        );
        throw caught;
      });
  } else {
    emitPoseLog("mediapipe:reuse-cached-landmarker");
  }
  return cachedPoseLandmarker;
}
