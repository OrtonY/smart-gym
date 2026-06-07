import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, CircleStop, SkipForward } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  Exercise,
  WorkoutMode,
  WorkoutSessionStartResponse,
  WorkoutSessionStep,
  WorkoutSessionStepFinishPayload,
  fetchExercises,
  fetchWorkoutModes,
  finishWorkoutSession,
} from "../../api/client";
import PoseDetectionPanel, {
  PoseDetectionSnapshotState,
} from "../../components/PoseDetectionPanel";
import { nextStepIndex, summarizeWorkoutSteps } from "../../training/trainingFlow";

type StepResult = {
  status: "completed" | "partial" | "skipped";
  snapshotState: PoseDetectionSnapshotState | null;
};

function activeSessionKey(sessionId: string) {
  return `smart-gym-active-session:${sessionId}`;
}

function finishedSessionKey(sessionId: string) {
  return `smart-gym-finished-session:${sessionId}`;
}

function readSession(sessionId: string | undefined) {
  if (!sessionId) {
    return null;
  }
  const raw = sessionStorage.getItem(activeSessionKey(sessionId));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as WorkoutSessionStartResponse;
  } catch {
    return null;
  }
}

function durationMinutesFrom(startedAt: string) {
  const elapsed = Date.now() - new Date(startedAt).getTime();
  return Math.max(1, Math.ceil(elapsed / 60_000));
}

function stepMeta(step: WorkoutSessionStep) {
  return [
    step.planned_sets ? `${step.planned_sets} 组` : null,
    step.planned_reps ? `${step.planned_reps} 次` : null,
    step.planned_duration_seconds
      ? `${Math.round(step.planned_duration_seconds / 60)} 分钟`
      : null,
    step.planned_rest_seconds ? `休息 ${step.planned_rest_seconds} 秒` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function GuidedWorkoutPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session] = useState(() => readSession(sessionId));
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [modes, setModes] = useState<WorkoutMode[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [results, setResults] = useState<Record<number, StepResult>>({});
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestPoseStateRef = useRef<PoseDetectionSnapshotState | null>(null);

  const steps = session?.steps ?? [];
  const activeStep = steps[activeIndex] ?? null;
  const exercise = useMemo(
    () => exercises.find((item) => item.id === activeStep?.exercise_id) ?? null,
    [activeStep?.exercise_id, exercises],
  );
  const workoutMode = useMemo(
    () => modes.find((item) => item.id === activeStep?.workout_mode_id) ?? null,
    [activeStep?.workout_mode_id, modes],
  );

  useEffect(() => {
    let isMounted = true;
    void Promise.all([fetchExercises(), fetchWorkoutModes()])
      .then(([nextExercises, nextModes]) => {
        if (!isMounted) {
          return;
        }
        setExercises(nextExercises);
        setModes(nextModes);
      })
      .catch((caught) => {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "训练配置读取失败");
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  function saveCurrentStep(status: StepResult["status"]) {
    if (!activeStep) {
      return;
    }
    setResults((current) => ({
      ...current,
      [activeStep.sort_order]: {
        status,
        snapshotState: latestPoseStateRef.current,
      },
    }));
  }

  function handleCompleteAndNext() {
    saveCurrentStep("completed");
    setActiveIndex((current) => nextStepIndex(current, steps.length));
  }

  function handleSkipAndNext() {
    saveCurrentStep("skipped");
    setActiveIndex((current) => nextStepIndex(current, steps.length));
  }

  function finishPayloadSteps(
    nextResults: Record<number, StepResult>,
  ): WorkoutSessionStepFinishPayload[] {
    return steps.map((step) => {
      const result = nextResults[step.sort_order];
      const snapshot = result?.snapshotState?.snapshot ?? null;
      const status = result?.status ?? "completed";
      return {
        sort_order: step.sort_order,
        title: step.title,
        actual_reps: snapshot?.reps ?? null,
        actual_duration_seconds:
          result?.snapshotState?.startedAt && result.snapshotState.snapshot
            ? Math.max(
                1,
                Math.round(
                  (Date.now() - result.snapshotState.startedAt.getTime()) / 1000,
                ),
              )
            : step.planned_duration_seconds ?? null,
        score: snapshot?.bestScore ?? null,
        status,
        pose_detection_result_id: null,
        notes: snapshot?.feedback ?? null,
      };
    });
  }

  async function handleFinish() {
    if (!session || !sessionId) {
      return;
    }
    const nextResults =
      activeStep && !results[activeStep.sort_order]
        ? {
            ...results,
            [activeStep.sort_order]: {
              status: "completed" as const,
              snapshotState: latestPoseStateRef.current,
            },
          }
        : results;
    setResults(nextResults);
    const payloadSteps = finishPayloadSteps(nextResults);
    const summary = summarizeWorkoutSteps(payloadSteps);
    const durationMinutes = durationMinutesFrom(session.started_at);
    setIsFinishing(true);
    setError(null);
    try {
      const finished = await finishWorkoutSession(session.id, {
        ended_at: new Date().toISOString(),
        duration_minutes: durationMinutes,
        calories_burned: Math.max(0, Math.round(durationMinutes * 6)),
        status: steps.length === 0 || payloadSteps.some((step) => step.status === "completed")
          ? "completed"
          : "abandoned",
        reps: payloadSteps.reduce(
          (total, step) => total + (step.actual_reps ?? 0),
          0,
        ),
        score: summary.averageScore,
        notes: null,
        steps: payloadSteps,
      });
      sessionStorage.setItem(finishedSessionKey(sessionId), JSON.stringify(finished));
      sessionStorage.removeItem(activeSessionKey(sessionId));
      navigate(`/app/train/session/${sessionId}/review`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "结束训练失败");
    } finally {
      setIsFinishing(false);
    }
  }

  if (!session) {
    return (
      <section className="space-y-5">
        <h2 className="text-2xl font-semibold text-slate-950">训练进行中</h2>
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          没有找到进行中的训练。
          <Link className="ml-2 font-semibold text-gym-teal" to="/app/train">
            返回训练
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">训练进行中</h2>
          <p className="mt-1 text-sm text-slate-600">
            {activeStep ? `${activeIndex + 1}/${steps.length} · ${activeStep.title}` : "自由训练"}
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isFinishing}
          type="button"
          onClick={() => void handleFinish()}
        >
          <CircleStop aria-hidden="true" size={17} />
          {isFinishing ? "保存中" : "结束训练"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {activeStep ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-slate-950">
                {activeStep.title}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {stepMeta(activeStep) || "动作记录"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                type="button"
                onClick={handleSkipAndNext}
              >
                <SkipForward aria-hidden="true" size={16} />
                跳过
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md bg-gym-teal px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                type="button"
                onClick={handleCompleteAndNext}
              >
                {activeIndex >= steps.length - 1 ? (
                  <Check aria-hidden="true" size={16} />
                ) : (
                  <ChevronRight aria-hidden="true" size={16} />
                )}
                完成
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {session.pose_detection_enabled && activeStep ? (
        <PoseDetectionPanel
          enabled
          exercise={exercise}
          title={activeStep.title}
          workoutMode={workoutMode}
          onSnapshotChange={(state) => {
            latestPoseStateRef.current = state;
          }}
        />
      ) : null}

      {!session.pose_detection_enabled ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-soft">
          本次训练未开启姿态检测。
        </div>
      ) : null}
    </section>
  );
}
