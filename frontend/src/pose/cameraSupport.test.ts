import { describe, expect, it } from "vitest";

import { formatCameraStartupError, getCameraSupportError } from "./cameraSupport";

describe("camera support detection", () => {
  it("reports insecure context when mediaDevices is unavailable", () => {
    const error = getCameraSupportError({
      isSecureContext: false,
      mediaDevices: undefined,
    });

    expect(error).toContain("HTTPS");
  });

  it("allows camera startup when getUserMedia is available", () => {
    const error = getCameraSupportError({
      isSecureContext: true,
      mediaDevices: {
        getUserMedia: async () => ({}) as MediaStream,
      } as MediaDevices,
    });

    expect(error).toBeNull();
  });

  it("formats permission denial errors from mobile browsers", () => {
    const error = formatCameraStartupError({
      name: "NotAllowedError",
      message: "Permission denied",
    });

    expect(error).toContain("权限");
  });

  it("uses the message from regular errors without adding the error class", () => {
    const error = formatCameraStartupError(new Error("视频组件未就绪"));

    expect(error).toBe("视频组件未就绪");
  });

  it("preserves unknown object error details for debugging", () => {
    const error = formatCameraStartupError({
      name: "MediaPipeError",
      message: "model load failed",
    });

    expect(error).toContain("MediaPipeError");
    expect(error).toContain("model load failed");
  });
});
