export type PoseLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type PosePhase = string;

export type PoseFrameSummary = {
  timestampMs: number;
  phase: PosePhase;
  reps: number;
  bestScore: number;
  score: number;
  feedback: string;
  keyAngles: Record<string, number | null>;
};

type JointTriple = [number, number, number];

type RawPhaseRule = {
  phase?: unknown;
  angle?: unknown;
  metric?: unknown;
  min?: unknown;
  max?: unknown;
  feedback?: unknown;
  score?: unknown;
};

type PhaseRule = {
  phase: string;
  metric: string;
  min?: number;
  max?: number;
  feedback?: string;
  score?: number;
};

type SymmetryRule = {
  left: string;
  right: string;
  penaltyPerDegree: number;
};

export type PoseDetectionRules = {
  type: string;
  mode: "reps" | "hold";
  displayName?: string;
  keyAngles: Record<string, JointTriple>;
  phaseRules: PhaseRule[];
  defaultPhase: string;
  defaultScore: number;
  defaultFeedback: string;
  repSequence: string[];
  symmetryRules: SymmetryRule[];
};

const DEFAULT_SQUAT_RULES: PoseDetectionRules = {
  type: "squat",
  mode: "reps",
  displayName: "徒手深蹲",
  keyAngles: {
    leftKnee: [23, 25, 27],
    rightKnee: [24, 26, 28],
  },
  phaseRules: [
    {
      phase: "bottom",
      metric: "minKneeAngle",
      max: 115,
      feedback: "底部深度已达到，保持膝盖朝脚尖方向",
      score: 88,
    },
    {
      phase: "standing",
      metric: "minKneeAngle",
      min: 155,
      feedback: "站立姿态稳定，准备下一次下放",
      score: 94,
    },
  ],
  defaultPhase: "moving",
  defaultScore: 76,
  defaultFeedback: "继续控制速度，保持核心收紧",
  repSequence: ["standing", "bottom", "standing"],
  symmetryRules: [{ left: "leftKnee", right: "rightKnee", penaltyPerDegree: 0.5 }],
};

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

function objectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseJointTriple(value: unknown): JointTriple | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }
  const indexes = value.map((item) =>
    Number.isInteger(item) && item >= 0 ? item : null,
  );
  if (indexes.some((item) => item === null)) {
    return null;
  }
  return indexes as JointTriple;
}

function parseKeyAngles(value: unknown) {
  const record = objectRecord(value);
  if (!record) {
    return null;
  }

  const entries = Object.entries(record)
    .map(([name, triple]) => [name, parseJointTriple(triple)] as const)
    .filter((entry): entry is readonly [string, JointTriple] => entry[1] !== null);

  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function parsePhaseRule(value: unknown): PhaseRule | null {
  const rule = objectRecord(value) as RawPhaseRule | null;
  if (!rule) {
    return null;
  }
  const phase = optionalString(rule.phase);
  const metric = optionalString(rule.metric) ?? optionalString(rule.angle);
  if (!phase || !metric) {
    return null;
  }
  return {
    phase,
    metric,
    min: optionalNumber(rule.min),
    max: optionalNumber(rule.max),
    feedback: optionalString(rule.feedback),
    score: optionalNumber(rule.score),
  };
}

function parsePhaseRules(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }
  const rules = value
    .map(parsePhaseRule)
    .filter((rule): rule is PhaseRule => rule !== null);
  return rules.length > 0 ? rules : null;
}

function parseRepSequence(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const sequence = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  return sequence.length >= 2 ? sequence : fallback;
}

function parseSymmetryRules(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rule = objectRecord(item);
    const left = optionalString(rule?.left);
    const right = optionalString(rule?.right);
    if (!left || !right) {
      return [];
    }
    return [
      {
        left,
        right,
        penaltyPerDegree: optionalNumber(rule?.penalty_per_degree) ?? 0.5,
      },
    ];
  });
}

export function normalizePoseDetectionRules(raw?: unknown): PoseDetectionRules {
  const record = objectRecord(raw);
  if (!record) {
    return DEFAULT_SQUAT_RULES;
  }

  const keyAngles =
    parseKeyAngles(record.key_angles ?? record.keyAngles) ??
    DEFAULT_SQUAT_RULES.keyAngles;
  const phaseRules =
    parsePhaseRules(record.phase_rules ?? record.phaseRules) ??
    DEFAULT_SQUAT_RULES.phaseRules;
  const mode = record.mode === "hold" ? "hold" : "reps";
  const repSequence =
    mode === "hold"
      ? []
      : parseRepSequence(
          record.rep_sequence ?? record.repSequence,
          DEFAULT_SQUAT_RULES.repSequence,
        );
  const scoring = objectRecord(record.scoring);

  return {
    type: optionalString(record.type) ?? DEFAULT_SQUAT_RULES.type,
    mode,
    displayName: optionalString(record.display_name ?? record.displayName),
    keyAngles,
    phaseRules,
    defaultPhase:
      optionalString(record.default_phase ?? record.defaultPhase) ??
      DEFAULT_SQUAT_RULES.defaultPhase,
    defaultScore:
      optionalNumber(record.default_score ?? record.defaultScore) ??
      DEFAULT_SQUAT_RULES.defaultScore,
    defaultFeedback:
      optionalString(record.default_feedback ?? record.defaultFeedback) ??
      DEFAULT_SQUAT_RULES.defaultFeedback,
    repSequence,
    symmetryRules:
      parseSymmetryRules(scoring?.symmetry ?? record.symmetryRules) ?? [],
  };
}

