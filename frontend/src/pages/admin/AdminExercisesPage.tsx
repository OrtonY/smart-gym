import { FormEvent, useEffect, useState } from "react";
import { BookOpen, Plus, Save } from "lucide-react";

import {
  Exercise,
  ExercisePayload,
  ExerciseUpdatePayload,
  createAdminExercise,
  fetchAdminExercises,
  updateAdminExercise,
} from "../../api/client";

type ExerciseForm = {
  slug: string;
  name: string;
  target_muscle: string;
  difficulty: Exercise["difficulty"];
  description: string;
  tutorial_url: string;
  media_url: string;
  detection_rules: string;
  is_published: boolean;
};

type ExerciseEditForm = Omit<ExerciseForm, "slug">;

const emptyCreateForm: ExerciseForm = {
  slug: "",
  name: "",
  target_muscle: "",
  difficulty: "beginner",
  description: "",
  tutorial_url: "",
  media_url: "",
  detection_rules: "",
  is_published: true,
};

const difficulties: Array<{ label: string; value: Exercise["difficulty"] }> = [
  { label: "初级", value: "beginner" },
  { label: "中级", value: "intermediate" },
  { label: "高级", value: "advanced" },
];

function rulesToText(rules: Exercise["detection_rules"]) {
  return rules ? JSON.stringify(rules, null, 2) : "";
}

function toEditForm(exercise: Exercise): ExerciseEditForm {
  return {
    name: exercise.name,
    target_muscle: exercise.target_muscle,
    difficulty: exercise.difficulty,
    description: exercise.description ?? "",
    tutorial_url: exercise.tutorial_url ?? "",
    media_url: exercise.media_url ?? "",
    detection_rules: rulesToText(exercise.detection_rules),
    is_published: exercise.is_published,
  };
}

function optionalText(value: string) {
  return value.trim() || null;
}

function parseDetectionRules(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("检测规则必须是 JSON 对象");
  }
  return parsed as Record<string, unknown>;
}

function buildPayload(form: ExerciseForm | ExerciseEditForm) {
  const name = form.name.trim();
  const targetMuscle = form.target_muscle.trim();
  if (!name || !targetMuscle) {
    throw new Error("请填写名称和目标肌群");
  }

  return {
    name,
    target_muscle: targetMuscle,
    difficulty: form.difficulty,
    description: optionalText(form.description),
    tutorial_url: optionalText(form.tutorial_url),
    media_url: optionalText(form.media_url),
    detection_rules: parseDetectionRules(form.detection_rules),
    is_published: form.is_published,
  };
}

