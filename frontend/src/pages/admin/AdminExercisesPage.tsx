import { FormEvent, useEffect, useState } from "react";
import { BookOpen, Pencil, Plus, X } from "lucide-react";

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

type DialogState =
  | { mode: "create"; form: ExerciseForm }
  | { mode: "edit"; exerciseId: number; slug: string; form: ExerciseForm };

const emptyForm: ExerciseForm = {
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

const difficultyLabels: Record<Exercise["difficulty"], string> = {
  beginner: "初级",
  intermediate: "中级",
  advanced: "高级",
};

function rulesToText(rules: Exercise["detection_rules"]) {
  return rules ? JSON.stringify(rules, null, 2) : "";
}

function toForm(exercise: Exercise): ExerciseForm {
  return {
    slug: exercise.slug,
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

function buildPayload(form: ExerciseForm) {
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
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadExercises() {
    setIsLoading(true);
    try {
      setExercises(await fetchAdminExercises());
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

  function updateDialogForm(nextForm: ExerciseForm) {
    setDialog((current) => {
      if (!current) {
        return current;
      }
      return { ...current, form: nextForm };
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog) {
      return;
    }

    setError(null);
    setMessage(null);
    setIsSaving(true);

    try {
      const payload = buildPayload(dialog.form);
      if (dialog.mode === "create") {
        const slug = dialog.form.slug.trim();
        if (!slug) {
          throw new Error("请填写 Slug");
        }
        await createAdminExercise({ slug, ...payload } as ExercisePayload);
        setMessage("动作教程已创建");
      } else {
        await updateAdminExercise(
          dialog.exerciseId,
          payload as ExerciseUpdatePayload,
        );
        setMessage("动作教程配置已保存");
      }

      setDialog(null);
      await loadExercises();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "动作教程保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  function renderDialogFields() {
    if (!dialog) {
      return null;
    }
    const form = dialog.form;
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {dialog.mode === "create" ? (
          <label className="block text-sm font-medium text-slate-700">
            Slug
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              required
              value={form.slug}
              onChange={(event) =>
                updateDialogForm({ ...form, slug: event.target.value })
              }
            />
          </label>
        ) : null}
        <label className="block text-sm font-medium text-slate-700">
          名称
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            required
            value={form.name}
            onChange={(event) =>
              updateDialogForm({ ...form, name: event.target.value })
            }
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          目标肌群
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            required
            value={form.target_muscle}
            onChange={(event) =>
              updateDialogForm({ ...form, target_muscle: event.target.value })
            }
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          难度
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            value={form.difficulty}
            onChange={(event) =>
              updateDialogForm({
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
            onChange={(event) =>
              updateDialogForm({ ...form, tutorial_url: event.target.value })
            }
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          媒体 URL
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            value={form.media_url}
            onChange={(event) =>
              updateDialogForm({ ...form, media_url: event.target.value })
            }
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm font-medium text-slate-700">
          <input
            checked={form.is_published}
            className="h-4 w-4 accent-gym-teal"
            type="checkbox"
            onChange={(event) =>
              updateDialogForm({ ...form, is_published: event.target.checked })
            }
          />
          用户端发布
        </label>
        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
          描述
          <textarea
            className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            value={form.description}
            onChange={(event) =>
              updateDialogForm({ ...form, description: event.target.value })
            }
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 md:col-span-2">
          检测规则 JSON
          <textarea
            className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            placeholder='{"counter":"knee_angle"}'
            value={form.detection_rules}
            onChange={(event) =>
              updateDialogForm({ ...form, detection_rules: event.target.value })
            }
          />
        </label>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">动作教程管理</h2>
          <p className="mt-1 text-sm text-slate-600">
            配置动作库、教程素材、检测规则和用户端发布状态。
          </p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
          type="button"
          onClick={() => {
            setError(null);
            setMessage(null);
            setDialog({ mode: "create", form: emptyForm });
          }}
        >
          <Plus aria-hidden="true" size={18} />
          新建动作
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-gym-teal">{message}</p> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {exercises.map((exercise) => (
          <article
            key={exercise.id}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">
                  {exercise.name}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {exercise.slug} · {exercise.target_muscle} ·{" "}
                  {difficultyLabels[exercise.difficulty]}
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
            <div className="mt-4 flex justify-end">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                type="button"
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  setDialog({
                    mode: "edit",
                    exerciseId: exercise.id,
                    slug: exercise.slug,
                    form: toForm(exercise),
                  });
                }}
              >
                <Pencil aria-hidden="true" size={16} />
                查看/编辑
              </button>
            </div>
          </article>
        ))}
        {!isLoading && exercises.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            还没有动作教程。
          </div>
        ) : null}
      </div>

      {dialog ? (
        <div className="fixed inset-0 z-40 flex items-end overflow-y-auto bg-black/60 px-4 py-6 sm:items-center sm:justify-center">
          <form
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
            onSubmit={handleSubmit}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">
                  {dialog.mode === "create" ? "新建动作教程" : "编辑动作教程"}
                </h3>
                {dialog.mode === "edit" ? (
                  <p className="mt-1 text-sm text-slate-600">Slug：{dialog.slug}</p>
                ) : null}
              </div>
              <button
                aria-label="关闭"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
                type="button"
                onClick={() => setDialog(null)}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <div className="mt-4">{renderDialogFields()}</div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                type="button"
                onClick={() => setDialog(null)}
              >
                取消
              </button>
              <button
                className="rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                {isSaving ? "保存中" : "保存"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
