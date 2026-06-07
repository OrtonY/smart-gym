import { describe, expect, it } from "vitest";

import { getCameraSupportError } from "./cameraSupport";

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
});
