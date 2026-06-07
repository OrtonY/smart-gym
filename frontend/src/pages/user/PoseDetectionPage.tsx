import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CircleStop, Play, Save, Sparkles } from "lucide-react";
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
  type PoseFrameSummary,
  type PoseLandmark,
} from "../../pose/poseMetrics";
import { getBrowserCameraSupportError } from "../../pose/cameraSupport";

function numericParam(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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

  function stopCamera(updateState = true) {
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

  async function startCamera() {
    setError(null);
    setStatus(null);
    setSavedResult(null);
    counterRef.current.reset();
    setSnapshot(null);
    setSnapshots([]);
    setLandmarkSamples([]);
    startedAtRef.current = new Date();

    try {
      const cameraSupportError = getBrowserCameraSupportError();
      if (cameraSupportError) {
        throw new Error(cameraSupportError);
      }

      const video = videoRef.current;
      if (!video) {
        throw new Error("视频组件未就绪");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      const landmarker = await loadPoseLandmarker();
      setIsRunning(true);

      const loop = () => {
        const result = landmarker.detectForVideo(video, performance.now());
        const landmarks = (result.landmarks[0] ?? []) as PoseLandmark[];
        if (landmarks.length > 0) {
          const nextSnapshot = counterRef.current.ingest(
            landmarks,
            performance.now(),
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
      };
      loop();
    } catch (caught) {
      stopCamera();
      setError(caught instanceof Error ? caught.message : "摄像头或动作检测启动失败");
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