export default function AdminExercisesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [createForm, setCreateForm] = useState<ExerciseForm>(emptyCreateForm);
  const [editForms, setEditForms] = useState<Record<number, ExerciseEditForm>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadExercises() {
    setIsLoading(true);
    try {
      const nextExercises = await fetchAdminExercises();
      setExercises(nextExercises);
      setEditForms(
        Object.fromEntries(
          nextExercises.map((exercise) => [exercise.id, toEditForm(exercise)]),
        ),
      );
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "动作教程读取失败");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadExercises();
  }, []);

  async function handleCreateExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const slug = createForm.slug.trim();
    if (!slug) {
      setError("请填写 Slug");
      return;
    }

    setSavingId("create");
    try {
      const payload: ExercisePayload = {
        slug,
        ...buildPayload(createForm),
      };
      await createAdminExercise(payload);
      setCreateForm(emptyCreateForm);
      await loadExercises();
      setMessage("动作教程已创建");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "动作教程创建失败");
    } finally {
      setSavingId(null);
    }
  }

  async function handleUpdateExercise(exerciseId: number) {
    setError(null);
    setMessage(null);
    const form = editForms[exerciseId];
    if (!form) {
      return;
    }

    setSavingId(exerciseId);
    try {
      const payload: ExerciseUpdatePayload = buildPayload(form);
      await updateAdminExercise(exerciseId, payload);
      await loadExercises();
      setMessage("动作教程配置已保存");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "动作教程保存失败");
    } finally {
      setSavingId(null);
    }
  }

  function renderExerciseFields(
    form: ExerciseForm | ExerciseEditForm,
    onChange: (nextForm: ExerciseForm | ExerciseEditForm) => void,
    includeSlug: boolean,
  ) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {includeSlug && "slug" in form ? (
          <label className="block text-sm font-medium text-slate-700">
            Slug
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              required
              value={form.slug}
              onChange={(event) => onChange({ ...form, slug: event.target.value })}
            />
          </label>
        ) : null}
        <label className="block text-sm font-medium text-slate-700">
          名称
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            required
            value={form.name}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          目标肌群
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            required
            value={form.target_muscle}
            onChange={(event) =>
              onChange({ ...form, target_muscle: event.target.value })
            }
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          难度
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            value={form.difficulty}
            onChange={(event) =>
              onChange({
                ...form,
                difficulty: event.target.value as Exercise["difficulty"],
              })
            }
          >
            {difficulties.map((difficulty) => (
              <option key={difficulty.value} value={difficulty.value}>
                {difficulty.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          教程 URL
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            value={form.tutorial_url}
            onChange={(event) => onChange({ ...form, tutorial_url: event.target.value })}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          媒体 URL
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            value={form.media_url}
            onChange={(event) => onChange({ ...form, media_url: event.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm font-medium text-slate-700">
          <input
            checked={form.is_published}
            className="h-4 w-4 accent-gym-teal"
            type="checkbox"
            onChange={(event) =>
              onChange({ ...form, is_published: event.target.checked })
            }
          />
          用户端发布
        </label>
        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
          描述
          <textarea
            className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            value={form.description}
            onChange={(event) => onChange({ ...form, description: event.target.value })}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
          检测规则 JSON
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            placeholder='{"counter":"knee_angle"}'
            value={form.detection_rules}
            onChange={(event) =>
              onChange({ ...form, detection_rules: event.target.value })
            }
          />
        </label>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">动作教程管理</h2>
        <p className="mt-1 text-sm text-slate-600">
          配置动作库、教程素材、检测规则和用户端发布状态。
        </p>
      </div>

      <form
        className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
        onSubmit={handleCreateExercise}
      >
        <div className="flex items-center gap-2">
          <BookOpen aria-hidden="true" className="text-gym-teal" size={20} />
          <h3 className="text-lg font-semibold text-slate-950">新增动作教程</h3>
        </div>
        <div className="mt-4">
          {renderExerciseFields(createForm, (nextForm) => {
            setCreateForm(nextForm as ExerciseForm);
          }, true)}
        </div>
        <button
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading || savingId === "create"}
          type="submit"
        >
          <Plus aria-hidden="true" size={18} />
          {savingId === "create" ? "创建中" : "创建动作教程"}
        </button>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-gym-teal">{message}</p> : null}

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-950">已配置动作</h3>
        {exercises.map((exercise) => {
          const form = editForms[exercise.id] ?? toEditForm(exercise);
          return (
            <article
              key={exercise.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {exercise.slug}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    ID {exercise.id} · {exercise.is_published ? "用户端可见" : "草稿"}
                  </p>
                </div>
                <span className="rounded-md bg-gym-mint px-2 py-1 text-xs font-medium text-gym-teal">
                  {exercise.is_published ? "已发布" : "未发布"}
                </span>
              </div>
              <div className="mt-4">
                {renderExerciseFields(form, (nextForm) => {
                  setEditForms((current) => ({
                    ...current,
                    [exercise.id]: nextForm as ExerciseEditForm,
                  }));
                }, false)}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={savingId === exercise.id}
                  type="button"
                  onClick={() => void handleUpdateExercise(exercise.id)}
                >
                  <Save aria-hidden="true" size={16} />
                  {savingId === exercise.id ? "保存中" : "保存配置"}
                </button>
              </div>
            </article>
          );
        })}
        {!isLoading && exercises.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            还没有动作教程。
          </div>
        ) : null}
      </div>
    </section>
  );
}
