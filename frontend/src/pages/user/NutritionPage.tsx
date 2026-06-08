import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CalendarDays,
  HeartPulse,
  ListChecks,
  Pencil,
  RefreshCw,
  Save,
  Utensils,
  X,
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
  fetchNutritionPlan,
  fetchNutritionPlans,
  fetchNutritionSummary,
  generateNutritionPlan,
  importHeartRateSamples,
  recognizeFood,
  updateNutritionLogCorrection,
} from "../../api/client";
import AiConversationModal from "../../components/AiConversationModal";

type MealType = NutritionLog["meal_type"];
type NutritionTab = "records" | "heart";
type PlanMealType = "breakfast" | "lunch" | "dinner" | "snack";
type PlanMeal = NutritionPlanDetail["items"][number];

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

type RecordDialog = {
  date: string;
  mealType: MealType;
  title: string;
} | null;

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

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateTitle(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(fromDateKey(value));
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

function defaultLoggedAtForMeal(dateKey: string, mealType: MealType) {
  const mealTimes: Record<MealType, [number, number]> = {
    breakfast: [8, 0],
    lunch: [12, 30],
    dinner: [18, 30],
    snack: [16, 0],
    other: [20, 0],
  };
  if (dateKey === toDateKey(new Date())) {
    return toDateTimeLocal(new Date());
  }
  const date = fromDateKey(dateKey);
  const [hours, minutes] = mealTimes[mealType];
  date.setHours(hours, minutes, 0, 0);
  return toDateTimeLocal(date);
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
  const todayKey = toDateKey(new Date());
  const [activeTab, setActiveTab] = useState<NutritionTab>("records");
  const [logs, setLogs] = useState<NutritionLog[]>([]);
  const [summary, setSummary] = useState<NutritionSummary | null>(null);
  const [activePlan, setActivePlan] = useState<NutritionPlanDetail | null>(null);
  const [planAiOpen, setPlanAiOpen] = useState(false);
  const [foodAiOpen, setFoodAiOpen] = useState(false);
  const [recordDialog, setRecordDialog] = useState<RecordDialog>(null);
  const planPrompt = "默认生成 7 天，高蛋白，少油";
  const adjustPrompt = "";
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
      const [nextLogs, nextHeartSummary, nextSummary, nextPlans] = await Promise.all([
        fetchNutritionLogs(),
        fetchHeartRateSummary(),
        fetchNutritionSummary(7),
        fetchNutritionPlans(),
      ]);
      const selectedPlan = nextPlans.find((plan) => plan.is_active) ?? nextPlans[0];
      const nextPlan = selectedPlan
        ? await fetchNutritionPlan(selectedPlan.id)
        : null;
      setLogs(nextLogs);
      setHeartSummary(nextHeartSummary);
      setSummary(nextSummary);
      setActivePlan(nextPlan);
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
  const planDays = useMemo(() => {
    const grouped = new Map<string, PlanMeal[]>();
    for (const meal of activePlan?.items ?? []) {
      const meals = grouped.get(meal.scheduled_date) ?? [];
      meals.push(meal);
      grouped.set(meal.scheduled_date, meals);
    }
    return Array.from(grouped.entries())
      .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
      .map(([date, meals]) => ({
        date,
        meals: meals.sort((left, right) => left.sort_order - right.sort_order),
      }));
  }, [activePlan]);

  function statusLabel(status: PlanMeal["status"]) {
    const labels: Record<PlanMeal["status"], string> = {
      planned: "计划中",
      logged: "已记录",
      partial: "部分记录",
      over_target: "超目标",
      missed: "未记录",
    };
    return labels[status];
  }

  function statusClass(status: PlanMeal["status"]) {
    if (status === "logged") {
      return "bg-emerald-100 text-emerald-700";
    }
    if (status === "partial") {
      return "bg-amber-100 text-amber-700";
    }
    if (status === "over_target") {
      return "bg-red-100 text-red-700";
    }
    if (status === "missed") {
      return "bg-slate-200 text-slate-600";
    }
    return "bg-slate-100 text-slate-700";
  }

  function openRecordDialog(meal: PlanMeal) {
    const loggedAt = defaultLoggedAtForMeal(meal.scheduled_date, meal.meal_type);
    setRecordDialog({
      date: meal.scheduled_date,
      mealType: meal.meal_type,
      title: meal.title,
    });
    setRecognitionForm({
      logged_at: loggedAt,
      meal_type: meal.meal_type,
      description: meal.title,
      image: null,
    });
    setManualForm({
      logged_at: loggedAt,
      meal_type: meal.meal_type,
      food_name: "",
      description: meal.title,
      calories_kcal: String(meal.target_calories_kcal ?? 420),
      protein_g: meal.target_protein_g === null ? "" : String(meal.target_protein_g),
      carbs_g: meal.target_carbs_g === null ? "" : String(meal.target_carbs_g),
      fat_g: meal.target_fat_g === null ? "" : String(meal.target_fat_g),
    });
    setFileInputKey((current) => current + 1);
    setError(null);
    setStatus(null);
  }

  function openQuickRecordDialog() {
    const loggedAt = toDateTimeLocal(new Date());
    setRecordDialog({
      date: todayKey,
      mealType: "lunch",
      title: "饮食记录",
    });
    setRecognitionForm({
      logged_at: loggedAt,
      meal_type: "lunch",
      description: "",
      image: null,
    });
    setManualForm(createEmptyNutritionForm());
    setFileInputKey((current) => current + 1);
    setError(null);
    setStatus(null);
  }

  function updateRecordMealType(mealType: MealType) {
    setRecordDialog((current) => (current ? { ...current, mealType } : current));
    setRecognitionForm((current) => ({ ...current, meal_type: mealType }));
    setManualForm((current) => ({ ...current, meal_type: mealType }));
  }

  function closeRecordDialog() {
    setRecordDialog(null);
  }

  function clearRecognitionImage() {
    setRecognitionForm((current) => ({
      ...current,
      image: null,
    }));
    setFileInputKey((current) => current + 1);
  }

  async function handleNutritionPlanAiSend({
    message,
    conversationId,
  }: {
    message: string;
    conversationId: number | null;
  }) {
    if (!message.trim()) return null;
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      const hadActivePlan = Boolean(activePlan);
      const response = activePlan
        ? await adjustNutritionPlan(activePlan.id, message.trim(), conversationId)
        : await generateNutritionPlan(message.trim(), conversationId);
      setActivePlan(response.plan);
      setPlanAiOpen(false);
      setStatus(hadActivePlan ? "饮食计划已调整" : "饮食计划已生成");
      await loadData();
      return response.conversation_id;
    } catch (caught) {
      throw caught;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleFoodAiSend({
    message,
    conversationId,
  }: {
    message: string;
    conversationId: number | null;
  }) {
    if (!message.trim() && !recognitionForm.image) {
      throw new Error("需要图片或文字描述");
    }
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      const formData = new FormData();
      formData.append("meal_type", manualForm.meal_type);
      formData.append("logged_at", new Date(manualForm.logged_at).toISOString());
      if (message.trim()) {
        formData.append("description", message.trim());
      }
      if (recognitionForm.image) {
        formData.append("image", recognitionForm.image);
      }
      if (conversationId) {
        formData.append("conversation_id", String(conversationId));
      }
      const response = await recognizeFood(formData);
      setStatus(`已保存 ${response.log.food_name}`);
      setEditingLogId(response.log.id);
      setCorrectionForm(correctionFromLog(response.log));
      clearRecognitionImage();
      setFoodAiOpen(false);
      closeRecordDialog();
      await loadData();
      return response.conversation_id;
    } catch (caught) {
      throw caught;
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
      closeRecordDialog();
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

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {status ? <p className="text-sm text-gym-teal">{status}</p> : null}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays
                aria-hidden="true"
                className="text-gym-teal"
                size={20}
              />
              <h3 className="text-lg font-semibold text-slate-950">饮食计划</h3>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {activePlan
                ? `${activePlan.title} · v${activePlan.current_version} · ${activePlan.items.length} 餐`
                : "暂无计划"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
              disabled={isSaving}
              type="button"
              onClick={openQuickRecordDialog}
            >
              <ListChecks aria-hidden="true" size={17} />
              记录饮食
            </button>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-md border border-gym-teal px-4 py-2 text-sm font-semibold text-gym-teal transition hover:bg-gym-mint disabled:opacity-60"
              disabled={isSaving}
              type="button"
              onClick={() => setPlanAiOpen(true)}
            >
              <Bot aria-hidden="true" size={17} />
              AI 对话
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {planDays.map((day) => {
            const isToday = day.date === todayKey;
            return (
              <article
                key={day.date}
                className={[
                  "rounded-lg border p-4",
                  isToday ? "border-gym-teal bg-gym-mint/30" : "border-slate-200",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {formatDateTitle(day.date)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {day.meals.length} 餐 · 目标{" "}
                      {day.meals.reduce(
                        (sum, meal) => sum + (meal.target_calories_kcal ?? 0),
                        0,
                      )}{" "}
                      千卡
                    </p>
                  </div>
                  {isToday ? (
                    <span className="rounded-md bg-gym-teal px-2 py-1 text-xs font-semibold text-white">
                      今天
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {day.meals.map((meal) => (
                    <div
                      key={meal.id}
                      className="rounded-md border border-slate-200 bg-white p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-950">
                            {planMealLabels[meal.meal_type]}
                          </p>
                          <p className="mt-1 text-sm text-slate-700">
                            {meal.title}
                          </p>
                        </div>
                        <span
                          className={[
                            "shrink-0 rounded-md px-2 py-1 text-xs font-semibold",
                            statusClass(meal.status),
                          ].join(" ")}
                        >
                          {statusLabel(meal.status)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {meal.actual_calories_kcal} /{" "}
                        {meal.target_calories_kcal ?? 0} 千卡
                      </p>
                      {meal.portion_notes ? (
                        <p className="mt-2 text-sm text-slate-500">
                          {meal.portion_notes}
                        </p>
                      ) : null}
                      {meal.notes ? (
                        <p className="mt-2 text-sm text-slate-500">
                          {meal.notes}
                        </p>
                      ) : null}
                      {isToday ? (
                        <button
                          className="mt-3 inline-flex items-center gap-2 rounded-md border border-gym-teal px-3 py-2 text-sm font-semibold text-gym-teal transition hover:bg-gym-mint"
                          type="button"
                          onClick={() => openRecordDialog(meal)}
                        >
                          <ListChecks aria-hidden="true" size={16} />
                          记录
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
          {!isLoading && planDays.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">
              暂无饮食计划。
              <button
                className="mt-3 inline-flex items-center gap-2 rounded-md border border-gym-teal px-3 py-2 text-sm font-semibold text-gym-teal transition hover:bg-gym-mint"
                type="button"
                onClick={openQuickRecordDialog}
              >
                <ListChecks aria-hidden="true" size={16} />
                记录饮食
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-1 shadow-soft">
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

      {recordDialog ? (
        <div className="fixed inset-0 z-30 flex items-end bg-slate-950/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-lg bg-white p-5 shadow-soft sm:mx-auto sm:max-w-2xl sm:rounded-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-slate-950">
                  记录饮食
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {formatDateTitle(recordDialog.date)} ·{" "}
                  {mealLabels[recordDialog.mealType]} · {recordDialog.title}
                </p>
              </div>
              <button
                aria-label="关闭"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
                title="关闭"
                type="button"
                onClick={closeRecordDialog}
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
            <form className="mt-5" onSubmit={handleManualSave}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">
                  餐次
                  {renderMealSelect(manualForm.meal_type, updateRecordMealType)}
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
                <label className="block text-sm font-medium text-slate-700">
                  蛋白 g
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    inputMode="decimal"
                    min="0"
                    type="number"
                    value={manualForm.protein_g}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        protein_g: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  碳水 g
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    inputMode="decimal"
                    min="0"
                    type="number"
                    value={manualForm.carbs_g}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        carbs_g: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  脂肪 g
                  <input
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    inputMode="decimal"
                    min="0"
                    type="number"
                    value={manualForm.fat_g}
                    onChange={(event) =>
                      setManualForm((current) => ({
                        ...current,
                        fat_g: event.target.value,
                      }))
                    }
                  />
                </label>
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
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md border border-gym-teal px-4 py-2 text-sm font-semibold text-gym-teal transition hover:bg-gym-mint disabled:opacity-60"
                disabled={isSaving}
                type="button"
                onClick={() => {
                  clearRecognitionImage();
                  setRecognitionForm((current) => ({
                    ...current,
                    logged_at: manualForm.logged_at,
                    meal_type: manualForm.meal_type,
                    description: manualForm.description,
                  }));
                  setFoodAiOpen(true);
                }}
              >
                <Bot aria-hidden="true" size={17} />
                AI 识别
              </button>
              <button
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                disabled={
                  isSaving ||
                  !manualForm.food_name.trim() ||
                  !manualForm.calories_kcal.trim()
                }
                type="submit"
              >
                <Save aria-hidden="true" size={17} />
                {isSaving ? "保存中" : "保存记录"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <AiConversationModal
        isOpen={planAiOpen}
        title="AI 饮食计划"
        subtitle={
          activePlan
            ? `${activePlan.title} · v${activePlan.current_version}`
            : "生成新的饮食计划"
        }
        topic="nutrition_plan"
        nutritionPlanId={activePlan?.id ?? null}
        defaultPrompt={activePlan ? adjustPrompt || "调整当前饮食计划" : planPrompt}
        sendLabel="发送"
        loadingLabel="AI 正在更新饮食计划"
        onClose={() => setPlanAiOpen(false)}
        onSend={({ message, conversationId }) =>
          handleNutritionPlanAiSend({ message, conversationId })
        }
      />

      <AiConversationModal
        isOpen={foodAiOpen}
        title="AI 食物识别"
        subtitle="上传图片或输入描述，识别结果会写入记录列表"
        topic="food_record"
        defaultPrompt={recognitionForm.description}
        sendLabel="识别并保存"
        loadingLabel="AI 正在识别食物"
        canSendEmptyMessage={Boolean(recognitionForm.image)}
        extraFields={
          <label className="block text-sm font-medium text-slate-700">
            图片
            <input
              key={fileInputKey}
              accept="image/*"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gym-mint file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gym-teal"
              disabled={isSaving}
              type="file"
              onChange={(event) =>
                setRecognitionForm((current) => ({
                  ...current,
                  image: event.target.files?.[0] ?? null,
                }))
              }
            />
          </label>
        }
        onClose={() => {
          setFoodAiOpen(false);
          clearRecognitionImage();
        }}
        onSend={({ message, conversationId }) =>
          handleFoodAiSend({ message, conversationId })
        }
      />
    </section>
  );
}
