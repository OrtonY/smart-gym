import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  HeartPulse,
  ImageUp,
  ListChecks,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  Utensils,
} from "lucide-react";

import {
  HeartRateSummary,
  NutritionLog,
  NutritionPlanDetail,
  NutritionSummary,
  adjustNutritionPlan,
  createNutritionLog,
  fetchHeartRateSummary,
  fetchNutritionLogs,
  fetchNutritionSummary,
  generateNutritionPlan,
  importHeartRateSamples,
  recognizeFood,
  updateNutritionLogCorrection,
} from "../../api/client";

type MealType = NutritionLog["meal_type"];
type NutritionTab = "plan" | "recognize" | "manual" | "records" | "heart";
type PlanMealType = "breakfast" | "lunch" | "dinner" | "snack";

type NutritionForm = {
  logged_at: string;
  meal_type: MealType;
  food_name: string;
  description: string;
  calories_kcal: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
};

type RecognitionForm = {
  logged_at: string;
  meal_type: MealType;
  description: string;
  image: File | null;
};

type HeartRateForm = {
  source: string;
  started_at: string;
  sample_count: string;
  start_bpm: string;
  peak_bpm: string;
};

type CorrectionForm = {
  food_name: string;
  description: string;
  calories_kcal: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  user_correction: string;
};

const mealLabels: Record<MealType, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐",
  other: "其他",
};

const planMealLabels: Record<PlanMealType, string> = {
  breakfast: mealLabels.breakfast,
  lunch: mealLabels.lunch,
  dinner: mealLabels.dinner,
  snack: mealLabels.snack,
};

