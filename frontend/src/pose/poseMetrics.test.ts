import { describe, expect, it } from "vitest";

import {
  calculateAngle,
  createRepCounter,
  normalizePoseDetectionRules,
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

function landmarksWithJointAngle(
  firstIndex: number,
  middleIndex: number,
  lastIndex: number,
  angle: number,
): PoseLandmark[] {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0.95,
  }));
  landmarks[firstIndex] = { x: 0, y: 0, z: 0, visibility: 0.95 };
  landmarks[middleIndex] = { x: 1, y: 0, z: 0, visibility: 0.95 };
  const radians = (angle * Math.PI) / 180;
  landmarks[lastIndex] = {
    x: 1 + Math.cos(Math.PI - radians),
    y: Math.sin(Math.PI - radians),
    z: 0,
    visibility: 0.95,
  };
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

  it("summarizes movement phases from backend-provided joint rules", () => {
    const pushUpRules = normalizePoseDetectionRules({
      type: "push_up",
      display_name: "俯卧撑",
      key_angles: {
        leftElbow: [11, 13, 15],
      },
      phase_rules: [
        {
          phase: "top",
          angle: "leftElbow",
          min: 155,
          feedback: "顶端支撑稳定，保持身体成一直线",
          score: 92,
        },
        {
          phase: "bottom",
          angle: "leftElbow",
          max: 95,
          feedback: "下放深度已达到，准备推起",
          score: 88,
        },
      ],
      default_phase: "moving",
      rep_sequence: ["top", "bottom", "top"],
    });

    const bottom = summarizePoseFrame(
      landmarksWithJointAngle(11, 13, 15, 80),
      pushUpRules,
    );
    const top = summarizePoseFrame(
      landmarksWithJointAngle(11, 13, 15, 170),
      pushUpRules,
    );

    expect(bottom.phase).toBe("bottom");
    expect(bottom.keyAngles.leftElbow).toBeCloseTo(80);
    expect(top.phase).toBe("top");
  });

  it("counts reps using the backend-provided phase sequence", () => {
    const pushUpRules = normalizePoseDetectionRules({
      type: "push_up",
      key_angles: {
        leftElbow: [11, 13, 15],
      },
      phase_rules: [
        { phase: "top", angle: "leftElbow", min: 155 },
        { phase: "bottom", angle: "leftElbow", max: 95 },
      ],
      rep_sequence: ["top", "bottom", "top"],
    });
    const counter = createRepCounter(pushUpRules);

    counter.ingest(landmarksWithJointAngle(11, 13, 15, 170), 0);
    counter.ingest(landmarksWithJointAngle(11, 13, 15, 80), 500);
    const snapshot = counter.ingest(landmarksWithJointAngle(11, 13, 15, 170), 1000);

    expect(snapshot.reps).toBe(1);
    expect(snapshot.phase).toBe("top");
  });
});
