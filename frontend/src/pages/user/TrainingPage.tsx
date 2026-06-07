import { FormEvent, useEffect, useMemo, useState } from "react";
import { Camera, Dumbbell, ListChecks, Plus, Timer } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import {
  Exercise,
  WorkoutMode,
  WorkoutSession,
  WorkoutSummary,
  createWorkoutSession,
  fetchExercises,
  fetchWorkoutModes,
  fetchWorkoutSessions,
  fetchWorkoutSummary,
} from "../../api/client";

type FormState = {
  started_at: string;
  workout_mode_id: string;
  exercise_id: string;
  duration_minutes: string;
  calories_burned: string;
  notes: string;
};

type TrainingTab = "recent" | "new" | "records";

const validTabs = new Set<TrainingTab>(["recent", "new", "records"]);

const emptySummary: WorkoutSummary = {
  sessions_count: 0,
  total_duration_minutes: 0,
  total_calories_burned: 0,
};

function toDateTimeLocal(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function createEmptyForm(): FormState {
  return {
    started_at: toDateTimeLocal(new Date()),
    workout_mode_id: "",
    exercise_id: "",
    duration_minutes: "30",
    calories_burned: "180",
    notes: "",
  };
}

function parseOptionalId(value: string) {
  return value === "" ? null : Number(value);
}

function poseUrl(params: {
  exerciseId?: number | null;
  workoutModeId?: number | null;
  title?: string | null;
}) {
  const search = new URLSearchParams();
  if (params.exerciseId) {
    search.set("exerciseId", String(params.exerciseId));
  }
  if (params.workoutModeId) {
    search.set("workoutModeId", String(params.workoutModeId));
  }
  if (params.title) {
    search.set("title", params.title);
  }
  const query = search.toString();
  return query ? `/app/pose?${query}` : "/app/pose";
}

async function fetchTrainingData() {
  const [nextModes, nextExercises, nextSessions, nextSummary] = await Promise.all([
    fetchWorkoutModes(),
    fetchExercises(),
    fetchWorkoutSessions(),
    fetchWorkoutSummary(),
  ]);
  return { nextModes, nextExercises, nextSessions, nextSummary };
}

export default function TrainingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [modes, setModes] = useState<WorkoutMode[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [summary, setSummary] = useState<WorkoutSummary>(emptySummary);
  const [form, setForm] = useState<FormState>(() => createEmptyForm());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const tabParam = searchParams.get("tab") as TrainingTab | null;
  const activeTab = tabParam && validTabs.has(tabParam) ? tabParam : "recent";

  async function loadData() {
    setIsLoading(true);
    try {
      const { nextModes, nextExercises, nextSessions, nextSummary } =
        await fetchTrainingData();
      setModes(nextModes);
      setExercises(nextExercises);
      setSessions(nextSessions);
      setSummary(nextSummary);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "训练数据读取失败");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    void fetchTrainingData()
      .then(({ nextModes, nextExercises, nextSessions, nextSummary }) => {
        if (!isMounted) {
          return;
        }
        setModes(nextModes);
        setExercises(nextExercises);
        setSessions(nextSessions);
        setSummary(nextSummary);
        setError(null);
      })
      .catch((caught) => {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "训练数据读取失败");
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

  const modeNames = useMemo(
    () => new Map(modes.map((mode) => [mode.id, mode.name])),
    [modes],
  );
  const exerciseNames = useMemo(
    () => new Map(exercises.map((exercise) => [exercise.id, exercise.name])),
    [exercises],
  );
  const latestSessions = useMemo(
    () =>
      [...sessions]
        .sort(
          (left, right) =>
            new Date(right.started_at).getTime() - new Date(left.started_at).getTime(),
        )
        .slice(0, 5),
    [sessions],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setIsSaving(true);

    const startedAt = new Date(form.started_at);
    const durationMinutes = Number(form.duration_minutes);
    const caloriesBurned = Number(form.calories_burned);
    const endedAt = new Date(startedAt.getTime() + durationMinutes * 60_000);

    try {
      await createWorkoutSession({
        workout_mode_id: parseOptionalId(form.workout_mode_id),
        exercise_id: parseOptionalId(form.exercise_id),
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        duration_minutes: durationMinutes,
        calories_burned: caloriesBurned,
        reps: null,
        score: null,
        status: "completed",
        notes: form.notes.trim() || null,
      });
      setStatus("训练记录已保存");
      setForm(createEmptyForm());
      await loadData();
      setSearchParams({ tab: "recent" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "训练记录保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  function renderSessionCard(session: WorkoutSession) {
    return (
      <article
        key={session.id}
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">
              {exerciseNames.get(session.exercise_id ?? 0) ??
                modeNames.get(session.workout_mode_id ?? 0) ??
                "自由训练"}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {formatDateTime(session.started_at)} · {session.duration_minutes} 分钟 ·{" "}
              {session.calories_burned} 千卡
            </p>
            {session.notes ? (
              <p className="mt-2 text-sm text-slate-600">{session.notes}</p>
            ) : null}
          </div>
          <span className="rounded-md bg-gym-mint px-2 py-1 text-xs font-medium text-gym-teal">
            {session.status === "completed" ? "已完成" : "已放弃"}
          </span>
        </div>
      </article>
    );
  }

  function renderNewTrainingForm() {
    return (
      <form
        className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center gap-2">
          <Plus aria-hidden="true" className="text-gym-teal" size={20} />
          <h3 className="text-lg font-semibold text-slate-950">新增训练</h3>
        </div>
        <div className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            开始时间
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              required
              type="datetime-local"
              value={form.started_at}
              onChange={(event) =>
                setForm((current) => ({ ...current, started_at: event.target.value }))
              }
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            训练模式
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              value={form.workout_mode_id}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  workout_mode_id: event.target.value,
                }))
              }
            >
              <option value="">不选择</option>
              {modes.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            动作
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              value={form.exercise_id}
              onChange={(event) =>
                setForm((current) => ({ ...current, exercise_id: event.target.value }))
              }
            >
              <option value="">不选择</option>
              {exercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            时长 分钟
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              inputMode="numeric"
              max="1440"
              min="1"
              required
              type="number"
              value={form.duration_minutes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  duration_minutes: event.target.value,
                }))
              }
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            消耗 千卡
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              inputMode="numeric"
              max="10000"
              min="0"
              required
              type="number"
              value={form.calories_burned}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  calories_burned: event.target.value,
                }))
              }
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            备注
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
            />
          </label>
        </div>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {status ? <p className="mt-4 text-sm text-gym-teal">{status}</p> : null}
        <Link
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-gym-teal px-4 py-2 text-sm font-semibold text-gym-teal transition hover:bg-gym-mint"
          to={poseUrl({
            exerciseId: parseOptionalId(form.exercise_id),
            workoutModeId: parseOptionalId(form.workout_mode_id),
            title:
              exerciseNames.get(Number(form.exercise_id)) ??
              modeNames.get(Number(form.workout_mode_id)) ??
              "自由训练",
          })}
        >
          <Camera aria-hidden="true" size={17} />
          动作检测
        </Link>
        <button
          className="mt-5 w-full rounded-md bg-gym-teal px-4 py-2 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading || isSaving}
          type="submit"
        >
          {isSaving ? "保存中" : "保存训练"}
        </button>
      </form>
    );
  }

  const tabs: Array<{ id: TrainingTab; label: string }> = [
    { id: "recent", label: "最近训练" },
    { id: "new", label: "新增训练" },
    { id: "records", label: "训练记录" },
  ];

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">训练</h2>
        <p className="mt-1 text-sm text-slate-600">
          记录训练时长、消耗和备注，持续积累个人训练数据。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gym-mint text-gym-teal">
            <Dumbbell aria-hidden="true" size={20} />
          </div>
          <p className="mt-4 text-2xl font-semibold text-slate-950">
            {summary.sessions_count}
          </p>
          <p className="mt-1 text-sm text-slate-600">训练次数</p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gym-mint text-gym-teal">
            <Timer aria-hidden="true" size={20} />
          </div>
          <p className="mt-4 text-2xl font-semibold text-slate-950">
            {summary.total_duration_minutes}
          </p>
          <p className="mt-1 text-sm text-slate-600">累计分钟</p>
        </article>
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gym-mint text-gym-teal">
            <ListChecks aria-hidden="true" size={20} />
          </div>
          <p className="mt-4 text-2xl font-semibold text-slate-950">
            {summary.total_calories_burned}
          </p>
          <p className="mt-1 text-sm text-slate-600">累计千卡</p>
        </article>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-950">动作检测</h3>
            <p className="mt-1 text-sm text-slate-600">
              从任意训练进入摄像头检测，保存后会生成训练记录。
            </p>
          </div>
          <Link
            aria-label="开始动作检测"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-gym-teal text-white transition hover:bg-teal-800"
            title="开始动作检测"
            to="/app/pose"
          >
            <Camera aria-hidden="true" size={18} />
          </Link>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {exercises.slice(0, 8).map((exercise) => (
            <Link
              key={exercise.id}
              className="shrink-0 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-gym-teal hover:text-gym-teal"
              to={poseUrl({ exerciseId: exercise.id, title: exercise.name })}
            >
              {exercise.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-white p-1 shadow-soft">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={[
              "rounded-md px-3 py-2 text-sm font-semibold transition",
              activeTab === tab.id
                ? "bg-gym-teal text-white"
                : "text-slate-600 hover:bg-slate-100",
            ].join(" ")}
            type="button"
            onClick={() => setSearchParams({ tab: tab.id })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "recent" ? (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-950">最近训练</h3>
          {latestSessions.map(renderSessionCard)}
          {!isLoading && latestSessions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
              还没有训练记录。
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "new" ? renderNewTrainingForm() : null}

      {activeTab === "records" ? (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-950">训练记录</h3>
          {sessions.map(renderSessionCard)}
          {!isLoading && sessions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
              还没有训练记录。
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
