import { FormEvent, useEffect, useState } from "react";
import { BookOpen, Dumbbell, Plus } from "lucide-react";

import {
  Exercise,
  WorkoutMode,
  createAdminExercise,
  createAdminWorkoutMode,
  fetchExercises,
  fetchWorkoutModes,
} from "../../api/client";

type WorkoutModeFormState = {
  code: string;
  name: string;
};

type ExerciseFormState = {
  slug: string;
  name: string;
};

const emptyWorkoutModeForm: WorkoutModeFormState = {
  code: "",
  name: "",
};

const emptyExerciseForm: ExerciseFormState = {
  slug: "",
  name: "",
};

async function fetchAdminContent() {
  const [nextModes, nextExercises] = await Promise.all([
    fetchWorkoutModes(),
    fetchExercises(),
  ]);
  return { nextModes, nextExercises };
}

export default function AdminContentPage() {
  const [modes, setModes] = useState<WorkoutMode[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [workoutModeForm, setWorkoutModeForm] =
    useState<WorkoutModeFormState>(emptyWorkoutModeForm);
  const [exerciseForm, setExerciseForm] = useState<ExerciseFormState>(emptyExerciseForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingMode, setIsSavingMode] = useState(false);
  const [isSavingExercise, setIsSavingExercise] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadContent() {
    setIsLoading(true);
    try {
      const { nextModes, nextExercises } = await fetchAdminContent();
      setModes(nextModes);
      setExercises(nextExercises);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "内容读取失败");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    void fetchAdminContent()
      .then(({ nextModes, nextExercises }) => {
        if (!isMounted) {
          return;
        }
        setModes(nextModes);
        setExercises(nextExercises);
        setError(null);
      })
      .catch((caught) => {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "内容读取失败");
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

  async function handleCreateWorkoutMode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSavingMode(true);

    try {
      await createAdminWorkoutMode({
        code: workoutModeForm.code.trim(),
        name: workoutModeForm.name.trim(),
        description: "管理端创建的运动模式",
        estimated_calories_per_hour: 360,
        is_active: true,
      });
      setWorkoutModeForm(emptyWorkoutModeForm);
      setMessage("运动模式已创建");
      await loadContent();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "运动模式创建失败");
    } finally {
      setIsSavingMode(false);
    }
  }

  async function handleCreateExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSavingExercise(true);

    try {
      await createAdminExercise({
        slug: exerciseForm.slug.trim(),
        name: exerciseForm.name.trim(),
        target_muscle: "全身",
        difficulty: "beginner",
        description: "管理端创建的动作教程",
        tutorial_url: null,
        media_url: null,
        detection_rules: null,
        is_published: true,
      });
      setExerciseForm(emptyExerciseForm);
      setMessage("动作教程已创建");
      await loadContent();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "动作教程创建失败");
    } finally {
      setIsSavingExercise(false);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">内容管理</h2>
        <p className="mt-1 text-sm text-slate-600">
          维护运动模式和动作教程，创建后会同步刷新当前内容列表。
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <form
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
          onSubmit={handleCreateWorkoutMode}
        >
          <div className="flex items-center gap-2">
            <Dumbbell aria-hidden="true" className="text-gym-teal" size={20} />
            <h3 className="text-lg font-semibold text-slate-950">新增运动模式</h3>
          </div>
          <div className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              编码
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                required
                value={workoutModeForm.code}
                onChange={(event) =>
                  setWorkoutModeForm((current) => ({
                    ...current,
                    code: event.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              名称
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                required
                value={workoutModeForm.name}
                onChange={(event) =>
                  setWorkoutModeForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <button
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading || isSavingMode}
            type="submit"
          >
            <Plus aria-hidden="true" size={18} />
            {isSavingMode ? "创建中" : "创建运动模式"}
          </button>
        </form>

        <form
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
          onSubmit={handleCreateExercise}
        >
          <div className="flex items-center gap-2">
            <BookOpen aria-hidden="true" className="text-gym-teal" size={20} />
            <h3 className="text-lg font-semibold text-slate-950">新增动作教程</h3>
          </div>
          <div className="mt-4 space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Slug
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                required
                value={exerciseForm.slug}
                onChange={(event) =>
                  setExerciseForm((current) => ({
                    ...current,
                    slug: event.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              名称
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                required
                value={exerciseForm.name}
                onChange={(event) =>
                  setExerciseForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <button
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading || isSavingExercise}
            type="submit"
          >
            <Plus aria-hidden="true" size={18} />
            {isSavingExercise ? "创建中" : "创建动作教程"}
          </button>
        </form>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-gym-teal">{message}</p> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-950">运动模式</h3>
          {modes.map((mode) => (
            <article
              key={mode.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{mode.name}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {mode.code} · {mode.estimated_calories_per_hour} 千卡/小时
                  </p>
                  {mode.description ? (
                    <p className="mt-2 text-sm text-slate-600">{mode.description}</p>
                  ) : null}
                </div>
                <span className="rounded-md bg-gym-mint px-2 py-1 text-xs font-medium text-gym-teal">
                  {mode.is_active ? "启用" : "停用"}
                </span>
              </div>
            </article>
          ))}
          {!isLoading && modes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
              还没有运动模式。
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-950">动作教程</h3>
          {exercises.map((exercise) => (
            <article
              key={exercise.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {exercise.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {exercise.slug} · {exercise.target_muscle} · {exercise.difficulty}
                  </p>
                  {exercise.description ? (
                    <p className="mt-2 text-sm text-slate-600">
                      {exercise.description}
                    </p>
                  ) : null}
                </div>
                <span className="rounded-md bg-gym-mint px-2 py-1 text-xs font-medium text-gym-teal">
                  {exercise.is_published ? "已发布" : "未发布"}
                </span>
              </div>
            </article>
          ))}
          {!isLoading && exercises.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
              还没有动作教程。
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
