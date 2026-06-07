import { FormEvent, useEffect, useState } from "react";
import { Layers3, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  Exercise,
  WorkoutMode,
  WorkoutTemplate,
  WorkoutTemplatePayload,
  WorkoutTemplateStepPayload,
  WorkoutTemplateUpdatePayload,
  createAdminWorkoutTemplate,
  fetchAdminWorkoutTemplates,
  fetchExercises,
  fetchWorkoutModes,
  updateAdminWorkoutTemplate,
} from "../../api/client";

type StepForm = {
  sort_order: string;
  exercise_id: string;
  workout_mode_id: string;
  title: string;
  sets: string;
  reps: string;
  duration_seconds: string;
  rest_seconds: string;
  instruction: string;
  allow_pose_detection: boolean;
};

type TemplateForm = {
  slug: string;
  title: string;
  description: string;
  goal: string;
  difficulty: WorkoutTemplate["difficulty"];
  target_muscles: string;
  estimated_duration_minutes: string;
  cover_url: string;
  tags: string;
  recommendation_weight: string;
  is_published: boolean;
  steps: StepForm[];
};

type DialogState =
  | { mode: "create"; form: TemplateForm }
  | { mode: "edit"; templateId: number; slug: string; form: TemplateForm };

const emptyStep: StepForm = {
  sort_order: "0",
  exercise_id: "",
  workout_mode_id: "",
  title: "",
  sets: "",
  reps: "",
  duration_seconds: "",
  rest_seconds: "",
  instruction: "",
  allow_pose_detection: true,
};

const emptyForm: TemplateForm = {
  slug: "",
  title: "",
  description: "",
  goal: "",
  difficulty: "beginner",
  target_muscles: "",
  estimated_duration_minutes: "15",
  cover_url: "",
  tags: "",
  recommendation_weight: "0",
  is_published: false,
  steps: [{ ...emptyStep }],
};

const difficultyLabels: Record<WorkoutTemplate["difficulty"], string> = {
  beginner: "初级",
  intermediate: "中级",
  advanced: "高级",
};

function optionalText(value: string) {
  return value.trim() || null;
}

function optionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

function toForm(template: WorkoutTemplate): TemplateForm {
  return {
    slug: template.slug,
    title: template.title,
    description: template.description ?? "",
    goal: template.goal,
    difficulty: template.difficulty,
    target_muscles: template.target_muscles,
    estimated_duration_minutes: String(template.estimated_duration_minutes),
    cover_url: template.cover_url ?? "",
    tags: template.tags.join(", "),
    recommendation_weight: String(template.recommendation_weight),
    is_published: template.is_published,
    steps:
      template.steps.length > 0
        ? template.steps.map((step) => ({
            sort_order: String(step.sort_order),
            exercise_id: step.exercise_id ? String(step.exercise_id) : "",
            workout_mode_id: step.workout_mode_id
              ? String(step.workout_mode_id)
              : "",
            title: step.title,
            sets: step.sets ? String(step.sets) : "",
            reps: step.reps ? String(step.reps) : "",
            duration_seconds: step.duration_seconds
              ? String(step.duration_seconds)
              : "",
            rest_seconds:
              step.rest_seconds !== null && step.rest_seconds !== undefined
                ? String(step.rest_seconds)
                : "",
            instruction: step.instruction ?? "",
            allow_pose_detection: step.allow_pose_detection,
          }))
        : [{ ...emptyStep }],
  };
}

function requirePositiveInteger(value: string, label: string) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`${label}必须是正整数`);
  }
  return number;
}

function parseStep(step: StepForm, index: number): WorkoutTemplateStepPayload {
  const title = step.title.trim();
  if (!title) {
    throw new Error(`第 ${index + 1} 个步骤缺少标题`);
  }
  const duration = optionalNumber(step.duration_seconds);
  const rest = optionalNumber(step.rest_seconds);
  if (duration !== null && (!Number.isInteger(duration) || duration <= 0)) {
    throw new Error("动作时长必须是正整数秒");
  }
  if (rest !== null && (!Number.isInteger(rest) || rest < 0)) {
    throw new Error("休息时长不能为负数");
  }
  return {
    sort_order: Number(step.sort_order) || index,
    exercise_id: optionalNumber(step.exercise_id),
    workout_mode_id: optionalNumber(step.workout_mode_id),
    title,
    sets: optionalNumber(step.sets),
    reps: optionalNumber(step.reps),
    duration_seconds: duration,
    rest_seconds: rest,
    instruction: optionalText(step.instruction),
    allow_pose_detection: step.allow_pose_detection,
  };
}

