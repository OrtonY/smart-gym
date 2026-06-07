import { describe, expect, it } from "vitest";

import {
  calculateAngle,
  createRepCounter,
  summarizePoseFrame,
  type PoseLandmark,
} from "./poseMetrics";

function landmarksWithKneeAngle(angle: number): PoseLandmark[] {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0.95,
  }));
  landmarks[23] = { x: 0, y: 0, z: 0, visibility: 0.95 };
  landmarks[25] = { x: 1, y: 0, z: 0, visibility: 0.95 };
  const radians = (angle * Math.PI) / 180;
  landmarks[27] = {
    x: 1 + Math.cos(Math.PI - radians),
    y: Math.sin(Math.PI - radians),
    z: 0,
    visibility: 0.95,
  };
  landmarks[24] = landmarks[23];
  landmarks[26] = landmarks[25];
  landmarks[28] = landmarks[27];
  return landmarks;
}

describe("pose metrics", () => {
  it("calculates a joint angle in degrees", () => {
    const angle = calculateAngle(
      { x: 0, y: 1, z: 0, visibility: 1 },
      { x: 0, y: 0, z: 0, visibility: 1 },
      { x: 1, y: 0, z: 0, visibility: 1 },
    );

    expect(angle).toBeCloseTo(90);
  });

  it("summarizes squat phase from knee angle", () => {
    const bottom = summarizePoseFrame(landmarksWithKneeAngle(90));
    const standing = summarizePoseFrame(landmarksWithKneeAngle(170));

    expect(bottom.phase).toBe("bottom");
    expect(standing.phase).toBe("standing");
    expect(standing.score).toBeGreaterThan(bottom.score);
  });

  it("counts one rep after standing bottom standing sequence", () => {
    const counter = createRepCounter();

    counter.ingest(landmarksWithKneeAngle(170), 0);
    counter.ingest(landmarksWithKneeAngle(90), 500);
    const snapshot = counter.ingest(landmarksWithKneeAngle(170), 1000);

    expect(snapshot.reps).toBe(1);
    expect(snapshot.bestScore).toBeGreaterThan(0);
  });
});
