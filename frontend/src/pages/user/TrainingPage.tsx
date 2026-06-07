import { FormEvent, useEffect, useMemo, useState } from "react";
import { Activity, Dumbbell, History, LayoutList, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import {
  Exercise,
  WorkoutMode,
  WorkoutSession,
  WorkoutSummary,
  WorkoutTemplate,
  createWorkoutSession,
  fetchExercises,
  fetchWorkoutModes,
  fetchWorkoutSessions,
  fetchWorkoutSummary,
  fetchWorkoutTemplates,
} from "../../api/client";

type FormState = {
  started_at: string;
  workout_mode_id: string;
  exercise_id: string;
  duration_minutes: string;
  calories_burned: string;
  notes: string;
};

const emptySummary: WorkoutSummary = {
  sessions_count: 0,
  total_duration_minutes: 0,
  total_calories_burned: 0,
};

function toDateTimeLocal(date: Date) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function parseOptionalId(value: string) {
  return value === "" ? null : Number(value);
}

function difficultyText(value: WorkoutTemplate["difficulty"]) {
  const map = {
    beginner: "入门",
    intermediate: "进阶",
    advanced: "高级",
  };
  return map[value];
}

async function fetchTrainingData() {
  const [nextTemplates, nextModes, nextExercises, nextSessions, nextSummary] =
    await Promise.all([
      fetchWorkoutTemplates(),
      fetchWorkoutModes(),
      fetchExercises(),
      fetchWorkoutSessions(),
      fetchWorkoutSummary(),
    ]);
  return { nextTemplates, nextModes, nextExercises, nextSessions, nextSummary };
}

export default function TrainingPage() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [modes, setModes] = useState<WorkoutMode[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [summary, setSummary] = useState<WorkoutSummary>(emptySummary);
  const [activeTab, setActiveTab] = useState<
    "overview" | "templates" | "exercises" | "history"
  >("overview");
  const [form, setForm] = useState<FormState>(() => createEmptyForm());
  const [manualOpen, setManualOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

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
        .slice(0, 6),
    [sessions],
  );

  async function loadData() {
    setIsLoading(true);
    try {
      const { nextTemplates, nextModes, nextExercises, nextSessions, nextSummary } =
        await fetchTrainingData();
      setTemplates(nextTemplates);
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
    void loadData();
  }, []);

  async function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
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
      setManualOpen(false);
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "训练记录保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  function renderSession(session: WorkoutSession) {
    const title =
      exerciseNames.get(session.exercise_id ?? 0) ??
      modeNames.get(session.workout_mode_id ?? 0) ??
      "自由训练";
    return (
      <article
        key={session.id}
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            <p className="mt-1 text-sm text-slate-600">
              {formatDateTime(session.started_at)} · {session.duration_minutes} 分钟 ·{" "}
              {session.calories_burned} 千卡
            </p>
          </div>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
            {session.status === "completed" ? "完成" : "未完成"}
          </span>
        </div>
      </article>
    );
  }

  const tabs = [
    { id: "overview" as const, label: "训练数据", icon: Activity },
    { id: "templates" as const, label: "模板库", icon: LayoutList },
    { id: "exercises" as const, label: "动作", icon: Dumbbell },
    { id: "history" as const, label: "最近训练", icon: History },
  ];

  function renderOverviewTab() {
    return (
      <div className="space-y-4">
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
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-950">本次入口</h3>
              <p className="mt-1 text-sm text-slate-600">
                从模板或动作开始训练，也可以补记已完成训练。
              </p>
            </div>
            <button
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              type="button"
              onClick={() => setManualOpen((current) => !current)}
            >
              <Plus aria-hidden="true" size={17} />
              补记
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderTemplatesTab() {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        {templates.map((template) => (
          <Link
            key={template.id}
            className="block rounded-lg border border-slate-200 bg-white p-4 shadow-soft transition hover:border-gym-teal"
            to={`/app/train/templates/${template.id}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">
                  {template.title}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {difficultyText(template.difficulty)} ·{" "}
                  {template.estimated_duration_minutes} 分钟 · {template.target_muscles}
                </p>
                {template.description ? (
                  <p className="mt-2 text-sm text-slate-600">{template.description}</p>
                ) : null}
              </div>
              <Dumbbell aria-hidden="true" className="shrink-0 text-gym-teal" size={20} />
            </div>
            <span className="mt-4 inline-flex items-center justify-center rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white">
              查看训练项
            </span>
          </Link>
        ))}
        {!isLoading && templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            暂无模板。
          </div>
        ) : null}
      </div>
    );
  }

  function renderExercisesTab() {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        {exercises.map((exercise) => (
          <Link
            key={exercise.id}
            className="block rounded-lg border border-slate-200 bg-white p-4 shadow-soft transition hover:border-gym-teal"
            to={`/app/train/exercises/${exercise.id}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">
                  {exercise.name}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {exercise.target_muscle} · {difficultyText(exercise.difficulty)}
                </p>
                {exercise.description ? (
                  <p className="mt-2 text-sm text-slate-600">{exercise.description}</p>
                ) : null}
              </div>
              <Dumbbell aria-hidden="true" className="shrink-0 text-gym-teal" size={20} />
            </div>
            <span className="mt-4 inline-flex items-center justify-center rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white">
              开始训练
            </span>
          </Link>
        ))}
        {!isLoading && exercises.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            暂无动作。
          </div>
        ) : null}
      </div>
    );
  }

  function renderHistoryTab() {
    return (
      <div className="space-y-3">
        {latestSessions.map(renderSession)}
        {!isLoading && latestSessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            还没有训练记录。
          </div>
        ) : null}
      </div>
    );
  }

  function renderManualForm() {
    return (
      <form
        className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-soft md:grid-cols-2"
        onSubmit={handleManualSubmit}
      >
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
              setForm((current) => ({ ...current, workout_mode_id: event.target.value }))
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
        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
          备注
          <textarea
            className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
          />
        </label>
        <div className="md:col-span-2">
          <button
            className="inline-flex items-center justify-center rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
            type="submit"
          >
            保存记录
          </button>
        </div>
      </form>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">训练</h2>
          <p className="mt-1 text-sm text-slate-600">
            训练数据、模板、动作和历史记录集中在这里。
          </p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 shadow-soft">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              className={[
                "inline-flex min-w-fit flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
                isActive
                  ? "bg-gym-teal text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
              ].join(" ")}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon aria-hidden="true" size={17} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {status ? <p className="text-sm text-gym-teal">{status}</p> : null}
      {manualOpen ? renderManualForm() : null}

      {activeTab === "overview" ? renderOverviewTab() : null}
      {activeTab === "templates" ? renderTemplatesTab() : null}
      {activeTab === "exercises" ? renderExercisesTab() : null}
      {activeTab === "history" ? renderHistoryTab() : null}
    </section>
  );
}
