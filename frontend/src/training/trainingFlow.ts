export type WorkoutStepLike = {
  status: string;
  score?: number | null;
  actual_duration_seconds?: number | null;
};

export type WorkoutStepSummary = {
  completedSteps: number;
  averageScore: number | null;
  durationSeconds: number;
};

export function summarizeWorkoutSteps(
  steps: WorkoutStepLike[],
): WorkoutStepSummary {
  const completedSteps = steps.filter((step) => step.status === "completed").length;
  const scores = steps
    .map((step) => step.score)
    .filter((score): score is number => typeof score === "number");
  const durationSeconds = steps.reduce(
    (total, step) => total + (step.actual_duration_seconds ?? 0),
    0,
  );

  return {
    completedSteps,
    averageScore:
      scores.length > 0
        ? Math.round((scores.reduce((total, score) => total + score, 0) / scores.length) * 100) /
          100
        : null,
    durationSeconds,
  };
}

export function nextStepIndex(currentIndex: number, stepsCount: number) {
  return Math.min(currentIndex + 1, Math.max(stepsCount - 1, 0));
}
