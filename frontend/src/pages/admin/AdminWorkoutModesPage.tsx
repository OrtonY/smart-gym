import { FormEvent, useEffect, useState } from "react";
import { Dumbbell, Pencil, Plus, X } from "lucide-react";

import {
  WorkoutMode,
  WorkoutModeUpdatePayload,
  createAdminWorkoutMode,
  fetchAdminWorkoutModes,
  updateAdminWorkoutMode,
} from "../../api/client";

type WorkoutModeForm = {
  code: string;
  name: string;
  description: string;
  estimated_calories_per_hour: string;
  is_active: boolean;
};

type DialogState =
  | { mode: "create"; form: WorkoutModeForm }
  | { mode: "edit"; modeId: number; code: string; form: WorkoutModeForm };

const emptyForm: WorkoutModeForm = {
  code: "",
  name: "",
  description: "",
  estimated_calories_per_hour: "360",
  is_active: true,
};

function toForm(mode: WorkoutMode): WorkoutModeForm {
  return {
    code: mode.code,
    name: mode.name,
    description: mode.description ?? "",
    estimated_calories_per_hour: String(mode.estimated_calories_per_hour),
    is_active: mode.is_active,
  };
}

function parseCalories(value: string) {
  const calories = Number(value);
  if (!Number.isInteger(calories) || calories < 0 || calories > 2000) {
    throw new Error("每小时热量必须是 0 到 2000 的整数");
  }
  return calories;
}

export default function AdminWorkoutModesPage() {
  const [modes, setModes] = useState<WorkoutMode[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadModes() {
    setIsLoading(true);
    try {
      setModes(await fetchAdminWorkoutModes());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "运动模式读取失败");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadModes();
  }, []);

  function updateDialogForm(nextForm: WorkoutModeForm) {
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
    const name = dialog.form.name.trim();
    if (!name) {
      setError("请填写运动模式名称");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name,
        description: dialog.form.description.trim() || null,
        estimated_calories_per_hour: parseCalories(
          dialog.form.estimated_calories_per_hour,
        ),
        is_active: dialog.form.is_active,
      };

      if (dialog.mode === "create") {
        const code = dialog.form.code.trim();
        if (!code) {
          throw new Error("请填写编码");
        }
        await createAdminWorkoutMode({ code, ...payload });
        setMessage("运动模式已创建");
      } else {
        await updateAdminWorkoutMode(dialog.modeId, payload as WorkoutModeUpdatePayload);
        setMessage("运动模式配置已保存");
      }

      setDialog(null);
      await loadModes();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "运动模式保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">运动模式管理</h2>
          <p className="mt-1 text-sm text-slate-600">
            配置训练类型、热量估算和用户端是否可选。
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
          新建模式
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-gym-teal">{message}</p> : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {modes.map((mode) => (
          <article
            key={mode.id}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{mode.name}</p>
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
            <div className="mt-4 flex justify-end">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                type="button"
                onClick={() => {
                  setError(null);
                  setMessage(null);
                  setDialog({
                    mode: "edit",
                    modeId: mode.id,
                    code: mode.code,
                    form: toForm(mode),
                  });
                }}
              >
                <Pencil aria-hidden="true" size={16} />
                查看/编辑
              </button>
            </div>
          </article>
        ))}
        {!isLoading && modes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            还没有运动模式。
          </div>
        ) : null}
      </div>

      {dialog ? (
        <div className="fixed inset-0 z-40 flex items-end bg-black/60 px-4 py-6 sm:items-center sm:justify-center">
          <form
            className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
            onSubmit={handleSubmit}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-950">
                  {dialog.mode === "create" ? "新建运动模式" : "编辑运动模式"}
                </h3>
                {dialog.mode === "edit" ? (
                  <p className="mt-1 text-sm text-slate-600">编码：{dialog.code}</p>
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
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {dialog.mode === "create" ? (
                <label className="block text-sm font-medium text-slate-700">
                  编码
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    required
                    value={dialog.form.code}
                    onChange={(event) =>
                      updateDialogForm({ ...dialog.form, code: event.target.value })
                    }
                  />
                </label>
              ) : null}
              <label className="block text-sm font-medium text-slate-700">
                名称
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                  required
                  value={dialog.form.name}
                  onChange={(event) =>
                    updateDialogForm({ ...dialog.form, name: event.target.value })
                  }
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                每小时热量
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                  max={2000}
                  min={0}
                  required
                  type="number"
                  value={dialog.form.estimated_calories_per_hour}
                  onChange={(event) =>
                    updateDialogForm({
                      ...dialog.form,
                      estimated_calories_per_hour: event.target.value,
                    })
                  }
                />
              </label>
              <label className="flex items-center gap-2 self-end text-sm font-medium text-slate-700">
                <input
                  checked={dialog.form.is_active}
                  className="h-4 w-4 accent-gym-teal"
                  type="checkbox"
                  onChange={(event) =>
                    updateDialogForm({
                      ...dialog.form,
                      is_active: event.target.checked,
                    })
                  }
                />
                用户端启用
              </label>
              <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                描述
                <textarea
                  className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                  value={dialog.form.description}
                  onChange={(event) =>
                    updateDialogForm({
                      ...dialog.form,
                      description: event.target.value,
                    })
                  }
                />
              </label>
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
