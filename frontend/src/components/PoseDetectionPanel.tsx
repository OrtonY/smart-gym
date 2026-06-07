import { useEffect, useRef, useState } from "react";
import { Camera, CircleStop, Play } from "lucide-react";

import { Exercise, WorkoutMode } from "../api/client";
import { loadPoseLandmarker } from "../pose/mediapipe";
import {
  createRepCounter,
  normalizePoseDetectionRules,
  type PoseFrameSummary,
  type PoseLandmark,
} from "../pose/poseMetrics";
import {
  formatCameraStartupError,
  getBrowserCameraSupportError,
} from "../pose/cameraSupport";
import {
  emitPoseError,
  emitPoseLog,
  toErrorDiagnostics,
} from "../pose/debugLog";

export type PoseDetectionSnapshotState = {
  snapshot: PoseFrameSummary | null;
  snapshots: PoseFrameSummary[];
  landmarkSamples: PoseLandmark[][];
  startedAt: Date | null;
  isRunning: boolean;
};

type PoseDetectionPanelProps = {
  exercise?: Exercise | null;
  workoutMode?: WorkoutMode | null;
  enabled?: boolean;
  isResting?: boolean;
  restRemainingSeconds?: number;
  repsOffset?: number;
  title: string;
  onSnapshotChange?: (state: PoseDetectionSnapshotState) => void;
};

function formatCountdown(totalSeconds: number) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
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

export default function PoseDetectionPanel({
  exercise,
  workoutMode,
  enabled = true,
  isResting = false,
  restRemainingSeconds = 0,
  repsOffset = 0,
  title,
  onSnapshotChange,
}: PoseDetectionPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const counterRef = useRef(createRepCounter());
  const startedAtRef = useRef<Date | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [snapshot, setSnapshot] = useState<PoseFrameSummary | null>(null);
  const [snapshots, setSnapshots] = useState<PoseFrameSummary[]>([]);
  const [landmarkSamples, setLandmarkSamples] = useState<PoseLandmark[][]>([]);
  const [error, setError] = useState<string | null>(null);
  const displayedReps = Math.max(0, (snapshot?.reps ?? 0) - repsOffset);

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
    onSnapshotChange?.({
      snapshot,
      snapshots,
      landmarkSamples,
      startedAt: startedAtRef.current,
      isRunning,
    });
  }, [isRunning, landmarkSamples, onSnapshotChange, snapshot, snapshots]);

  useEffect(() => {
    return () => stopCamera(false);
  }, []);

  async function startCamera() {
    if (!enabled) {
      return;
    }
    const runId = `${Date.now()}`;
    const detectionRules = normalizePoseDetectionRules(exercise?.detection_rules);
    counterRef.current = createRepCounter(detectionRules);
    setError(null);
    counterRef.current.reset();
    setSnapshot(null);
    setSnapshots([]);
    setLandmarkSamples([]);
    startedAtRef.current = new Date();

    try {
      emitPoseLog("startCamera:begin", {
        runId,
        ruleType: detectionRules.type,
        exerciseId: exercise?.id ?? null,
        workoutModeId: workoutMode?.id ?? null,
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
      await video.play();
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
            const nextSnapshot = counterRef.current.ingest(landmarks, timestampMs);
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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 shadow-soft">
        <div className="relative aspect-[4/3]">
          <video ref={videoRef} className="hidden" playsInline muted />
          <canvas ref={canvasRef} className="h-full w-full" />
          {!isRunning && !snapshot ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300">
              {enabled ? "摄像头未启动" : "姿态检测未开启"}
            </div>
          ) : null}
          {isResting ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/75 text-white">
              <p className="text-base font-semibold">休息中</p>
              <p className="mt-2 text-5xl font-semibold tabular-nums">
                {formatCountdown(restRemainingSeconds)}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <aside className="space-y-3">
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <p className="text-sm font-semibold text-slate-950">{title}</p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-2xl font-semibold text-slate-950">
                {displayedReps}
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
            {isResting
              ? "休息中，倒计时结束后继续训练。"
              : snapshot?.feedback ?? "开始后保持全身进入画面。"}
          </p>
        </article>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="grid grid-cols-2 gap-2">
          <button
            className="inline-flex items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            disabled={!enabled || isRunning}
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
      </aside>
    </div>
  );
}