const emptyHeartSummary: HeartRateSummary = {
  samples_count: 0,
  latest_bpm: null,
  average_bpm: null,
  max_bpm: null,
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

function numberOrNull(value: string) {
  return value.trim() === "" ? null : Number(value);
}

function numberOrUndefined(value: string) {
  return value.trim() === "" ? undefined : Number(value);
}

function createEmptyNutritionForm(): NutritionForm {
  return {
    logged_at: toDateTimeLocal(new Date()),
    meal_type: "lunch",
    food_name: "",
    description: "",
    calories_kcal: "420",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
  };
}

function createEmptyRecognitionForm(): RecognitionForm {
  return {
    logged_at: toDateTimeLocal(new Date()),
    meal_type: "lunch",
    description: "",
    image: null,
  };
}

function createEmptyHeartRateForm(): HeartRateForm {
  return {
    source: "simulated",
    started_at: toDateTimeLocal(new Date()),
    sample_count: "6",
    start_bpm: "110",
    peak_bpm: "148",
  };
}

function correctionFromLog(log: NutritionLog): CorrectionForm {
  return {
    food_name: log.food_name,
    description: log.description ?? "",
    calories_kcal: String(log.calories_kcal),
    protein_g: log.protein_g === null ? "" : String(log.protein_g),
    carbs_g: log.carbs_g === null ? "" : String(log.carbs_g),
    fat_g: log.fat_g === null ? "" : String(log.fat_g),
    user_correction: log.user_correction ?? "手动修正",
  };
}

export default function NutritionPage() {
  const [activeTab, setActiveTab] = useState<NutritionTab>("recognize");
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [summary, setSummary] = useState<NutritionSummary | null>(null);
  const [activePlan, setActivePlan] = useState<NutritionPlanDetail | null>(null);
  const [planPrompt, setPlanPrompt] = useState(
    "默认生成 7 天，高蛋白，少油",
  );
  const [adjustPrompt, setAdjustPrompt] = useState("");
  const [heartSummary, setHeartSummary] =
    useState<HeartRateSummary>(emptyHeartSummary);
  const [recognitionForm, setRecognitionForm] = useState<RecognitionForm>(() =>
    createEmptyRecognitionForm(),
  );
  const [manualForm, setManualForm] = useState<NutritionForm>(() =>
    createEmptyNutritionForm(),
  );
  const [heartForm, setHeartForm] = useState<HeartRateForm>(() =>
    createEmptyHeartRateForm(),
  );
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [correctionForm, setCorrectionForm] = useState<CorrectionForm | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    try {
      const [nextLogs, nextHeartSummary, nextSummary] = await Promise.all([
        fetchNutritionLogs(),
        fetchHeartRateSummary(),
        fetchNutritionSummary(7),
      ]);
      setLogs(nextLogs);
      setHeartSummary(nextHeartSummary);
      setSummary(nextSummary);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "饮食数据读取失败");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const latestLogs = useMemo(() => logs.slice(0, 6), [logs]);

  async function handlePlanGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!planPrompt.trim()) {
      setError("请输入饮食计划需求");
      return;
    }
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      const response = await generateNutritionPlan(planPrompt.trim());
      setActivePlan(response.plan);
      setStatus("饮食计划已生成");
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "饮食计划生成失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePlanAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activePlan || !adjustPrompt.trim()) {
      setError("需要先生成计划并输入调整需求");
      return;
    }
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      const response = await adjustNutritionPlan(activePlan.id, adjustPrompt.trim());
      setActivePlan(response.plan);
      setAdjustPrompt("");
      setStatus("饮食计划已调整");
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "饮食计划调整失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRecognize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recognitionForm.description.trim() && !recognitionForm.image) {
      setError("需要图片或文字描述");
      return;
    }
    setIsSaving(true);
    setError(null);
    setStatus(null);
    const formData = new FormData();
    formData.append("meal_type", recognitionForm.meal_type);
    formData.append("logged_at", new Date(recognitionForm.logged_at).toISOString());
    if (recognitionForm.description.trim()) {
      formData.append("description", recognitionForm.description.trim());
    }
    if (recognitionForm.image) {
      formData.append("image", recognitionForm.image);
    }

    try {
      const response = await recognizeFood(formData);
      setStatus(`已保存 ${response.log.food_name}`);
      setRecognitionForm(createEmptyRecognitionForm());
      setFileInputKey((current) => current + 1);
      setEditingLogId(response.log.id);
      setCorrectionForm(correctionFromLog(response.log));
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "食物识别失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleManualSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      const created = await createNutritionLog({
        logged_at: new Date(manualForm.logged_at).toISOString(),
        meal_type: manualForm.meal_type,
        food_name: manualForm.food_name.trim(),
        description: manualForm.description.trim() || null,
        calories_kcal: Number(manualForm.calories_kcal),
        protein_g: numberOrNull(manualForm.protein_g),
        carbs_g: numberOrNull(manualForm.carbs_g),
        fat_g: numberOrNull(manualForm.fat_g),
      });
      setStatus(`已保存 ${created.food_name}`);
      setManualForm(createEmptyNutritionForm());
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "饮食记录保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleHeartRateImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setStatus(null);
    const startedAt = new Date(heartForm.started_at);
    const sampleCount = Math.max(1, Number(heartForm.sample_count));
    const startBpm = Number(heartForm.start_bpm);
    const peakBpm = Number(heartForm.peak_bpm);
    const samples = Array.from({ length: sampleCount }, (_, index) => {
      const ratio = sampleCount === 1 ? 1 : index / (sampleCount - 1);
      const bpm = Math.round(startBpm + (peakBpm - startBpm) * ratio);
      return {
        measured_at: new Date(startedAt.getTime() + index * 60_000).toISOString(),
        bpm,
      };
    });

    try {
      const response = await importHeartRateSamples({
        source: heartForm.source.trim() || "simulated",
        samples,
      });
      setStatus(`已导入 ${response.metrics.length} 条心率`);
      await loadData();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "心率导入失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCorrectionSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingLogId || !correctionForm) {
      return;
    }
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      const updated = await updateNutritionLogCorrection(editingLogId, {
        food_name: correctionForm.food_name.trim() || undefined,
        description: correctionForm.description.trim() || undefined,
        calories_kcal: numberOrUndefined(correctionForm.calories_kcal),
        protein_g: numberOrUndefined(correctionForm.protein_g),
        carbs_g: numberOrUndefined(correctionForm.carbs_g),
        fat_g: numberOrUndefined(correctionForm.fat_g),
        user_correction: correctionForm.user_correction.trim() || "手动修正",
      });
      setLogs((current) =>
        current.map((log) => (log.id === updated.id ? updated : log)),
      );
      setStatus("修正已保存");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "修正保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  function startCorrection(log: NutritionLog) {
    setEditingLogId(log.id);
    setCorrectionForm(correctionFromLog(log));
    setActiveTab("records");
  }

  function renderMealSelect(
    value: MealType,
    onChange: (nextValue: MealType) => void,
  ) {
    return (
      <select
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
        value={value}
        onChange={(event) => onChange(event.target.value as MealType)}
      >
        {Object.entries(mealLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    );
  }

  function renderLogCard(log: NutritionLog) {
    return (
      <article
        key={log.id}
        className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-950">{log.food_name}</p>
            <p className="mt-1 text-sm text-slate-600">
              {mealLabels[log.meal_type]} · {formatDateTime(log.logged_at)} ·{" "}
              {log.calories_kcal} 千卡
            </p>
            <p className="mt-2 text-sm text-slate-600">
              蛋白 {Math.round(log.protein_g ?? 0)}g · 碳水{" "}
              {Math.round(log.carbs_g ?? 0)}g · 脂肪 {Math.round(log.fat_g ?? 0)}g
            </p>
            {log.description ? (
              <p className="mt-2 text-sm text-slate-600">{log.description}</p>
            ) : null}
          </div>
          <button
            aria-label="修正饮食记录"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition hover:border-gym-teal hover:text-gym-teal"
            title="修正"
            type="button"
            onClick={() => startCorrection(log)}
          >
            <Pencil aria-hidden="true" size={17} />
          </button>
        </div>
      </article>
    );
  }

  function renderCalorieChart(nextSummary: NutritionSummary | null) {
    const days = nextSummary?.daily ?? [];
    const maxValue = Math.max(
      1,
      ...days.map((day) =>
        Math.max(day.actual_calories_kcal, day.target_calories_kcal),
      ),
    );
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <h3 className="text-base font-semibold text-slate-950">近 7 天卡路里</h3>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {days.map((day) => {
            const actualHeight = Math.max(
              6,
              (day.actual_calories_kcal / maxValue) * 120,
            );
            const targetHeight = Math.max(
              6,
              (day.target_calories_kcal / maxValue) * 120,
            );
            return (
              <div
                key={day.date}
                className="flex min-w-0 flex-col items-center gap-2"
              >
                <div className="flex h-32 items-end gap-1">
                  <span
                    className="w-3 rounded-t bg-gym-teal"
                    style={{ height: `${actualHeight}px` }}
                    title={`实际 ${day.actual_calories_kcal} 千卡`}
                  />
                  <span
                    className="w-3 rounded-t bg-slate-300"
                    style={{ height: `${targetHeight}px` }}
                    title={`目标 ${day.target_calories_kcal} 千卡`}
                  />
                </div>
                <span className="truncate text-xs text-slate-500">
                  {new Date(day.date).getDate()}日
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: NutritionTab; label: string }> = [
    { id: "plan", label: "计划" },
    { id: "recognize", label: "识别" },
    { id: "manual", label: "手动" },
    { id: "records", label: "记录" },
    { id: "heart", label: "心率" },
  ];

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">饮食</h2>
          <p className="mt-1 text-sm text-slate-600">
            今日摄入、食物识别和心率导入集中管理。
          </p>
        </div>
        <button
          aria-label="刷新饮食数据"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition hover:border-gym-teal hover:text-gym-teal"
          disabled={isLoading}
          title="刷新"
          type="button"
          onClick={() => void loadData()}
        >
          <RefreshCw aria-hidden="true" size={17} />
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-600">今日摄入</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {summary?.today.actual_calories_kcal ?? 0}
                <span className="ml-2 text-base font-medium text-slate-500">
                  / {summary?.today.target_calories_kcal ?? 0} 千卡
                </span>
              </p>
            </div>
            <Utensils aria-hidden="true" className="text-gym-teal" size={24} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <p className="text-sm text-slate-600">
              蛋白 {Math.round(summary?.today.actual_protein_g ?? 0)}g
            </p>
            <p className="text-sm text-slate-600">
              碳水 {Math.round(summary?.today.actual_carbs_g ?? 0)}g
            </p>
            <p className="text-sm text-slate-600">
              脂肪 {Math.round(summary?.today.actual_fat_g ?? 0)}g
            </p>
          </div>
        </article>
        {renderCalorieChart(summary)}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {(summary?.today.meals ?? []).map((meal) => (
          <article
            key={meal.id}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">
                  {planMealLabels[meal.meal_type]}
                </p>
                <p className="mt-1 text-sm text-slate-600">{meal.title}</p>
              </div>
              <span className="rounded-md bg-gym-mint px-2 py-1 text-xs font-semibold text-gym-teal">
                {meal.status}
              </span>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {meal.actual_calories_kcal} / {meal.target_calories_kcal ?? 0} 千卡
            </p>
            {meal.portion_notes ? (
              <p className="mt-2 text-sm text-slate-500">{meal.portion_notes}</p>
            ) : null}
          </article>
        ))}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {status ? <p className="text-sm text-gym-teal">{status}</p> : null}

      <div className="grid grid-cols-5 gap-2 rounded-lg border border-slate-200 bg-white p-1 shadow-soft">
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
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "plan" ? (
        <div className="space-y-3">
          <form
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
            onSubmit={handlePlanGenerate}
          >
            <div className="flex items-center gap-2">
              <Sparkles aria-hidden="true" className="text-gym-teal" size={20} />
              <h3 className="text-lg font-semibold text-slate-950">
                生成饮食计划
              </h3>
            </div>
            <textarea
              className="mt-4 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              value={planPrompt}
              onChange={(event) => setPlanPrompt(event.target.value)}
            />
            <button
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              <Sparkles aria-hidden="true" size={17} />
              生成计划
            </button>
          </form>
          {activePlan ? (
            <form
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
              onSubmit={handlePlanAdjust}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-950">
                  调整当前计划
                </h3>
                <span className="text-sm text-slate-500">
                  v{activePlan.current_version} · {activePlan.items.length} 餐
                </span>
              </div>
              <textarea
                className="mt-4 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                value={adjustPrompt}
                onChange={(event) => setAdjustPrompt(event.target.value)}
              />
              <button
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                <Sparkles aria-hidden="true" size={17} />
                调整计划
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {activeTab === "recognize" ? (
        <form
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
          onSubmit={handleRecognize}
        >
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden="true" className="text-gym-teal" size={20} />
            <h3 className="text-lg font-semibold text-slate-950">食物识别</h3>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              餐次
              {renderMealSelect(recognitionForm.meal_type, (meal_type) =>
                setRecognitionForm((current) => ({ ...current, meal_type })),
              )}
            </label>
            <label className="block text-sm font-medium text-slate-700">
              时间
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                required
                type="datetime-local"
                value={recognitionForm.logged_at}
                onChange={(event) =>
                  setRecognitionForm((current) => ({
                    ...current,
                    logged_at: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            图片
            <input
              key={fileInputKey}
              accept="image/*"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gym-mint file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gym-teal"
              type="file"
              onChange={(event) =>
                setRecognitionForm((current) => ({
                  ...current,
                  image: event.target.files?.[0] ?? null,
                }))
              }
            />
          </label>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            描述
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              value={recognitionForm.description}
              onChange={(event) =>
                setRecognitionForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
          <button
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            disabled={isSaving}
            type="submit"
          >
            <ImageUp aria-hidden="true" size={17} />
            {isSaving ? "保存中" : "识别并保存"}
          </button>
        </form>
      ) : null}

      {activeTab === "manual" ? (
        <form
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
          onSubmit={handleManualSave}
        >
          <div className="flex items-center gap-2">
            <Save aria-hidden="true" className="text-gym-teal" size={20} />
            <h3 className="text-lg font-semibold text-slate-950">手动记录</h3>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              餐次
              {renderMealSelect(manualForm.meal_type, (meal_type) =>
                setManualForm((current) => ({ ...current, meal_type })),
              )}
            </label>
            <label className="block text-sm font-medium text-slate-700">
              时间
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                required
                type="datetime-local"
                value={manualForm.logged_at}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    logged_at: event.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              食物
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                required
                value={manualForm.food_name}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    food_name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              千卡
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                inputMode="numeric"
                max="10000"
                min="0"
                required
                type="number"
                value={manualForm.calories_kcal}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    calories_kcal: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {(["protein_g", "carbs_g", "fat_g"] as const).map((field) => (
              <label key={field} className="block text-sm font-medium text-slate-700">
                {field === "protein_g" ? "蛋白 g" : field === "carbs_g" ? "碳水 g" : "脂肪 g"}
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                  inputMode="decimal"
                  min="0"
                  type="number"
                  value={manualForm[field]}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      [field]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            备注
            <textarea
              className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              value={manualForm.description}
              onChange={(event) =>
                setManualForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
          <button
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            disabled={isSaving}
            type="submit"
          >
            <Save aria-hidden="true" size={17} />
            {isSaving ? "保存中" : "保存记录"}
          </button>
        </form>
      ) : null}

      {activeTab === "records" ? (
        <div className="space-y-3">
          {editingLogId && correctionForm ? (
            <form
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
              onSubmit={handleCorrectionSave}
            >
              <div className="flex items-center gap-2">
                <Pencil aria-hidden="true" className="text-gym-teal" size={20} />
                <h3 className="text-lg font-semibold text-slate-950">修正记录</h3>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  食物
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    value={correctionForm.food_name}
                    onChange={(event) =>
                      setCorrectionForm((current) =>
                        current ? { ...current, food_name: event.target.value } : current,
                      )
                    }
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  千卡
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    inputMode="numeric"
                    type="number"
                    value={correctionForm.calories_kcal}
                    onChange={(event) =>
                      setCorrectionForm((current) =>
                        current
                          ? { ...current, calories_kcal: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
              </div>
              <label className="mt-4 block text-sm font-medium text-slate-700">
                修正说明
                <textarea
                  className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                  value={correctionForm.user_correction}
                  onChange={(event) =>
                    setCorrectionForm((current) =>
                      current
                        ? { ...current, user_correction: event.target.value }
                        : current,
                    )
                  }
                />
              </label>
              <button
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                disabled={isSaving}
                type="submit"
              >
                <Save aria-hidden="true" size={17} />
                保存修正
              </button>
            </form>
          ) : null}
          {latestLogs.map(renderLogCard)}
          {!isLoading && latestLogs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
              暂无饮食记录。
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "heart" ? (
        <form
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
          onSubmit={handleHeartRateImport}
        >
          <div className="flex items-center gap-2">
            <HeartPulse aria-hidden="true" className="text-gym-teal" size={20} />
            <h3 className="text-lg font-semibold text-slate-950">模拟心率</h3>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              来源
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                value={heartForm.source}
                onChange={(event) =>
                  setHeartForm((current) => ({ ...current, source: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              开始时间
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                required
                type="datetime-local"
                value={heartForm.started_at}
                onChange={(event) =>
                  setHeartForm((current) => ({
                    ...current,
                    started_at: event.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              样本数
              <input
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                max="1000"
                min="1"
                required
                type="number"
                value={heartForm.sample_count}
                onChange={(event) =>
                  setHeartForm((current) => ({
                    ...current,
                    sample_count: event.target.value,
                  }))
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-slate-700">
                起始 bpm
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                  max="240"
                  min="30"
                  required
                  type="number"
                  value={heartForm.start_bpm}
                  onChange={(event) =>
                    setHeartForm((current) => ({
                      ...current,
                      start_bpm: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                峰值 bpm
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                  max="240"
                  min="30"
                  required
                  type="number"
                  value={heartForm.peak_bpm}
                  onChange={(event) =>
                    setHeartForm((current) => ({
                      ...current,
                      peak_bpm: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xl font-semibold text-slate-950">
                {heartSummary.samples_count}
              </p>
              <p className="mt-1 text-xs text-slate-500">样本</p>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xl font-semibold text-slate-950">
                {heartSummary.average_bpm ?? "--"}
              </p>
              <p className="mt-1 text-xs text-slate-500">平均 bpm</p>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xl font-semibold text-slate-950">
                {heartSummary.max_bpm ?? "--"}
              </p>
              <p className="mt-1 text-xs text-slate-500">最高 bpm</p>
            </div>
          </div>
          <button
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            disabled={isSaving}
            type="submit"
          >
            <HeartPulse aria-hidden="true" size={17} />
            导入心率
          </button>
        </form>
      ) : null}
    </section>
  );
}
