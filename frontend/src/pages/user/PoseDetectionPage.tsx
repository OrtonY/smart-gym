import { useEffect, useMemo, useState } from "react";
import { Copy, Save, Sparkles, Trash2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import PoseDetectionPanel, {
  type PoseDetectionSnapshotState,
} from "../../components/PoseDetectionPanel";
import {
  Exercise,
  PoseDetectionResult,
  WorkoutMode,
  createPoseDetectionResult,
  createWorkoutSession,
  fetchExercises,
  fetchWorkoutModes,
  requestPoseAdvice,
} from "../../api/client";
import { normalizePoseDetectionRules } from "../../pose/poseMetrics";
import {
  clearPoseDebugLogs,
  formatPoseDebugLogEntry,
  subscribePoseDebugLogs,
  type PoseDebugLogEntry,
} from "../../pose/debugLog";

function numericParam(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

const emptySnapshotState: PoseDetectionSnapshotState = {
  snapshot: null,
  snapshots: [],
  landmarkSamples: [],
  startedAt: null,
  isRunning: false,
};

export default function PoseDetectionPage() {
  const [searchParams] = useSearchParams();
  const exerciseId = numericParam(searchParams.get("exerciseId"));
  const workoutModeId = numericParam(searchParams.get("workoutModeId"));
  const titleParam = searchParams.get("title");
  const isDebugMode = searchParams.get("debug") === "1";

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [modes, setModes] = useState<WorkoutMode[]>([]);
  const [snapshotState, setSnapshotState] =
    useState<PoseDetectionSnapshotState>(emptySnapshotState);
  const [savedResult, setSavedResult] = useState<PoseDetectionResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<PoseDebugLogEntry[]>([]);
  const [debugCopyStatus, setDebugCopyStatus] = useState<string | null>(null);

  const exercise = useMemo(
    () => exercises.find((item) => item.id === exerciseId) ?? null,
    [exerciseId, exercises],
  );
  const workoutMode = useMemo(
    () => modes.find((item) => item.id === workoutModeId) ?? null,
    [workoutModeId, modes],
  );
  const displayTitle =
    titleParam?.trim() || exercise?.name || workoutMode?.name || "动作检测";
  const debugLogText = useMemo(
    () => debugLogs.map(formatPoseDebugLogEntry).join("\n"),
    [debugLogs],
  );

  useEffect(() => {
    if (!isDebugMode) {
      return undefined;
    }
    return subscribePoseDebugLogs(setDebugLogs);
  }, [isDebugMode]);

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
          setError(caught instanceof Error ? caught.message : "检测配置读取失败");
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  async function copyDebugLogs() {
    setDebugCopyStatus(null);
    try {
      await navigator.clipboard.writeText(debugLogText || "暂无调试日志");
      setDebugCopyStatus("已复制");
    } catch {
      setDebugCopyStatus("复制失败，请长按日志手动选择");
    }
  }

  async function saveResult() {
    const { startedAt, snapshot, snapshots, landmarkSamples } = snapshotState;
    if (!startedAt || !snapshot) {
      setError("没有可保存的检测结果");
      return;
    }
    const endedAt = new Date();
    const durationSeconds = Math.max(
      1,
      Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    );
    const detectionRules = normalizePoseDetectionRules(exercise?.detection_rules);
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      const session = await createWorkoutSession({
        workout_mode_id: workoutModeId,
        exercise_id: exerciseId,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        duration_minutes: Math.max(1, Math.ceil(durationSeconds / 60)),
        calories_burned: 0,
        reps: snapshot.reps,
        score: snapshot.bestScore,
        status: "completed",
        notes: snapshot.feedback,
      });
      const result = await createPoseDetectionResult({
        workout_session_id: session.id,
        exercise_id: exerciseId,
        workout_mode_id: workoutModeId,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        duration_seconds: durationSeconds,
        reps_counted: snapshot.reps,
        score: snapshot.bestScore,
        feedback_summary: snapshot.feedback,
        metrics_json: {
          source: "mediapipe_pose_landmarker",
          display_title: displayTitle,
          rule_type: detectionRules.type,
          rule_mode: detectionRules.mode,
          snapshots,
          detection_rules: exercise?.detection_rules ?? null,
        },
        landmarks_sample_json: { frames: landmarkSamples },
      });
      setSavedResult(result);
      setStatus("检测结果已保存");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "检测结果保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function loadAdvice() {
    if (!savedResult) {
      return;
    }
    setIsAdviceLoading(true);
    setError(null);
    try {
      const response = await requestPoseAdvice(savedResult.id);
      setSavedResult(response.result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 动作建议生成失败");
    } finally {
      setIsAdviceLoading(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">{displayTitle}</h2>
          <p className="mt-1 text-sm text-slate-600">
            浏览器实时检测姿态，结束后保存训练记录和动作报告。
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-gym-teal hover:text-gym-teal"
          to="/app/train"
        >
          返回训练
        </Link>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {status ? <p className="text-sm text-gym-teal">{status}</p> : null}
      {isDebugMode ? (
        <article className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">调试日志</h3>
            <div className="flex items-center gap-2">
              {debugCopyStatus ? (
                <span className="text-xs text-amber-800">{debugCopyStatus}</span>
              ) : null}
              <button
                className="inline-flex items-center gap-1 rounded-md border border-amber-400 px-2 py-1 text-xs font-semibold text-amber-950"
                onClick={() => void copyDebugLogs()}
                type="button"
              >
                <Copy aria-hidden="true" size={14} />
                复制
              </button>
              <button
                className="inline-flex items-center gap-1 rounded-md border border-amber-400 px-2 py-1 text-xs font-semibold text-amber-950"
                onClick={() => {
                  clearPoseDebugLogs();
                  setDebugCopyStatus(null);
                }}
                type="button"
              >
                <Trash2 aria-hidden="true" size={14} />
                清空
              </button>
            </div>
          </div>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
            {debugLogText || "暂无日志，点击开始后会显示。"}
          </pre>
        </article>
      ) : null}

      <PoseDetectionPanel
        enabled
        exercise={exercise}
        title={displayTitle}
        workoutMode={workoutMode}
        onSnapshotChange={setSnapshotState}
      />

      <button
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60 sm:w-auto"
        disabled={snapshotState.isRunning || isSaving || !snapshotState.snapshot}
        onClick={() => void saveResult()}
        type="button"
      >
        <Save aria-hidden="true" size={17} />
        {isSaving ? "保存中" : "保存结果"}
      </button>

      {savedResult ? (
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <h3 className="text-base font-semibold text-slate-950">动作报告</h3>
          <p className="mt-2 text-sm text-slate-600">
            {savedResult.reps_counted} 次 · {Math.round(savedResult.score ?? 0)} 分
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {savedResult.feedback_summary}
          </p>
          <button
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-gym-teal px-4 py-2 text-sm font-semibold text-gym-teal transition hover:bg-gym-mint disabled:opacity-60"
            disabled={isAdviceLoading}
            onClick={() => void loadAdvice()}
            type="button"
          >
            <Sparkles aria-hidden="true" size={17} />
            {isAdviceLoading ? "生成中" : "AI 建议"}
          </button>
          {savedResult.ai_advice ? (
            <p className="mt-3 text-sm leading-6 text-slate-700">
              {savedResult.ai_advice}
            </p>
          ) : null}
        </article>
      ) : null}
    </section>
  );
}
