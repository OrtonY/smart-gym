import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  CircleStop,
  Copy,
  Play,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

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
import { loadPoseLandmarker } from "../../pose/mediapipe";
import {
  createRepCounter,
  normalizePoseDetectionRules,
  type PoseFrameSummary,
  type PoseLandmark,
} from "../../pose/poseMetrics";
import {
  formatCameraStartupError,
  getBrowserCameraSupportError,
} from "../../pose/cameraSupport";
import {
  clearPoseDebugLogs,
  emitPoseError,
  emitPoseLog,
  formatPoseDebugLogEntry,
  subscribePoseDebugLogs,
  toErrorDiagnostics,
  type PoseDebugLogEntry,
} from "../../pose/debugLog";

function numericParam(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function cameraEnvironmentDiagnostics() {
  return {
    protocol: window.location.protocol,
    host: window.location.host,
    isSecureContext: window.isSecureContext,
    hasMediaDevices: Boolean(navigator.mediaDevices),
    hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
    userAgent: navigator.userAgent,
  };
}

function videoTrackDiagnostics(stream: MediaStream) {
  return stream.getVideoTracks().map((track) => {
    const settings = track.getSettings();
    return {
      label: track.label,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      settings: {
        facingMode: settings.facingMode,
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
      },
    };
  });
}

function drawLandmarks(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: PoseLandmark[],
) {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  context.fillStyle = "#14b8a6";
  landmarks.forEach((landmark) => {
    if ((landmark.visibility ?? 1) < 0.5) {
      return;
    }
    context.beginPath();
    context.arc(
      landmark.x * canvas.width,
      landmark.y * canvas.height,
      4,
      0,
      Math.PI * 2,
    );
    context.fill();
  });
}

export default function PoseDetectionPage() {
  const [searchParams] = useSearchParams();
  const exerciseId = numericParam(searchParams.get("exerciseId"));
  const workoutModeId = numericParam(searchParams.get("workoutModeId"));
  const titleParam = searchParams.get("title");
  const isDebugMode = searchParams.get("debug") === "1";

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const counterRef = useRef(createRepCounter());
  const startedAtRef = useRef<Date | null>(null);

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [modes, setModes] = useState<WorkoutMode[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<PoseFrameSummary | null>(null);
  const [snapshots, setSnapshots] = useState<PoseFrameSummary[]>([]);
  const [landmarkSamples, setLandmarkSamples] = useState<PoseLandmark[][]>([]);
  const [savedResult, setSavedResult] = useState<PoseDetectionResult | null>(null);
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

  function stopCamera(updateState = true) {
    const activeStream = streamRef.current;
    if (activeStream || frameRef.current !== null) {
      emitPoseLog("camera:stop", {
        hadAnimationFrame: frameRef.current !== null,
        tracks: activeStream ? videoTrackDiagnostics(activeStream) : [],
        updateState,
      });
    }
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (updateState) {
      setIsRunning(false);
    }
  }

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
      stopCamera(false);
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

  async function startCamera() {
    const runId = `${Date.now()}`;
    const detectionRules = normalizePoseDetectionRules(exercise?.detection_rules);
    counterRef.current = createRepCounter(detectionRules);
    setError(null);
    setStatus(null);
    setSavedResult(null);
    counterRef.current.reset();
    setSnapshot(null);
    setSnapshots([]);
    setLandmarkSamples([]);
    startedAtRef.current = new Date();

    try {
      emitPoseLog("startCamera:begin", {
        runId,
        ruleType: detectionRules.type,
        exerciseId,
        environment: cameraEnvironmentDiagnostics(),
      });
      const cameraSupportError = getBrowserCameraSupportError();
      if (cameraSupportError) {
        emitPoseLog("startCamera:support-check-failed", {
          runId,
          cameraSupportError,
        });
        throw new Error(cameraSupportError);
      }

      const video = videoRef.current;
      if (!video) {
        emitPoseLog("startCamera:video-ref-missing", { runId });
        throw new Error("视频组件未就绪");
      }

      const constraints: MediaStreamConstraints = {
        video: { facingMode: "user" },
        audio: false,
      };
      emitPoseLog("getUserMedia:request", { runId, constraints });
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      emitPoseLog("getUserMedia:success", {
        runId,
        tracks: videoTrackDiagnostics(stream),
      });
      streamRef.current = stream;
      video.srcObject = stream;
      emitPoseLog("video:play-request", {
        runId,
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      await video.play();
      emitPoseLog("video:play-success", {
        runId,
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
      emitPoseLog("mediapipe:load-request", { runId });
      const landmarker = await loadPoseLandmarker();
      emitPoseLog("mediapipe:load-success", { runId });
      setIsRunning(true);

      let didLogFirstFrame = false;
      let didLogFirstLandmarks = false;
      const loop = () => {
        try {
          const timestampMs = performance.now();
          const result = landmarker.detectForVideo(video, timestampMs);
          const landmarks = (result.landmarks[0] ?? []) as PoseLandmark[];
          if (!didLogFirstFrame) {
            didLogFirstFrame = true;
            emitPoseLog("detect:first-frame", {
              runId,
              landmarkSets: result.landmarks.length,
              videoReadyState: video.readyState,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
            });
          }
          if (landmarks.length > 0) {
            if (!didLogFirstLandmarks) {
              didLogFirstLandmarks = true;
              emitPoseLog("detect:first-landmarks", {
                runId,
                landmarkCount: landmarks.length,
              });
            }
            const nextSnapshot = counterRef.current.ingest(
              landmarks,
              timestampMs,
            );
            setSnapshot(nextSnapshot);
            setSnapshots((current) => [...current.slice(-29), nextSnapshot]);
            setLandmarkSamples((current) => [...current.slice(-4), landmarks]);
            const canvas = canvasRef.current;
            if (canvas) {
              drawLandmarks(canvas, video, landmarks);
            }
          }
          frameRef.current = requestAnimationFrame(loop);
        } catch (caught) {
          stopCamera();
          const formattedError = formatCameraStartupError(caught);
          emitPoseError(
            "detect:error",
            {
              runId,
              formattedError,
              diagnostics: toErrorDiagnostics(caught),
              videoReadyState: video.readyState,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
            },
            caught,
          );
          setError(formattedError);
        }
      };
      loop();
    } catch (caught) {
      stopCamera();
      const formattedError = formatCameraStartupError(caught);
      emitPoseError(
        "startCamera:error",
        {
          runId,
          formattedError,
          diagnostics: toErrorDiagnostics(caught),
        },
        caught,
      );
      setError(formattedError);
    }
  }

  async function saveResult() {
    const startedAt = startedAtRef.current;
    if (!startedAt || !snapshot) {
      setError("没有可保存的检测结果");
      return;
    }
    const endedAt = new Date();
    const durationSeconds = Math.max(
      1,
      Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    );
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
          rule_type: counterRef.current.rules.type,
          rule_mode: counterRef.current.rules.mode,
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 shadow-soft">
          <div className="relative aspect-[4/3]">
            <video ref={videoRef} className="hidden" playsInline muted />
            <canvas ref={canvasRef} className="h-full w-full" />
            {!isRunning && !snapshot ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
                摄像头未启动
              </div>
            ) : null}
          </div>
        </div>

        <aside className="space-y-3">
          <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-2xl font-semibold text-slate-950">
                  {snapshot?.reps ?? 0}
                </p>
                <p className="mt-1 text-xs text-slate-500">次数</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-950">
                  {Math.round(snapshot?.bestScore ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">评分</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-slate-950">
                  {snapshot?.phase ?? "unknown"}
                </p>
                <p className="mt-1 text-xs text-slate-500">状态</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              {snapshot?.feedback ?? "开始后保持全身进入画面。"}
            </p>
          </article>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
              disabled={isRunning}
              onClick={() => void startCamera()}
              type="button"
            >
              {isRunning ? (
                <Camera aria-hidden="true" size={17} />
              ) : (
                <Play aria-hidden="true" size={17} />
              )}
              开始
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-gym-teal hover:text-gym-teal disabled:opacity-60"
              disabled={!isRunning}
              onClick={() => stopCamera()}
              type="button"
            >
              <CircleStop aria-hidden="true" size={17} />
              结束
            </button>
          </div>

          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            disabled={isRunning || isSaving || !snapshot}
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
        </aside>
      </div>
    </section>
  );
}
