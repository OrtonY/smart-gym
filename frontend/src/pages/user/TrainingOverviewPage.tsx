import { useEffect, useMemo, useState } from "react";
import { Camera, Dumbbell, Play, Timer } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  TodayWorkout,
  TodayWorkoutStep,
  WorkoutSessionStartPayload,
  WorkoutTemplate,
  WorkoutTemplateStep,
  fetchTodayTraining,
  fetchWorkoutTemplate,
  startWorkoutSession,
} from "../../api/client";

type OverviewSource =
  | {
      sourceType: "plan";
      sourceId: number | null;
      planItemId: number | null;
      title: string;
      description: string | null;
      durationMinutes: number | null;
      steps: TodayWorkoutStep[];
      poseAvailable: boolean;
    }
  | {
      sourceType: "template";
      sourceId: number;
      planItemId: null;
      title: string;
      description: string | null;
      durationMinutes: number | null;
      steps: Array<TodayWorkoutStep | WorkoutTemplateStep>;
      poseAvailable: boolean;
    }
  | {
      sourceType: "free";
      sourceId: null;
      planItemId: null;
      title: string;
      description: string | null;
      durationMinutes: number | null;
      steps: [];
      poseAvailable: boolean;
    };

function numberParam(value: string | null) {
  return value ? Number(value) : null;
}

function fromToday(today: TodayWorkout, planItemId?: number | null): OverviewSource {
  if (today.source_type === "plan") {
    return {
      sourceType: "plan",
      sourceId: today.source_id,
      planItemId: planItemId ?? today.steps[0]?.id ?? null,
      title: today.title,
      description: today.description,
      durationMinutes: today.estimated_duration_minutes,
      steps: today.steps,
      poseAvailable: today.pose_detection_available,
    };
  }
  if (today.source_type === "template" && today.source_id) {
    return {
      sourceType: "template",
      sourceId: today.source_id,
      planItemId: null,
      title: today.title,
      description: today.description,
      durationMinutes: today.estimated_duration_minutes,
      steps: today.steps,
      poseAvailable: today.pose_detection_available,
    };
  }
  return {
    sourceType: "free",
    sourceId: null,
    planItemId: null,
    title: "自由训练",
    description: null,
    durationMinutes: null,
    steps: [],
    poseAvailable: false,
  };
}

function fromTemplate(template: WorkoutTemplate): OverviewSource {
  return {
    sourceType: "template",
    sourceId: template.id,
    planItemId: null,
    title: template.title,
    description: template.description,
    durationMinutes: template.estimated_duration_minutes,
    steps: template.steps,
    poseAvailable: template.steps.some((step) => step.allow_pose_detection),
  };
}

function stepDuration(step: TodayWorkoutStep | WorkoutTemplateStep) {
  if (step.duration_seconds) {
    return `${Math.round(step.duration_seconds / 60)} 分钟`;
  }
  return null;
}

export default function TrainingOverviewPage() {
  const { templateId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [source, setSource] = useState<OverviewSource | null>(null);
  const [poseEnabled, setPoseEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadSource() {
      setIsLoading(true);
      try {
        const sourceType = searchParams.get("sourceType");
        const queryTemplateId = numberParam(searchParams.get("templateId"));
        const effectiveTemplateId = templateId ? Number(templateId) : queryTemplateId;
        if (effectiveTemplateId) {
          const template = await fetchWorkoutTemplate(effectiveTemplateId);
          if (isMounted) {
            setSource(fromTemplate(template));
          }
          return;
        }
        const today = await fetchTodayTraining();
        if (isMounted) {
          setSource(
            sourceType === "plan"
              ? fromToday(today, numberParam(searchParams.get("planItemId")))
              : fromToday(today),
          );
        }
      } catch (caught) {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "训练详情读取失败");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    void loadSource();
    return () => {
      isMounted = false;
    };
  }, [searchParams, templateId]);

  const meta = useMemo(() => {
    if (!source) {
      return [];
    }
    return [
      source.durationMinutes ? `${source.durationMinutes} 分钟` : null,
      `${source.steps.length} 个动作`,
    ].filter(Boolean);
  }, [source]);

  async function handleStart() {
    if (!source) {
      return;
    }
    const payload: WorkoutSessionStartPayload = {
      source_type: source.sourceType,
      pose_detection_enabled: poseEnabled,
    };
    if (source.sourceType === "plan") {
      if (!source.sourceId || !source.planItemId) {
        setError("课表训练缺少计划项");
        return;
      }
      payload.source_plan_id = source.sourceId;
      payload.source_plan_item_id = source.planItemId;
    }
    if (source.sourceType === "template") {
      payload.source_template_id = source.sourceId;
    }
    setIsStarting(true);
    setError(null);
    try {
      const session = await startWorkoutSession(payload);
      sessionStorage.setItem(
        `smart-gym-active-session:${session.id}`,
        JSON.stringify(session),
      );
      navigate(`/app/train/session/${session.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "开始训练失败");
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">训练确认</h2>
          <p className="mt-1 text-sm text-slate-600">
            每次开始训练前选择是否开启姿态检测。
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          to="/app/train"
        >
          返回训练
        </Link>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        {isLoading ? (
          <p className="text-sm text-slate-600">读取中...</p>
        ) : source ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-gym-mint text-gym-teal">
                  <Dumbbell aria-hidden="true" size={22} />
                </div>
                <h3 className="mt-4 text-xl font-semibold text-slate-950">
                  {source.title}
                </h3>
                {source.description ? (
                  <p className="mt-2 text-sm text-slate-600">{source.description}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {meta.map((item) => (
                    <span
                      key={item}
                      className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <label className="flex min-w-56 items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                <span className="inline-flex items-center gap-2">
                  <Camera aria-hidden="true" size={17} />
                  姿态检测
                </span>
                <input
                  checked={poseEnabled}
                  disabled={!source.poseAvailable}
                  type="checkbox"
                  onChange={(event) => setPoseEnabled(event.target.checked)}
                />
              </label>
            </div>

            <div className="space-y-2">
              {source.steps.map((step, index) => (
                <div
                  key={`${step.sort_order}-${step.title}`}
                  className="flex items-start justify-between gap-3 rounded-md border border-slate-200 px-3 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {index + 1}. {step.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {[
                        step.sets ? `${step.sets} 组` : null,
                        step.reps ? `${step.reps} 次` : null,
                        stepDuration(step),
                        step.rest_seconds ? `休息 ${step.rest_seconds} 秒` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "动作记录"}
                    </p>
                  </div>
                  {step.allow_pose_detection ? (
                    <span className="rounded-md bg-gym-mint px-2 py-1 text-xs font-medium text-gym-teal">
                      可检测
                    </span>
                  ) : null}
                </div>
              ))}
              {source.steps.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-600">
                  自由训练不会预置动作。
                </div>
              ) : null}
            </div>

            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              disabled={isStarting}
              type="button"
              onClick={handleStart}
            >
              {isStarting ? (
                "启动中"
              ) : (
                <>
                  <Play aria-hidden="true" size={17} />
                  开始训练
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="text-sm text-slate-600">没有可开始的训练。</div>
        )}
      </div>
    </section>
  );
}
