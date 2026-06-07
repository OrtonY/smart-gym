import { useMemo } from "react";
import { Award, CalendarDays, Dumbbell, Timer } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { WorkoutSessionStartResponse } from "../../api/client";
import { summarizeWorkoutSteps } from "../../training/trainingFlow";

function finishedSessionKey(sessionId: string) {
  return `smart-gym-finished-session:${sessionId}`;
}

function readFinishedSession(sessionId: string | undefined) {
  if (!sessionId) {
    return null;
  }
  const raw = sessionStorage.getItem(finishedSessionKey(sessionId));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as WorkoutSessionStartResponse;
  } catch {
    return null;
  }
}

export default function WorkoutReviewPage() {
  const { sessionId } = useParams();
  const session = useMemo(() => readFinishedSession(sessionId), [sessionId]);
  const summary = useMemo(
    () => summarizeWorkoutSteps(session?.steps ?? []),
    [session?.steps],
  );

  if (!session) {
    return (
      <section className="space-y-5">
        <h2 className="text-2xl font-semibold text-slate-950">训练复盘</h2>
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
          没有找到训练复盘。
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
          <h2 className="text-2xl font-semibold text-slate-950">训练复盘</h2>
          <p className="mt-1 text-sm text-slate-600">本次训练已写入训练记录。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
            to="/app/plans"
          >
            <CalendarDays aria-hidden="true" size={17} />
            课表
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            to="/app/train"
          >
            训练
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <Dumbbell aria-hidden="true" className="text-gym-teal" size={20} />
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {summary.completedSteps}
          </p>
          <p className="mt-1 text-sm text-slate-600">完成动作</p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <Timer aria-hidden="true" className="text-gym-teal" size={20} />
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {session.duration_minutes}
          </p>
          <p className="mt-1 text-sm text-slate-600">分钟</p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <Award aria-hidden="true" className="text-gym-teal" size={20} />
          <p className="mt-3 text-2xl font-semibold text-slate-950">
            {Math.round(summary.averageScore ?? session.score ?? 0)}
          </p>
          <p className="mt-1 text-sm text-slate-600">评分</p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <p className="text-2xl font-semibold text-slate-950">
            {session.calories_burned}
          </p>
          <p className="mt-1 text-sm text-slate-600">千卡</p>
        </article>
      </div>

      <div className="space-y-3">
        {session.steps.map((step) => (
          <article
            key={step.id}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">{step.title}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {[
                    step.actual_reps ? `${step.actual_reps} 次` : null,
                    step.actual_duration_seconds
                      ? `${Math.round(step.actual_duration_seconds / 60)} 分钟`
                      : null,
                    step.score ? `${Math.round(step.score)} 分` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "已记录"}
                </p>
                {step.notes ? (
                  <p className="mt-2 text-sm text-slate-600">{step.notes}</p>
                ) : null}
              </div>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                {step.status === "completed"
                  ? "完成"
                  : step.status === "skipped"
                    ? "跳过"
                    : "部分"}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
