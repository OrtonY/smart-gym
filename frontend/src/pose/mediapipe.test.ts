import { describe, expect, it } from "vitest";

import { getPoseLandmarkerAssetConfig } from "./mediapipe";

describe("mediapipe asset configuration", () => {
  it("serves wasm and model assets from the local Vite origin", () => {
    const config = getPoseLandmarkerAssetConfig();

    expect(config.wasmBaseUrl).toBe("/mediapipe/wasm");
    expect(config.modelUrl).toBe("/mediapipe/models/pose_landmarker_lite.task");
    expect(config.delegate).toBe("CPU");
  });
});
