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

const SYSTEM_SECONDS_PER_REP = 5;
const NEXT_STEP_WAIT_SECONDS = 60;

type StepResult = {
  status: "completed" | "partial" | "skipped";
  snapshotState: PoseDetectionSnapshotState | null;
  actualDurationSeconds: number;
  actualRestSeconds: number;
  actualReps: number | null;
  completedSets: number;
  accumulatedReps: number;
  accumulatedDurationSeconds: number;
};

type StepTiming = {
  activeStartedAt: number;
  activeElapsedSeconds: number;
  restStartedAt: number | null;
  restElapsedSeconds: number;
};

type AutoRestState = {
  stepKey: number;
  setNumber: number;
  endsAt: number;
};

type AutoNextStepState = {
  stepKey: number;
  endsAt: number;
};

type StoredWorkoutSession = WorkoutSessionStartResponse & {
  client_started_at?: string;
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
    return JSON.parse(raw) as StoredWorkoutSession;
  } catch {
    return null;
  }
}

function durationMinutesFrom(startedAtMs: number) {
  const elapsed = Date.now() - startedAtMs;
  return Math.max(0, Math.ceil(elapsed / 60_000));
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function elapsedSecondsSince(startedAt: number) {
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
}

function sessionStartedAtMs(session: StoredWorkoutSession) {
  return new Date(session.client_started_at ?? session.started_at).getTime();
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

function resultText(result: StepResult | undefined) {
  if (!result) {
    return "未记录";
  }
  return result.status === "completed"
    ? "已完成"
    : result.status === "skipped"
      ? "已跳过"
      : "部分完成";
}

function resultClass(result: StepResult | undefined) {
  if (!result) {
    return "bg-slate-100 text-slate-600";
  }
  return result.status === "completed"
    ? "bg-emerald-100 text-emerald-700"
    : result.status === "skipped"
      ? "bg-slate-200 text-slate-600"
      : "bg-amber-100 text-amber-700";
}

function fixedDurationSeconds(step: WorkoutSessionStep, measuredSeconds: number) {
  return step.planned_duration_seconds ?? measuredSeconds;
}

function hasDetectedReps(value: number | null | undefined) {
  return typeof value === "number" && value > 0;
}

function systemControlledSetSeconds(step: WorkoutSessionStep | null) {
  if (!step) {
    return 0;
  }
  if (step.planned_reps && step.planned_reps > 0) {
    return step.planned_reps * SYSTEM_SECONDS_PER_REP;
  }
  if (step.planned_duration_seconds && step.planned_duration_seconds > 0) {
    return step.planned_duration_seconds;
  }
  return SYSTEM_SECONDS_PER_REP;
}

export default function GuidedWorkoutPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session] = useState(() => readSession(sessionId));
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [modes, setModes] = useState<WorkoutMode[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [results, setResults] = useState<Record<number, StepResult>>({});
  const [setBaselines, setSetBaselines] = useState<Record<number, number>>({});
  const [timing, setTiming] = useState<StepTiming>(() => {
    const now = Date.now();
    return {
      activeStartedAt: now,
      activeElapsedSeconds: 0,
      restStartedAt: null,
      restElapsedSeconds: 0,
    };
  });
  const [autoRest, setAutoRest] = useState<AutoRestState | null>(null);
  const [autoNextStep, setAutoNextStep] = useState<AutoNextStepState | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const currentStepKey = activeStep?.sort_order ?? -1;
  const activeElapsedSeconds =
    timing.activeElapsedSeconds +
    (timing.restStartedAt ? 0 : elapsedSecondsSince(timing.activeStartedAt));
  const restElapsedSeconds =
    timing.restElapsedSeconds +
    (timing.restStartedAt ? elapsedSecondsSince(timing.restStartedAt) : 0);
  const totalElapsedSeconds = session
    ? elapsedSecondsSince(sessionStartedAtMs(session))
    : 0;
  const currentTotalReps = latestPoseStateRef.current?.snapshot?.reps ?? 0;
  const currentSetStartReps = setBaselines[currentStepKey] ?? 0;
  const currentSetReps = Math.max(0, currentTotalReps - currentSetStartReps);
  const completedSets = results[currentStepKey]?.completedSets ?? 0;
  const plannedSets = activeStep?.planned_sets ?? null;
  const plannedReps = activeStep?.planned_reps ?? null;
  const allSetsCompleted = Boolean(plannedSets && completedSets >= plannedSets);
  const displayedSetNumber = plannedSets
    ? Math.min(completedSets + 1, plannedSets)
    : completedSets + 1;
  const systemSetTargetSeconds = systemControlledSetSeconds(activeStep);
  const systemSetRemainingSeconds = Math.max(
    0,
    allSetsCompleted ? 0 : systemSetTargetSeconds - activeElapsedSeconds,
  );
  const autoRestRemainingSeconds = autoRest
    ? Math.max(0, Math.ceil((autoRest.endsAt - Date.now()) / 1000))
    : 0;
  const autoNextStepRemainingSeconds = autoNextStep
    ? Math.max(0, Math.ceil((autoNextStep.endsAt - Date.now()) / 1000))
    : 0;

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

  useEffect(() => {
    const interval = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const now = Date.now();
    setTiming({
      activeStartedAt: now,
      activeElapsedSeconds: 0,
      restStartedAt: null,
      restElapsedSeconds: 0,
    });
    setAutoRest(null);
    setAutoNextStep(null);
    setSetBaselines((current) => ({
      ...current,
      [currentStepKey]: latestPoseStateRef.current?.snapshot?.reps ?? 0,
    }));
  }, [currentStepKey]);

  void nowTick;

  function snapshotTiming() {
    return {
      activeSeconds:
        timing.activeElapsedSeconds +
        (timing.restStartedAt ? 0 : elapsedSecondsSince(timing.activeStartedAt)),
      restSeconds:
        timing.restElapsedSeconds +
        (timing.restStartedAt ? elapsedSecondsSince(timing.restStartedAt) : 0),
    };
  }

  function snapshotActualReps() {
    const snapshotReps = latestPoseStateRef.current?.snapshot?.reps;
    if (typeof snapshotReps === "number") {
      return Math.max(0, snapshotReps - (setBaselines[currentStepKey] ?? 0));
    }
    return null;
  }

  function startRestCountdown(step: WorkoutSessionStep, setNumber: number) {
    const now = Date.now();
    const restSeconds = step.planned_rest_seconds ?? 0;
    if (restSeconds <= 0) {
      resetCurrentSetAfterRest(step);
      return;
    }
    setTiming((current) => ({
        ...current,
        activeElapsedSeconds:
          current.activeElapsedSeconds + elapsedSecondsSince(current.activeStartedAt),
        restStartedAt: now,
    }));
    setAutoRest({
      stepKey: step.sort_order,
      setNumber,
      endsAt: now + restSeconds * 1000,
    });
    setNotice(`第 ${setNumber} 组完成，休息 ${restSeconds} 秒。`);
  }

  function resetCurrentSetAfterRest(step: WorkoutSessionStep) {
    const now = Date.now();
    setTiming((current) => ({
      activeStartedAt: now,
      activeElapsedSeconds: 0,
      restStartedAt: null,
      restElapsedSeconds:
        current.restElapsedSeconds +
        (current.restStartedAt ? elapsedSecondsSince(current.restStartedAt) : 0),
    }));
    setAutoRest(null);
    setSetBaselines((current) => ({
      ...current,
      [step.sort_order]: latestPoseStateRef.current?.snapshot?.reps ?? 0,
    }));
    setNotice(`休息结束，开始第 ${(results[step.sort_order]?.completedSets ?? 0) + 1} 组。`);
  }

  function startNextStepWait(step: WorkoutSessionStep) {
    const now = Date.now();
    setTiming((current) => ({
      activeStartedAt: now,
      activeElapsedSeconds: 0,
      restStartedAt: now,
      restElapsedSeconds:
        current.restElapsedSeconds +
        (current.restStartedAt ? elapsedSecondsSince(current.restStartedAt) : 0),
    }));
    setAutoNextStep({
      stepKey: step.sort_order,
      endsAt: now + NEXT_STEP_WAIT_SECONDS * 1000,
    });
    setNotice(
      `「${step.title}」已完成，${NEXT_STEP_WAIT_SECONDS} 秒后自动进入下一项。`,
    );
  }

  function moveToNextStep() {
    if (!activeStep) {
      return;
    }
    setAutoNextStep(null);
    setAutoRest(null);
    setActiveIndex((current) => nextStepIndex(current, steps.length));
  }

  function toggleRest() {
    if (autoRest && activeStep) {
      resetCurrentSetAfterRest(activeStep);
      return;
    }
    const now = Date.now();
    setTiming((current) => {
      if (current.restStartedAt) {
        return {
          ...current,
          activeStartedAt: now,
          restElapsedSeconds:
            current.restElapsedSeconds + elapsedSecondsSince(current.restStartedAt),
          restStartedAt: null,
        };
      }
      return {
        ...current,
        activeElapsedSeconds:
          current.activeElapsedSeconds + elapsedSecondsSince(current.activeStartedAt),
        restStartedAt: now,
      };
    });
  }

  function finishCurrentSet(startRest = false) {
    if (!activeStep) {
      return;
    }
    const actualReps = snapshotActualReps();
    const nextTiming = snapshotTiming();
    const previousResult = results[activeStep.sort_order];
    const nextSetNumber = (previousResult?.completedSets ?? 0) + 1;
    const completesAllSets = Boolean(
      activeStep.planned_sets && nextSetNumber >= activeStep.planned_sets,
    );
    const nextResults = {
      ...results,
      [activeStep.sort_order]: {
        status: completesAllSets ? "completed" as const : "partial" as const,
        snapshotState: latestPoseStateRef.current,
        actualDurationSeconds:
          (previousResult?.accumulatedDurationSeconds ?? 0) +
          nextTiming.activeSeconds,
        actualRestSeconds: nextTiming.restSeconds,
        actualReps:
          (previousResult?.accumulatedReps ?? 0) + (actualReps ?? 0) || null,
        completedSets: nextSetNumber,
        accumulatedReps:
          (previousResult?.accumulatedReps ?? 0) + (actualReps ?? 0),
        accumulatedDurationSeconds:
          (previousResult?.accumulatedDurationSeconds ?? 0) +
          nextTiming.activeSeconds,
      },
    };
    setResults(nextResults);
    if (startRest && (!activeStep.planned_sets || nextSetNumber < activeStep.planned_sets)) {
      startRestCountdown(activeStep, nextSetNumber);
    } else if (completesAllSets && activeIndex < steps.length - 1) {
      startNextStepWait(activeStep);
    } else if (completesAllSets && activeIndex >= steps.length - 1) {
      setNotice(`「${activeStep.title}」全部 ${activeStep.planned_sets} 组已完成，正在结束训练。`);
      void finishWithResults(nextResults);
    } else {
      const now = Date.now();
      setTiming((current) => ({
        activeStartedAt: now,
        activeElapsedSeconds: 0,
        restStartedAt: null,
        restElapsedSeconds:
          current.restElapsedSeconds +
          (current.restStartedAt ? elapsedSecondsSince(current.restStartedAt) : 0),
      }));
      setSetBaselines((current) => ({
        ...current,
        [activeStep.sort_order]: latestPoseStateRef.current?.snapshot?.reps ?? 0,
      }));
      setNotice(
        activeStep.planned_sets && nextSetNumber >= activeStep.planned_sets
          ? `「${activeStep.title}」全部 ${activeStep.planned_sets} 组已完成。`
          : `已记录「${activeStep.title}」第 ${nextSetNumber} 组。`,
      );
    }
  }

  useEffect(() => {
    if (
      !session?.pose_detection_enabled ||
      !activeStep ||
      autoRest ||
      autoNextStep ||
      allSetsCompleted ||
      !plannedReps ||
      currentSetReps < plannedReps
    ) {
      return;
    }
    finishCurrentSet(true);
  }, [
    activeStep,
    autoNextStep,
    autoRest,
    allSetsCompleted,
    currentSetReps,
    plannedReps,
    session?.pose_detection_enabled,
  ]);

  useEffect(() => {
    if (
      session?.pose_detection_enabled ||
      !activeStep ||
      autoRest ||
      autoNextStep ||
      allSetsCompleted ||
      systemSetTargetSeconds <= 0 ||
      activeElapsedSeconds < systemSetTargetSeconds
    ) {
      return;
    }
    finishCurrentSet(true);
  }, [
    activeElapsedSeconds,
    activeStep,
    allSetsCompleted,
    autoNextStep,
    autoRest,
    session?.pose_detection_enabled,
    systemSetTargetSeconds,
  ]);

  useEffect(() => {
    if (!autoRest || !activeStep || autoRest.stepKey !== activeStep.sort_order) {
      return;
    }
    if (autoRestRemainingSeconds > 0) {
      return;
    }
    resetCurrentSetAfterRest(activeStep);
  }, [activeStep, autoRest, autoRestRemainingSeconds]);

  useEffect(() => {
    if (!autoNextStep || !activeStep || autoNextStep.stepKey !== activeStep.sort_order) {
      return;
    }
    if (autoNextStepRemainingSeconds > 0) {
      return;
    }
    moveToNextStep();
  }, [activeStep, autoNextStep, autoNextStepRemainingSeconds]);

  function saveCurrentStep(status: StepResult["status"]) {
    if (!activeStep) {
      return null;
    }
    const actualReps = snapshotActualReps();
    const nextTiming = snapshotTiming();
    const previousResult = results[activeStep.sort_order];
    const currentSetHasWork = nextTiming.activeSeconds > 0 || (actualReps ?? 0) > 0;
    const nextCompletedSets =
      status === "skipped"
        ? previousResult?.completedSets ?? 0
        : Math.max(
            1,
            (previousResult?.completedSets ?? 0) +
              (currentSetHasWork &&
              (!plannedSets || (previousResult?.completedSets ?? 0) < plannedSets)
                ? 1
                : 0),
          );
    const nextResults = {
      ...results,
      [activeStep.sort_order]: {
        status,
        snapshotState: latestPoseStateRef.current,
        actualDurationSeconds:
          (previousResult?.accumulatedDurationSeconds ?? 0) +
          nextTiming.activeSeconds,
        actualRestSeconds: nextTiming.restSeconds,
        actualReps:
          (previousResult?.accumulatedReps ?? 0) + (actualReps ?? 0) || null,
        completedSets: nextCompletedSets,
        accumulatedReps:
          (previousResult?.accumulatedReps ?? 0) + (actualReps ?? 0),
        accumulatedDurationSeconds:
          (previousResult?.accumulatedDurationSeconds ?? 0) +
          nextTiming.activeSeconds,
      },
    };
    setResults(nextResults);
    return nextResults;
  }

  function nextNotice(status: StepResult["status"], step: WorkoutSessionStep) {
    const actionText = status === "completed" ? "完成" : "跳过";
    if (activeIndex >= steps.length - 1) {
      return `已${actionText}「${step.title}」。这是最后一个动作，点击“结束训练”查看复盘。`;
    }
    const nextStep = steps[activeIndex + 1];
    return `已${actionText}「${step.title}」，已进入「${nextStep.title}」。`;
  }

  function handleCompleteAndNext() {
    const step = activeStep;
    if (activeIndex >= steps.length - 1) {
      const nextResults = saveCurrentStep("completed") ?? results;
      void finishWithResults(nextResults);
      return;
    }
    if (autoNextStep) {
      moveToNextStep();
      return;
    }
    saveCurrentStep("completed");
    if (step) {
      setNotice(nextNotice("completed", step));
    }
    setActiveIndex((current) => nextStepIndex(current, steps.length));
  }

  function handleSkipAndNext() {
    const step = activeStep;
    saveCurrentStep("skipped");
    if (step) {
      setNotice(nextNotice("skipped", step));
    }
    setActiveIndex((current) => nextStepIndex(current, steps.length));
  }

  function finishPayloadSteps(
    nextResults: Record<number, StepResult>,
    poseDetectionEnabled: boolean,
  ): WorkoutSessionStepFinishPayload[] {
    return steps.map((step) => {
      const result = nextResults[step.sort_order];
      const snapshot = result?.snapshotState?.snapshot ?? null;
      const status = result?.status ?? "completed";
      const durationSeconds =
        result?.actualDurationSeconds ??
        (step.sort_order === activeStep?.sort_order ? snapshotTiming().activeSeconds : 0);
      const restSeconds =
        result?.actualRestSeconds ??
        (step.sort_order === activeStep?.sort_order ? snapshotTiming().restSeconds : 0);
      const detectedReps = result?.actualReps ?? snapshot?.reps ?? null;
      const useDetectedReps =
        poseDetectionEnabled && hasDetectedReps(detectedReps);
      const effectiveDurationSeconds = useDetectedReps
        ? durationSeconds
        : fixedDurationSeconds(step, durationSeconds);
      return {
        sort_order: step.sort_order,
        title: step.title,
        actual_reps: useDetectedReps ? detectedReps : null,
        actual_duration_seconds: effectiveDurationSeconds,
        score: snapshot?.bestScore ?? null,
        status,
        pose_detection_result_id: null,
        notes: [
          snapshot?.feedback ?? null,
          useDetectedReps
            ? `按检测次数统计 ${detectedReps} 次`
            : step.planned_duration_seconds
              ? `按固定时长统计 ${step.planned_duration_seconds} 秒`
              : null,
          restSeconds > 0 ? `休息 ${restSeconds} 秒` : null,
          result?.completedSets ? `完成 ${result.completedSets} 组` : null,
        ]
          .filter(Boolean)
          .join("；") || null,
      };
    });
  }

  async function finishWithResults(nextResults: Record<number, StepResult>) {
    if (!session || !sessionId) {
      return;
    }
    setResults(nextResults);
    const payloadSteps = finishPayloadSteps(nextResults, session.pose_detection_enabled);
    const summary = summarizeWorkoutSteps(payloadSteps);
    const durationMinutes = durationMinutesFrom(sessionStartedAtMs(session));
    setIsFinishing(true);
    setError(null);
    setNotice("正在保存本次训练...");
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
              actualDurationSeconds:
                (results[activeStep.sort_order]?.accumulatedDurationSeconds ?? 0) +
                snapshotTiming().activeSeconds,
              actualRestSeconds: snapshotTiming().restSeconds,
              actualReps:
                (results[activeStep.sort_order]?.accumulatedReps ?? 0) +
                  (snapshotActualReps() ?? 0) || null,
              completedSets: Math.max(1, results[activeStep.sort_order]?.completedSets ?? 0),
              accumulatedReps:
                (results[activeStep.sort_order]?.accumulatedReps ?? 0) +
                (snapshotActualReps() ?? 0),
              accumulatedDurationSeconds:
                (results[activeStep.sort_order]?.accumulatedDurationSeconds ?? 0) +
                snapshotTiming().activeSeconds,
            },
          }
        : results;
    await finishWithResults(nextResults);
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
      {notice ? (
        <div className="rounded-lg border border-gym-teal/30 bg-gym-mint px-4 py-3 text-sm font-medium text-gym-teal">
          {notice}
        </div>
      ) : null}

      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft">
        <article className="border-r border-slate-200 p-4">
          <p className="text-sm text-slate-600">锻炼时长</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">
            {formatDuration(totalElapsedSeconds)}
          </p>
        </article>
        <article className="p-4 text-right">
          <p className="text-sm text-slate-600">当前组时长</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">
            {formatDuration(activeElapsedSeconds)}
          </p>
        </article>
      </div>

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
              <p className="mt-2 text-sm font-medium text-slate-700">
                当前组 {plannedSets ? `${displayedSetNumber}/${plannedSets}` : displayedSetNumber}
                {session.pose_detection_enabled
                  ? ` · 本组计数 ${currentSetReps}${plannedReps ? `/${plannedReps}` : ""}`
                  : allSetsCompleted
                    ? " · 已完成"
                    : ` · 系统计时 ${formatDuration(systemSetRemainingSeconds)}`}
                {autoRest ? " · 休息中" : ""}
                {autoNextStep ? ` · ${autoNextStepRemainingSeconds} 秒后下一项` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                type="button"
                onClick={toggleRest}
              >
                {timing.restStartedAt ? "继续训练" : "休息"}
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                type="button"
                onClick={() => finishCurrentSet()}
              >
                完成本组
              </button>
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
                {autoNextStep ? "进入下一项" : "完成"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {session.pose_detection_enabled && activeStep ? (
        <PoseDetectionPanel
          enabled
          exercise={exercise}
          isResting={Boolean(autoRest)}
          repsOffset={currentSetStartReps}
          restRemainingSeconds={autoRestRemainingSeconds}
          title={activeStep.title}
          workoutMode={workoutMode}
          onSnapshotChange={(state) => {
            latestPoseStateRef.current = state;
          }}
        />
      ) : null}

      {!session.pose_detection_enabled ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
          <p className="text-sm font-semibold text-slate-950">
            {autoRest ? "休息中" : allSetsCompleted ? "本动作已完成" : "系统计时训练"}
          </p>
          <p className="mt-3 text-5xl font-semibold tabular-nums text-slate-950">
            {formatDuration(
              autoNextStep
                ? autoNextStepRemainingSeconds
                : autoRest
                ? autoRestRemainingSeconds
                : allSetsCompleted
                  ? 0
                  : systemSetRemainingSeconds,
            )}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {autoNextStep
              ? `${autoNextStepRemainingSeconds} 秒后自动进入下一项，也可以点击“进入下一项”。`
              : autoRest
              ? "倒计时结束后自动开始下一组。"
              : allSetsCompleted
                ? "该动作的计划组数已经完成，可以进入下一个动作或结束训练。"
                : `未开启姿态检测，系统按每次 ${SYSTEM_SECONDS_PER_REP} 秒控制动作节奏，到点后自动进入休息。`}
          </p>
        </div>
      ) : null}

      {steps.length > 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <h3 className="text-base font-semibold text-slate-950">动作进度</h3>
          <div className="mt-3 space-y-2">
            {steps.map((step, index) => {
              const result = results[step.sort_order];
              const isActive = index === activeIndex;
              return (
                <div
                  key={step.id}
                  className={[
                    "flex items-center justify-between gap-3 rounded-md border px-3 py-2",
                    isActive ? "border-gym-teal" : "border-slate-200",
                  ].join(" ")}
                >
                  <span className="min-w-0 truncate text-sm font-medium text-slate-700">
                    {index + 1}. {step.title}
                  </span>
                  <span
                    className={[
                      "shrink-0 rounded-md px-2 py-1 text-xs font-medium",
                      resultClass(result),
                    ].join(" ")}
                  >
                    {isActive && !result ? "当前" : resultText(result)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
