import { FormEvent, useEffect, useState } from "react";
import { Dumbbell, Plus, Save } from "lucide-react";

import {
  WorkoutMode,
  WorkoutModeUpdatePayload,
  createAdminWorkoutMode,
  fetchAdminWorkoutModes,
  updateAdminWorkoutMode,
} from "../../api/client";

type WorkoutModeCreateForm = {
  code: string;
  name: string;
  description: string;
  estimated_calories_per_hour: string;
  is_active: boolean;
};

type WorkoutModeEditForm = {
  name: string;
  description: string;
  estimated_calories_per_hour: string;
  is_active: boolean;
};

const emptyCreateForm: WorkoutModeCreateForm = {
  code: "",
  name: "",
  description: "",
  estimated_calories_per_hour: "360",
  is_active: true,
};

function toEditForm(mode: WorkoutMode): WorkoutModeEditForm {
  return {
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
  const [createForm, setCreateForm] = useState<WorkoutModeCreateForm>(emptyCreateForm);
  const [editForms, setEditForms] = useState<Record<number, WorkoutModeEditForm>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadModes() {
    setIsLoading(true);
    try {
      const nextModes = await fetchAdminWorkoutModes();
      setModes(nextModes);
      setEditForms(
        Object.fromEntries(nextModes.map((mode) => [mode.id, toEditForm(mode)])),
      );
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

  async function handleCreateMode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const code = createForm.code.trim();
    const name = createForm.name.trim();
    if (!code || !name) {
      setError("请填写编码和名称");
      return;
    }

    setSavingId("create");
    try {
      await createAdminWorkoutMode({
        code,
        name,
        description: createForm.description.trim() || null,
        estimated_calories_per_hour: parseCalories(
          createForm.estimated_calories_per_hour,
        ),
        is_active: createForm.is_active,
      });
      setCreateForm(emptyCreateForm);
      await loadModes();
      setMessage("运动模式已创建");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "运动模式创建失败");
    } finally {
      setSavingId(null);
    }
  }

  async function handleUpdateMode(modeId: number) {
    setError(null);
    setMessage(null);
    const form = editForms[modeId];
    if (!form) {
      return;
    }

    const name = form.name.trim();
    if (!name) {
      setError("请填写运动模式名称");
      return;
    }

    setSavingId(modeId);
    try {
      const payload: WorkoutModeUpdatePayload = {
        name,
        description: form.description.trim() || null,
        estimated_calories_per_hour: parseCalories(form.estimated_calories_per_hour),
        is_active: form.is_active,
      };
      await updateAdminWorkoutMode(modeId, payload);
      await loadModes();
      setMessage("运动模式配置已保存");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "运动模式保存失败");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">运动模式管理</h2>
        <p className="mt-1 text-sm text-slate-600">
          配置训练模式、热量估算和用户端是否可选。
        </p>
      </div>

      <form
        className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
        onSubmit={handleCreateMode}
      >
        <div className="flex items-center gap-2">
          <Dumbbell aria-hidden="true" className="text-gym-teal" size={20} />
          <h3 className="text-lg font-semibold text-slate-950">新增运动模式</h3>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            编码
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              required
              value={createForm.code}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, code: event.target.value }))
              }
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            名称
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              required
              value={createForm.name}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, name: event.target.value }))
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
              value={createForm.estimated_calories_per_hour}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  estimated_calories_per_hour: event.target.value,
                }))
              }
            />
          </label>
          <label className="flex items-center gap-2 self-end text-sm font-medium text-slate-700">
            <input
              checked={createForm.is_active}
              className="h-4 w-4 accent-gym-teal"
              type="checkbox"
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  is_active: event.target.checked,
                }))
              }
            />
            用户端启用
          </label>
          <label className="block text-sm font-medium text-slate-700 md:col-span-2">
            描述
            <textarea
              className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              value={createForm.description}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <button
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isLoading || savingId === "create"}
          type="submit"
        >
          <Plus aria-hidden="true" size={18} />
          {savingId === "create" ? "创建中" : "创建运动模式"}
        </button>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-gym-teal">{message}</p> : null}

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-slate-950">已配置模式</h3>
        {modes.map((mode) => {
          const form = editForms[mode.id] ?? toEditForm(mode);
          return (
            <article
              key={mode.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">{mode.code}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    ID {mode.id} · {mode.is_active ? "用户端可选" : "已停用"}
                  </p>
                </div>
                <span className="rounded-md bg-gym-mint px-2 py-1 text-xs font-medium text-gym-teal">
                  {mode.is_active ? "启用" : "停用"}
                </span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  名称
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    value={form.name}
                    onChange={(event) =>
                      setEditForms((current) => ({
                        ...current,
                        [mode.id]: { ...form, name: event.target.value },
                      }))
                    }
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  每小时热量
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    max={2000}
                    min={0}
                    type="number"
                    value={form.estimated_calories_per_hour}
                    onChange={(event) =>
                      setEditForms((current) => ({
                        ...current,
                        [mode.id]: {
                          ...form,
                          estimated_calories_per_hour: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                  描述
                  <textarea
                    className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    value={form.description}
                    onChange={(event) =>
                      setEditForms((current) => ({
                        ...current,
                        [mode.id]: { ...form, description: event.target.value },
                      }))
                    }
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    checked={form.is_active}
                    className="h-4 w-4 accent-gym-teal"
                    type="checkbox"
                    onChange={(event) =>
                      setEditForms((current) => ({
                        ...current,
                        [mode.id]: { ...form, is_active: event.target.checked },
                      }))
                    }
                  />
                  用户端启用
                </label>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={savingId === mode.id}
                  type="button"
                  onClick={() => void handleUpdateMode(mode.id)}
                >
                  <Save aria-hidden="true" size={16} />
                  {savingId === mode.id ? "保存中" : "保存配置"}
                </button>
              </div>
            </article>
          );
        })}
        {!isLoading && modes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            还没有运动模式。
          </div>
        ) : null}
      </div>
    </section>
  );
}
