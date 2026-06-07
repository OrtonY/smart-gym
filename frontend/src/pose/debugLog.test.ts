import { describe, expect, it } from "vitest";

import { toErrorDiagnostics } from "./debugLog";

describe("pose debug logging", () => {
  it("captures useful diagnostics for non-Error thrown objects", () => {
    const thrownObject = Object.create(null) as Record<string, unknown>;
    thrownObject.code = 12;

    const diagnostics = toErrorDiagnostics(thrownObject);

    expect(diagnostics).toMatchObject({
      constructorName: "Object",
      keys: ["code"],
      stringValue: "[object Object]",
    });
  });
});
