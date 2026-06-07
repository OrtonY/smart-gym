import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Dumbbell, History, Plus, SlidersHorizontal } from "lucide-react";
import { Link } from "react-router-dom";

import {
  Exercise,
  WorkoutMode,
  WorkoutSession,
  WorkoutSummary,
  WorkoutTemplate,
  WorkoutTemplateFilters,
  applyWorkoutTemplateToPlan,
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

function todayKey() {
  return toDateTimeLocal(new Date()).slice(0, 10);
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

async function fetchTrainingData(filters: WorkoutTemplateFilters) {
  const [nextTemplates, nextModes, nextExercises, nextSessions, nextSummary] =
    await Promise.all([
      fetchWorkoutTemplates(filters),
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
  const [filters, setFilters] = useState<WorkoutTemplateFilters>({});
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

  async function loadData(nextFilters = filters) {
    setIsLoading(true);
    try {
      const { nextTemplates, nextModes, nextExercises, nextSessions, nextSummary } =
        await fetchTrainingData(nextFilters);
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

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadData(filters);
  }

  async function handleApplyTemplate(templateId: number) {
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      await applyWorkoutTemplateToPlan(templateId, {
        scheduled_date: todayKey(),
        plan_title: "我的训练计划",
      });
      setStatus("模板已加入今日课表");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加入课表失败");
    } finally {
      setIsSaving(false);
    }
  }

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
          <p className="mt-1 text-sm text-slate-600">从模板开始训练，或补记一次训练。</p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          type="button"
          onClick={() => setManualOpen((current) => !current)}
        >
          <Plus aria-hidden="true" size={17} />
          补记
        </button>
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

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {status ? <p className="text-sm text-gym-teal">{status}</p> : null}
      {manualOpen ? renderManualForm() : null}

      <form
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
        onSubmit={applyFilters}
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal aria-hidden="true" className="text-gym-teal" size={18} />
          <h3 className="text-base font-semibold text-slate-950">模板库</h3>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="block text-sm font-medium text-slate-700">
            目标
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              value={filters.goal ?? ""}
              onChange={(event) =>
                setFilters((current) => ({ ...current, goal: event.target.value || undefined }))
              }
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            难度
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              value={filters.difficulty ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  difficulty: event.target.value
                    ? (event.target.value as WorkoutTemplate["difficulty"])
                    : undefined,
                }))
              }
            >
              <option value="">全部</option>
              <option value="beginner">入门</option>
              <option value="intermediate">进阶</option>
              <option value="advanced">高级</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            肌群
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              value={filters.target ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  target: event.target.value || undefined,
                }))
              }
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            最长分钟
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              min="1"
              type="number"
              value={filters.max_duration ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  max_duration: event.target.value ? Number(event.target.value) : undefined,
                }))
              }
            />
          </label>
        </div>
        <button
          className="mt-4 inline-flex items-center justify-center rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
          type="submit"
        >
          筛选
        </button>
      </form>

      <div className="grid gap-3 lg:grid-cols-2">
        {templates.map((template) => (
          <article
            key={template.id}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
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
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                className="inline-flex items-center justify-center rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
                to={`/app/train/templates/${template.id}`}
              >
                开始
              </Link>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
                type="button"
                onClick={() => handleApplyTemplate(template.id)}
              >
                <CalendarPlus aria-hidden="true" size={17} />
                加入今日课表
              </button>
            </div>
          </article>
        ))}
        {!isLoading && templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            没有符合条件的模板。
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History aria-hidden="true" className="text-gym-teal" size={18} />
          <h3 className="text-lg font-semibold text-slate-950">最近训练</h3>
        </div>
        {latestSessions.map(renderSession)}
        {!isLoading && latestSessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            还没有训练记录。
          </div>
        ) : null}
      </div>
    </section>
  );
}
