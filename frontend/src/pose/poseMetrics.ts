export type PoseLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type PosePhase = "standing" | "moving" | "bottom" | "unknown";

export type PoseFrameSummary = {
  timestampMs: number;
  phase: PosePhase;
  reps: number;
  bestScore: number;
  score: number;
  feedback: string;
  keyAngles: {
    leftKnee: number | null;
    rightKnee: number | null;
  };
};

const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

function isVisible(landmark: PoseLandmark | undefined) {
  return Boolean(landmark && (landmark.visibility ?? 1) >= 0.5);
}

export function calculateAngle(
  first: PoseLandmark,
  middle: PoseLandmark,
  last: PoseLandmark,
) {
  const firstAngle = Math.atan2(first.y - middle.y, first.x - middle.x);
  const lastAngle = Math.atan2(last.y - middle.y, last.x - middle.x);
  let degrees = Math.abs(((lastAngle - firstAngle) * 180) / Math.PI);
  if (degrees > 180) {
    degrees = 360 - degrees;
  }
  return degrees;
}

function kneeAngle(
  landmarks: PoseLandmark[],
  hipIndex: number,
  kneeIndex: number,
  ankleIndex: number,
) {
  const hip = landmarks[hipIndex];
  const knee = landmarks[kneeIndex];
  const ankle = landmarks[ankleIndex];
  if (!isVisible(hip) || !isVisible(knee) || !isVisible(ankle)) {
    return null;
  }
  return calculateAngle(hip, knee, ankle);
}

export function summarizePoseFrame(
  landmarks: PoseLandmark[],
): Omit<PoseFrameSummary, "timestampMs" | "reps" | "bestScore"> {
  const leftKnee = kneeAngle(landmarks, LEFT_HIP, LEFT_KNEE, LEFT_ANKLE);
  const rightKnee = kneeAngle(landmarks, RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE);
  const visibleAngles = [leftKnee, rightKnee].filter(
    (value): value is number => value !== null,
  );
  if (visibleAngles.length === 0) {
    return {
      phase: "unknown",
      score: 0,
      feedback: "保持全身进入画面",
      keyAngles: { leftKnee, rightKnee },
    };
  }

  const minKneeAngle = Math.min(...visibleAngles);
  const maxKneeAngle = Math.max(...visibleAngles);
  const asymmetry = Math.abs((leftKnee ?? maxKneeAngle) - (rightKnee ?? maxKneeAngle));

  const phase: PosePhase =
    minKneeAngle <= 115 ? "bottom" : minKneeAngle >= 155 ? "standing" : "moving";
  const depthScore = phase === "bottom" ? 88 : phase === "standing" ? 94 : 76;
  const score = Math.max(0, Math.min(100, depthScore - asymmetry * 0.5));
  const feedback =
    phase === "bottom"
      ? "底部深度已达到，保持膝盖朝脚尖方向"
      : phase === "standing"
        ? "站立姿态稳定，准备下一次下放"
        : "继续控制速度，保持核心收紧";

  return {
    phase,
    score,
    feedback,
    keyAngles: { leftKnee, rightKnee },
  };
}

export function createRepCounter() {
  let lastPhase: PosePhase = "unknown";
  let hasReachedBottom = false;
  let reps = 0;
  let bestScore = 0;

  return {
    ingest(landmarks: PoseLandmark[], timestampMs: number): PoseFrameSummary {
      const summary = summarizePoseFrame(landmarks);
      if (summary.phase === "bottom") {
        hasReachedBottom = true;
      }
      if (
        hasReachedBottom &&
        summary.phase === "standing" &&
        lastPhase !== "standing"
      ) {
        reps += 1;
        hasReachedBottom = false;
      }
      lastPhase = summary.phase;
      bestScore = Math.max(bestScore, summary.score);

      return {
        timestampMs,
        reps,
        bestScore,
        ...summary,
      };
    },
    reset() {
      lastPhase = "unknown";
      hasReachedBottom = false;
      reps = 0;
      bestScore = 0;
    },
  };
}