function jointAngle(landmarks: PoseLandmark[], triple: JointTriple) {
  const [firstIndex, middleIndex, lastIndex] = triple;
  const first = landmarks[firstIndex];
  const middle = landmarks[middleIndex];
  const last = landmarks[lastIndex];
  if (!isVisible(first) || !isVisible(middle) || !isVisible(last)) {
    return null;
  }
  return calculateAngle(first, middle, last);
}

function calculateKeyAngles(landmarks: PoseLandmark[], rules: PoseDetectionRules) {
  return Object.fromEntries(
    Object.entries(rules.keyAngles).map(([name, triple]) => [
      name,
      jointAngle(landmarks, triple),
    ]),
  ) as Record<string, number | null>;
}

function valuesByToken(keyAngles: Record<string, number | null>, token: string) {
  const normalizedToken = token.toLowerCase();
  return Object.entries(keyAngles)
    .filter(([name]) => name.toLowerCase().includes(normalizedToken))
    .map(([, value]) => value)
    .filter((value): value is number => value !== null);
}

function metricValue(metric: string, keyAngles: Record<string, number | null>) {
  const direct = keyAngles[metric];
  if (direct !== undefined) {
    return direct;
  }

  const aggregateMatch = /^(min|max)([A-Z][A-Za-z]*?)(?:Angle)?$/.exec(metric);
  if (!aggregateMatch) {
    return null;
  }
  const [, aggregate, rawToken] = aggregateMatch;
  const values = valuesByToken(keyAngles, rawToken);
  if (values.length === 0) {
    return null;
  }
  return aggregate === "min" ? Math.min(...values) : Math.max(...values);
}

function matchesPhaseRule(rule: PhaseRule, keyAngles: Record<string, number | null>) {
  const value = metricValue(rule.metric, keyAngles);
  if (value === null) {
    return false;
  }
  if (rule.min !== undefined && value < rule.min) {
    return false;
  }
  if (rule.max !== undefined && value > rule.max) {
    return false;
  }
  return true;
}

function visibleAngleCount(keyAngles: Record<string, number | null>) {
  return Object.values(keyAngles).filter((value) => value !== null).length;
}

function symmetryPenalty(
  keyAngles: Record<string, number | null>,
  rules: PoseDetectionRules,
) {
  return rules.symmetryRules.reduce((penalty, rule) => {
    const left = keyAngles[rule.left];
    const right = keyAngles[rule.right];
    if (left === null || right === null || left === undefined || right === undefined) {
      return penalty;
    }
    return penalty + Math.abs(left - right) * rule.penaltyPerDegree;
  }, 0);
}

export function summarizePoseFrame(
  landmarks: PoseLandmark[],
  rawRules?: unknown,
): Omit<PoseFrameSummary, "timestampMs" | "reps" | "bestScore"> {
  const rules = normalizePoseDetectionRules(rawRules);
  const keyAngles = calculateKeyAngles(landmarks, rules);

  if (visibleAngleCount(keyAngles) === 0) {
    return {
      phase: "unknown",
      score: 0,
      feedback: "保持全身进入画面",
      keyAngles,
    };
  }

  const phaseRule = rules.phaseRules.find((rule) =>
    matchesPhaseRule(rule, keyAngles),
  );
  const phase = phaseRule?.phase ?? rules.defaultPhase;
  const baseScore = phaseRule?.score ?? rules.defaultScore;
  const score = Math.max(0, Math.min(100, baseScore - symmetryPenalty(keyAngles, rules)));

  return {
    phase,
    score,
    feedback: phaseRule?.feedback ?? rules.defaultFeedback,
    keyAngles,
  };
}

export function createRepCounter(rawRules?: unknown) {
  const rules = normalizePoseDetectionRules(rawRules);
  let sequenceIndex = 0;
  let reps = 0;
  let bestScore = 0;

  function ingestPhase(phase: string) {
    const sequence = rules.repSequence;
    if (rules.mode === "hold" || sequence.length < 2) {
      return;
    }
    if (phase === sequence[sequenceIndex]) {
      return;
    }
    if (phase === sequence[sequenceIndex + 1]) {
      sequenceIndex += 1;
      if (sequenceIndex === sequence.length - 1) {
        reps += 1;
        sequenceIndex = 0;
      }
      return;
    }
    sequenceIndex = phase === sequence[0] ? 0 : sequenceIndex;
  }

  return {
    rules,
    ingest(landmarks: PoseLandmark[], timestampMs: number): PoseFrameSummary {
      const summary = summarizePoseFrame(landmarks, rules);
      ingestPhase(summary.phase);
      bestScore = Math.max(bestScore, summary.score);

      return {
        timestampMs,
        reps,
        bestScore,
        ...summary,
      };
    },
    reset() {
      sequenceIndex = 0;
      reps = 0;
      bestScore = 0;
    },
  };
}
