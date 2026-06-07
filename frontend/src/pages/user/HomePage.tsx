import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Dumbbell, ListChecks, Timer } from "lucide-react";
import { Link } from "react-router-dom";

import {
  TodayWorkout,
  WorkoutSummary,
  applyWorkoutTemplateToPlan,
  fetchTodayTraining,
  fetchWorkoutSummary,
} from "../../api/client";

const emptySummary: WorkoutSummary = {
  sessions_count: 0,
  total_duration_minutes: 0,
  total_calories_burned: 0,
};

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function overviewUrl(today: TodayWorkout) {
  const params = new URLSearchParams();
  params.set("sourceType", today.source_type);
  if (today.source_type === "plan" && today.source_id) {
    params.set("planId", String(today.source_id));
    const planItemId = today.steps[0]?.id;
    if (planItemId) {
      params.set("planItemId", String(planItemId));
    }
  }
  if (today.source_type === "template" && today.source_id) {
    params.set("templateId", String(today.source_id));
  }
  return `/app/train/overview?${params.toString()}`;
}

export default function HomePage() {
  const [today, setToday] = useState<TodayWorkout | null>(null);
  const [summary, setSummary] = useState<WorkoutSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([fetchTodayTraining(), fetchWorkoutSummary()])
      .then(([nextToday, nextSummary]) => {
        if (!isMounted) {
          return;
        }
        setToday(nextToday);
        setSummary(nextSummary);
        setError(null);
      })
      .catch((caught) => {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "今日训练读取失败");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const meta = useMemo(() => {
    if (!today) {
      return [];
    }
    return [
      today.estimated_duration_minutes
        ? `${today.estimated_duration_minutes} 分钟`
        : null,
      today.difficulty,
      today.target_muscles,
      `${today.steps.length} 个动作`,
    ].filter(Boolean);
  }, [today]);

  async function handleApplyTemplate() {
    if (!today?.source_id || today.source_type !== "template") {
      return;
    }
    setIsApplying(true);
    setError(null);
    setMessage(null);
    try {
      await applyWorkoutTemplateToPlan(today.source_id, {
        scheduled_date: todayKey(),
        plan_title: "我的训练计划",
      });
      setMessage("已加入今日课表");
      setToday(await fetchTodayTraining());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加入课表失败");
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">今日训练</h2>
          <p className="mt-1 text-sm text-slate-600">计划、推荐和训练记录在这里汇总。</p>
        </div>
        <Link
          className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          to="/app/plans"
        >
          <ListChecks aria-hidden="true" size={17} />
          课表
        </Link>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-gym-teal">{message}</p> : null}

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
        {isLoading ? (
          <p className="text-sm text-slate-600">读取中...</p>
        ) : today && today.source_type !== "empty" ? (
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-gym-mint text-gym-teal">
                <Dumbbell aria-hidden="true" size={22} />
              </div>
              <p className="mt-4 text-sm font-medium text-gym-teal">
                {today.source_type === "plan" ? "今日课表" : "推荐模板"}
              </p>
              <h3 className="mt-1 text-xl font-semibold text-slate-950">
                {today.title}
              </h3>
              {today.description ? (
                <p className="mt-2 text-sm text-slate-600">{today.description}</p>
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
            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                to={overviewUrl(today)}
              >
                <Timer aria-hidden="true" size={17} />
                {today.source_type === "plan" ? "开始训练" : "开始推荐训练"}
              </Link>
              {today.source_type === "template" ? (
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isApplying}
                  type="button"
                  onClick={handleApplyTemplate}
                >
                  <CalendarPlus aria-hidden="true" size={17} />
                  加入课表
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-semibold text-slate-950">暂无训练内容</h3>
            <p className="mt-2 text-sm text-slate-600">
              可以先从模板库选择训练，或在课表里安排今天的动作。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                className="inline-flex items-center justify-center rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                to="/app/train"
              >
                模板库
              </Link>
              <Link
                className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                to="/app/plans"
              >
                安排课表
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <p className="text-2xl font-semibold text-slate-950">
            {summary.sessions_count}
          </p>
          <p className="mt-1 text-sm text-slate-600">训练次数</p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <p className="text-2xl font-semibold text-slate-950">
            {summary.total_duration_minutes}
          </p>
          <p className="mt-1 text-sm text-slate-600">累计分钟</p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <p className="text-2xl font-semibold text-slate-950">
            {summary.total_calories_burned}
          </p>
          <p className="mt-1 text-sm text-slate-600">累计千卡</p>
        </article>
      </div>
    </section>
  );
}