function buildPayload(form: TemplateForm): WorkoutTemplatePayload {
  const title = form.title.trim();
  const goal = form.goal.trim();
  const targetMuscles = form.target_muscles.trim();
  if (!title || !goal || !targetMuscles) {
    throw new Error("请填写标题、目标和目标肌群");
  }
  return {
    slug: form.slug.trim(),
    title,
    description: optionalText(form.description),
    goal,
    difficulty: form.difficulty,
    target_muscles: targetMuscles,
    estimated_duration_minutes: requirePositiveInteger(
      form.estimated_duration_minutes,
      "预计时长",
    ),
    cover_url: optionalText(form.cover_url),
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    recommendation_weight: Math.max(0, Number(form.recommendation_weight) || 0),
    is_published: form.is_published,
    steps: form.steps
      .filter((step) => step.title.trim())
      .map((step, index) => parseStep(step, index)),
  };
}

export default function AdminWorkoutTemplatesPage() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [modes, setModes] = useState<WorkoutMode[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    try {
      const [nextTemplates, nextExercises, nextModes] = await Promise.all([
        fetchAdminWorkoutTemplates(),
        fetchExercises(),
        fetchWorkoutModes(),
      ]);
      setTemplates(nextTemplates);
      setExercises(nextExercises);
      setModes(nextModes);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "训练模板读取失败");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function updateForm(nextForm: TemplateForm) {
    setDialog((current) => (current ? { ...current, form: nextForm } : current));
  }

  function updateStep(index: number, patch: Partial<StepForm>) {
    if (!dialog) {
      return;
    }
    updateForm({
      ...dialog.form,
      steps: dialog.form.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...patch } : step,
      ),
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
        if (!payload.slug) {
          throw new Error("请填写 Slug");
        }
        await createAdminWorkoutTemplate(payload);
        setMessage("训练模板已创建");
      } else {
        const { slug: _slug, ...updatePayload } = payload;
        await updateAdminWorkoutTemplate(
          dialog.templateId,
          updatePayload as WorkoutTemplateUpdatePayload,
        );
        setMessage("训练模板已保存");
      }
      setDialog(null);
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "训练模板保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  function renderDialog() {
    if (!dialog) {
      return null;
    }
    const form = dialog.form;
    return (
      <div className="fixed inset-0 z-40 flex items-end overflow-y-auto bg-black/60 px-4 py-6 sm:items-center sm:justify-center">
        <form
          className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
          onSubmit={handleSubmit}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">
                {dialog.mode === "create" ? "新建训练模板" : "编辑训练模板"}
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

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {dialog.mode === "create" ? (
              <label className="block text-sm font-medium text-slate-700">
                Slug
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                  required
                  value={form.slug}
                  onChange={(event) => updateForm({ ...form, slug: event.target.value })}
                />
              </label>
            ) : null}
            <label className="block text-sm font-medium text-slate-700">
              标题
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                required
                value={form.title}
                onChange={(event) => updateForm({ ...form, title: event.target.value })}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              目标
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                required
                value={form.goal}
                onChange={(event) => updateForm({ ...form, goal: event.target.value })}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              难度
              <select
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                value={form.difficulty}
                onChange={(event) =>
                  updateForm({
                    ...form,
                    difficulty: event.target.value as WorkoutTemplate["difficulty"],
                  })
                }
              >
                <option value="beginner">初级</option>
                <option value="intermediate">中级</option>
                <option value="advanced">高级</option>
              </select>
            </label>
            <label className="block text-sm font-medium text-slate-700">
              目标肌群
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                required
                value={form.target_muscles}
                onChange={(event) =>
                  updateForm({ ...form, target_muscles: event.target.value })
                }
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              预计分钟
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                min="1"
                required
                type="number"
                value={form.estimated_duration_minutes}
                onChange={(event) =>
                  updateForm({
                    ...form,
                    estimated_duration_minutes: event.target.value,
                  })
                }
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              推荐权重
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                min="0"
                type="number"
                value={form.recommendation_weight}
                onChange={(event) =>
                  updateForm({ ...form, recommendation_weight: event.target.value })
                }
              />
            </label>
            <label className="flex items-center gap-2 self-end text-sm font-medium text-slate-700">
              <input
                checked={form.is_published}
                className="h-4 w-4 accent-gym-teal"
                type="checkbox"
                onChange={(event) =>
                  updateForm({ ...form, is_published: event.target.checked })
                }
              />
              发布
            </label>
            <label className="block text-sm font-medium text-slate-700 md:col-span-3">
              描述
              <textarea
                className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                value={form.description}
                onChange={(event) =>
                  updateForm({ ...form, description: event.target.value })
                }
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              标签
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                placeholder="lower, beginner"
                value={form.tags}
                onChange={(event) => updateForm({ ...form, tags: event.target.value })}
              />
            </label>
            <label className="block text-sm font-medium text-slate-700 md:col-span-2">
              封面 URL
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                value={form.cover_url}
                onChange={(event) =>
                  updateForm({ ...form, cover_url: event.target.value })
                }
              />
            </label>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-base font-semibold text-slate-950">步骤</h4>
              <button
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                type="button"
                onClick={() =>
                  updateForm({
                    ...form,
                    steps: [
                      ...form.steps,
                      { ...emptyStep, sort_order: String(form.steps.length) },
                    ],
                  })
                }
              >
                <Plus aria-hidden="true" size={16} />
                添加步骤
              </button>
            </div>
            {form.steps.map((step, index) => (
              <div
                key={index}
                className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-6"
              >
                <label className="block text-sm font-medium text-slate-700">
                  顺序
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    min="0"
                    type="number"
                    value={step.sort_order}
                    onChange={(event) =>
                      updateStep(index, { sort_order: event.target.value })
                    }
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                  标题
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    required
                    value={step.title}
                    onChange={(event) =>
                      updateStep(index, { title: event.target.value })
                    }
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  动作
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    value={step.exercise_id}
                    onChange={(event) =>
                      updateStep(index, { exercise_id: event.target.value })
                    }
                  >
                    <option value="">无</option>
                    {exercises.map((exercise) => (
                      <option key={exercise.id} value={exercise.id}>
                        {exercise.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  模式
                  <select
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    value={step.workout_mode_id}
                    onChange={(event) =>
                      updateStep(index, { workout_mode_id: event.target.value })
                    }
                  >
                    <option value="">无</option>
                    {modes.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  aria-label="删除步骤"
                  className="mt-6 inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-red-600"
                  type="button"
                  onClick={() =>
                    updateForm({
                      ...form,
                      steps: form.steps.filter((_, stepIndex) => stepIndex !== index),
                    })
                  }
                >
                  <Trash2 aria-hidden="true" size={17} />
                </button>
                {[
                  ["组", "sets"],
                  ["次", "reps"],
                  ["动作秒", "duration_seconds"],
                  ["休息秒", "rest_seconds"],
                ].map(([label, field]) => (
                  <label
                    key={field}
                    className="block text-sm font-medium text-slate-700"
                  >
                    {label}
                    <input
                      className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                      min={field === "rest_seconds" ? "0" : "1"}
                      type="number"
                      value={step[field as keyof StepForm] as string}
                      onChange={(event) =>
                        updateStep(index, { [field]: event.target.value })
                      }
                    />
                  </label>
                ))}
                <label className="flex items-center gap-2 self-end text-sm font-medium text-slate-700">
                  <input
                    checked={step.allow_pose_detection}
                    className="h-4 w-4 accent-gym-teal"
                    type="checkbox"
                    onChange={(event) =>
                      updateStep(index, {
                        allow_pose_detection: event.target.checked,
                      })
                    }
                  />
                  姿态检测
                </label>
                <label className="block text-sm font-medium text-slate-700 md:col-span-6">
                  说明
                  <textarea
                    className="mt-1 min-h-16 w-full rounded-md border border-slate-300 px-2 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    value={step.instruction}
                    onChange={(event) =>
                      updateStep(index, { instruction: event.target.value })
                    }
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              type="button"
              onClick={() => setDialog(null)}
            >
              取消
            </button>
            <button
              className="rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "保存中" : "保存"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">训练模板</h2>
          <p className="mt-1 text-sm text-slate-600">
            维护用户端推荐训练和可复制到课表的动作步骤。
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
          新建模板
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-gym-teal">{message}</p> : null}

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
                  {template.slug} · {difficultyLabels[template.difficulty]} ·{" "}
                  {template.estimated_duration_minutes} 分钟
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {template.goal} · {template.target_muscles} · {template.steps.length} 步
                </p>
              </div>
              <span className="rounded-md bg-gym-mint px-2 py-1 text-xs font-medium text-gym-teal">
                {template.is_published ? "已发布" : "草稿"}
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
                    templateId: template.id,
                    slug: template.slug,
                    form: toForm(template),
                  });
                }}
              >
                <Pencil aria-hidden="true" size={16} />
                查看/编辑
              </button>
            </div>
          </article>
        ))}
        {!isLoading && templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            还没有训练模板。
          </div>
        ) : null}
      </div>

      {renderDialog()}
    </section>
  );
}
