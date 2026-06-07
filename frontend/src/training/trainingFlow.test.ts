import { describe, expect, it } from "vitest";

import { nextStepIndex, summarizeWorkoutSteps } from "./trainingFlow";

describe("training flow helpers", () => {
  it("summarizes completed steps and average score", () => {
    const summary = summarizeWorkoutSteps([
      { status: "completed", score: 90, actual_duration_seconds: 600 },
      { status: "skipped", score: null, actual_duration_seconds: 0 },
    ]);

    expect(summary.completedSteps).toBe(1);
    expect(summary.averageScore).toBe(90);
    expect(summary.durationSeconds).toBe(600);
  });

  it("advances to the next step without overflowing", () => {
    expect(nextStepIndex(0, 3)).toBe(1);
    expect(nextStepIndex(2, 3)).toBe(2);
  });
});
