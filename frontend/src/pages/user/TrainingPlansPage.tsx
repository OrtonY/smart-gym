import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Edit3,
  MessageSquare,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";

import {
  TrainingPlanDetail,
  TrainingPlanItemPayload,
  adjustAiTrainingPlan,
  createTrainingPlan,
  fetchTrainingPlan,
  fetchTrainingPlans,
  generateAiTrainingPlan,
  replaceTrainingPlanItems,
} from "../../api/client";

type ItemForm = {
  scheduled_date: string | null;
  day_of_week: string;
  title: string;
  sets: string;
  reps: string;
  duration_minutes: string;
  notes: string;
};

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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

function mondayWeekday(date: Date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
  }).format(date);
}

function formatDateTitle(value: string) {
  const date = fromDateKey(value);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function createDefaultItem(dateKey: string): ItemForm {
  return {
    scheduled_date: dateKey,
    day_of_week: String(mondayWeekday(fromDateKey(dateKey))),
    title: "训练安排",
    sets: "",
    reps: "",
    duration_minutes: "30",
    notes: "",
  };
}

function toFormItem(item: TrainingPlanItemPayload | TrainingPlanDetail["items"][number]) {
  return {
    scheduled_date: item.scheduled_date,
    day_of_week: String(item.day_of_week),
    title: item.title,
    sets: item.sets ? String(item.sets) : "",
    reps: item.reps ? String(item.reps) : "",
    duration_minutes: item.duration_minutes ? String(item.duration_minutes) : "",
    notes: item.notes ?? "",
  };
}

function toPayload(item: ItemForm, sortOrder: number): TrainingPlanItemPayload {
  return {
    scheduled_date: item.scheduled_date,
    day_of_week: Number(item.day_of_week),
    sort_order: sortOrder,
    exercise_id: null,
    workout_mode_id: null,
    title: item.title.trim(),
    sets: item.sets ? Number(item.sets) : null,
    reps: item.reps ? Number(item.reps) : null,
    duration_minutes: item.duration_minutes ? Number(item.duration_minutes) : null,
    notes: item.notes.trim() || null,
  };
}

function metaText(item: ItemForm) {
  return [
    item.sets ? `${item.sets} 组` : null,
    item.reps ? `${item.reps} 次` : null,
    item.duration_minutes ? `${item.duration_minutes} 分钟` : null,
  ].filter(Boolean);
}

function monthCells(monthCursor: Date) {
  const first = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const last = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0);
  const leading = mondayWeekday(first) - 1;
  const cells: Array<Date | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

export default function TrainingPlansPage() {
  const todayKey = toDateKey(startOfToday());
  const [activePlan, setActivePlan] = useState<TrainingPlanDetail | null>(null);
  const [items, setItems] = useState<ItemForm[]>([]);
  const [monthCursor, setMonthCursor] = useState(() => startOfToday());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalItems, setModalItems] = useState<ItemForm[]>([]);
  const [isModalEditing, setIsModalEditing] = useState(false);
  const [globalAiOpen, setGlobalAiOpen] = useState(false);
  const [globalPrompt, setGlobalPrompt] = useState(
    "从今天开始安排一周训练计划，兼顾力量和恢复",
  );
  const [dateAiPrompt, setDateAiPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(startOfToday(), index)),
    [],
  );
  const weekKeys = useMemo(() => weekDates.map(toDateKey), [weekDates]);

  function syncDetail(detail: TrainingPlanDetail | null) {
    setActivePlan(detail);
    setItems(detail ? detail.items.map(toFormItem) : []);
  }

  function itemDateKey(item: ItemForm) {
    if (item.scheduled_date) {
      return item.scheduled_date;
    }
    const matchingWeekDate = weekDates.find(
      (date) => mondayWeekday(date) === Number(item.day_of_week),
    );
    return matchingWeekDate ? toDateKey(matchingWeekDate) : null;
  }

  function itemsForDate(dateKey: string) {
    return items.filter((item) => itemDateKey(item) === dateKey);
  }

  async function loadPlan(selectedPlanId?: number) {
    setIsLoading(true);
    try {
      const nextPlans = await fetchTrainingPlans();
      if (selectedPlanId) {
        syncDetail(await fetchTrainingPlan(selectedPlanId));
      } else if (nextPlans.length > 0) {
        const details = await Promise.all(
          nextPlans.map((plan) => fetchTrainingPlan(plan.id)),
        );
        syncDetail(
          details.find((detail) => detail.items.length > 0) ?? details[0],
        );
      } else {
        syncDetail(null);
      }
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "课表读取失败");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPlan();
  }, []);

  async function ensurePlan() {
    if (activePlan) {
      return activePlan;
    }
    const detail = await createTrainingPlan({
      title: "我的训练课表",
      items: [],
      change_summary: "初始化课表",
    });
    syncDetail(detail);
    await loadPlan(detail.id);
    return detail;
  }

  function openDateModal(dateKey: string) {
    const dateItems = itemsForDate(dateKey);
    setSelectedDate(dateKey);
    setModalItems(dateItems.length > 0 ? dateItems : [createDefaultItem(dateKey)]);
    setIsModalEditing(false);
    setDateAiPrompt("");
    setError(null);
    setStatus(null);
  }

  function closeDateModal() {
    setSelectedDate(null);
    setModalItems([]);
    setIsModalEditing(false);
    setDateAiPrompt("");
  }

  function updateModalItem(index: number, patch: Partial<ItemForm>) {
    setModalItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function removeModalItem(index: number) {
    setModalItems((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  async function saveSelectedDate() {
    if (!selectedDate || selectedDate < todayKey) {
      return;
    }
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      const plan = await ensurePlan();
      const retainedItems = items.filter((item) => itemDateKey(item) !== selectedDate);
      const normalizedModalItems = modalItems
        .filter((item) => item.title.trim())
        .map((item) => ({
          ...item,
          scheduled_date: selectedDate,
          day_of_week: String(mondayWeekday(fromDateKey(selectedDate))),
        }));
      const detail = await replaceTrainingPlanItems(plan.id, {
        items: [...retainedItems, ...normalizedModalItems].map(toPayload),
        change_summary: `${formatDateTitle(selectedDate)} 调整`,
      });
      syncDetail(detail);
      setModalItems(normalizedModalItems);
      setIsModalEditing(false);
      setStatus("日期计划已保存");
      await loadPlan(detail.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "日期计划保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDateAiAdjust() {
    if (!selectedDate || !dateAiPrompt.trim() || selectedDate < todayKey) {
      return;
    }
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      const plan = await ensurePlan();
      const response = await adjustAiTrainingPlan(
        plan.id,
        dateAiPrompt.trim(),
        selectedDate,
      );
      syncDetail(response.plan);
      setModalItems(
        response.plan.items.map(toFormItem).filter((item) => itemDateKey(item) === selectedDate),
      );
      setDateAiPrompt("");
      setStatus("AI 已调整日期计划");
      await loadPlan(response.plan.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 调整失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGlobalAi() {
    if (!globalPrompt.trim()) {
      return;
    }
    setIsSaving(true);
    setError(null);
    setStatus(null);
    try {
      if (activePlan) {
        const message = [
          `今天是 ${todayKey}，不要修改今天之前的计划。`,
          "如果用户没有指定跨度，默认从今天向后生成总共 7 天计划。",
          `用户描述：${globalPrompt.trim()}`,
        ].join("\n");
        const response = await adjustAiTrainingPlan(activePlan.id, message);
        syncDetail(response.plan);
        await loadPlan(response.plan.id);
      } else {
        const response = await generateAiTrainingPlan(
          [
            `今天是 ${todayKey}。`,
            "如果用户没有指定跨度，默认从今天向后生成总共 7 天计划。",
            `用户描述：${globalPrompt.trim()}`,
          ].join("\n"),
          "我的训练课表",
        );
        syncDetail(response.plan);
        await loadPlan(response.plan.id);
      }
      setGlobalAiOpen(false);
      setStatus("AI 已更新训练计划");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 更新失败");
    } finally {
      setIsSaving(false);
    }
  }

  const planDates = useMemo(
    () => new Set(items.map(itemDateKey).filter((value): value is string => Boolean(value))),
    [items],
  );
  const calendarCells = useMemo(() => monthCells(monthCursor), [monthCursor]);

  const selectedIsPast = selectedDate ? selectedDate < todayKey : false;
  const selectedDisplayItems = selectedDate ? itemsForDate(selectedDate) : [];

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">课表</h2>
          <p className="mt-1 text-sm text-slate-600">从今天开始的 7 天训练计划。</p>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-gym-teal px-4 py-2 text-sm font-semibold text-gym-teal transition hover:bg-gym-mint disabled:opacity-60"
          disabled={isSaving}
          onClick={() => setGlobalAiOpen((current) => !current)}
          type="button"
        >
          <MessageSquare aria-hidden="true" size={17} />
          AI 对话
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {status ? <p className="text-sm text-gym-teal">{status}</p> : null}

      {globalAiOpen ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
          <label className="block text-sm font-medium text-slate-700">
            训练思路
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              maxLength={4000}
              value={globalPrompt}
              onChange={(event) => setGlobalPrompt(event.target.value)}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
              disabled={isSaving || !globalPrompt.trim()}
              onClick={() => void handleGlobalAi()}
              type="button"
            >
              <Bot aria-hidden="true" size={17} />
              发送
            </button>
            <button
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-gym-teal hover:text-gym-teal"
              onClick={() => setGlobalAiOpen(false)}
              type="button"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-7">
        {weekKeys.map((dateKey, index) => {
          const dateItems = itemsForDate(dateKey);
          return (
            <button
              key={dateKey}
              className={[
                "min-h-40 rounded-lg border bg-white p-4 text-left shadow-soft transition hover:border-gym-teal",
                dateItems.length > 0 ? "border-slate-200" : "border-dashed border-slate-300",
              ].join(" ")}
              onClick={() => openDateModal(dateKey)}
              type="button"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {index === 0 ? "今天" : `周${weekdays[mondayWeekday(fromDateKey(dateKey)) - 1]}`}
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">
                    {fromDateKey(dateKey).getMonth() + 1}/{fromDateKey(dateKey).getDate()}
                  </h3>
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  {dateItems.length > 0 ? `${dateItems.length} 项` : "休息"}
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {dateItems.slice(0, 3).map((item, itemIndex) => (
                  <div key={`${item.title}-${itemIndex}`} className="rounded-md bg-slate-50 p-2">
                    <p className="line-clamp-2 text-sm font-semibold text-slate-950">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {metaText(item).join(" · ") || "训练"}
                    </p>
                  </div>
                ))}
                {dateItems.length === 0 ? (
                  <div className="flex min-h-16 items-center justify-center rounded-md bg-slate-50 text-sm text-slate-500">
                    休息
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <button
            aria-label="上个月"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
            onClick={() =>
              setMonthCursor(
                new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1),
              )
            }
            title="上个月"
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <div className="flex items-center gap-2">
            <CalendarDays aria-hidden="true" className="text-gym-teal" size={20} />
            <h3 className="text-lg font-semibold text-slate-950">
              {formatMonth(monthCursor)}
            </h3>
          </div>
          <button
            aria-label="下个月"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
            onClick={() =>
              setMonthCursor(
                new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1),
              )
            }
            title="下个月"
            type="button"
          >
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
          {weekdays.map((weekday) => (
            <div key={weekday} className="py-1">
              {weekday}
            </div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {calendarCells.map((date, index) => {
            const dateKey = date ? toDateKey(date) : "";
            const hasPlan = date ? planDates.has(dateKey) : false;
            const isPast = date ? dateKey < todayKey : false;
            return date ? (
              <button
                key={dateKey}
                className={[
                  "relative aspect-square rounded-md border text-sm font-medium transition",
                  dateKey === todayKey ? "border-gym-teal text-gym-teal" : "border-slate-200 text-slate-700",
                  isPast ? "opacity-60" : "hover:border-gym-teal",
                  hasPlan ? "bg-slate-200" : "bg-white",
                ].join(" ")}
                onClick={() => openDateModal(dateKey)}
                type="button"
              >
                {date.getDate()}
                {hasPlan ? (
                  <span className="absolute inset-x-2 bottom-1 h-1 rounded-full bg-gym-teal" />
                ) : null}
              </button>
            ) : (
              <div key={`empty-${index}`} className="aspect-square" />
            );
          })}
        </div>
      </div>

      {selectedDate ? (
        <div className="fixed inset-0 z-30 flex items-end bg-slate-950/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-lg bg-white p-5 shadow-soft sm:mx-auto sm:max-w-3xl sm:rounded-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-semibold text-slate-950">
                  {formatDateTitle(selectedDate)}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedDisplayItems.length > 0 ? `${selectedDisplayItems.length} 项` : "休息"}
                </p>
              </div>
              <button
                aria-label="关闭"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
                onClick={closeDateModal}
                title="关闭"
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>

            {!isModalEditing ? (
              <div className="mt-5 space-y-3">
                {selectedDisplayItems.map((item, index) => (
                  <article key={`${item.title}-${index}`} className="rounded-lg border border-slate-200 p-4">
                    <h4 className="text-base font-semibold text-slate-950">
                      {item.title}
                    </h4>
                    <p className="mt-2 text-sm text-slate-600">
                      {metaText(item).join(" · ") || "训练"}
                    </p>
                    {item.notes ? (
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {item.notes}
                      </p>
                    ) : null}
                  </article>
                ))}
                {selectedDisplayItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">
                    休息
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {modalItems.map((item, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[5rem_5rem_7rem_2.5rem]"
                  >
                    <label className="block text-sm font-medium text-slate-700 sm:col-span-4">
                      内容
                      <textarea
                        className="mt-1 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                        required
                        value={item.title}
                        onChange={(event) =>
                          updateModalItem(index, { title: event.target.value })
                        }
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      组
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                        min="1"
                        type="number"
                        value={item.sets}
                        onChange={(event) =>
                          updateModalItem(index, { sets: event.target.value })
                        }
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      次
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                        min="1"
                        type="number"
                        value={item.reps}
                        onChange={(event) =>
                          updateModalItem(index, { reps: event.target.value })
                        }
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      分钟
                      <input
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                        min="1"
                        type="number"
                        value={item.duration_minutes}
                        onChange={(event) =>
                          updateModalItem(index, { duration_minutes: event.target.value })
                        }
                      />
                    </label>
                    <button
                      aria-label="删除"
                      className="mt-6 inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-red-600"
                      onClick={() => removeModalItem(index)}
                      title="删除"
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={17} />
                    </button>
                    <label className="block text-sm font-medium text-slate-700 sm:col-span-4">
                      备注
                      <textarea
                        className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                        value={item.notes}
                        onChange={(event) =>
                          updateModalItem(index, { notes: event.target.value })
                        }
                      />
                    </label>
                  </div>
                ))}
                {modalItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">
                    当天无训练项目
                  </div>
                ) : null}
              </div>
            )}

            {isModalEditing ? (
              <div className="mt-5 rounded-lg border border-slate-200 p-4">
                <label className="block text-sm font-medium text-slate-700">
                  AI 对话
                  <textarea
                    className="mt-1 min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    disabled={selectedIsPast}
                    value={dateAiPrompt}
                    onChange={(event) => setDateAiPrompt(event.target.value)}
                  />
                </label>
                <button
                  className="mt-3 inline-flex items-center gap-2 rounded-md border border-gym-teal px-4 py-2 text-sm font-semibold text-gym-teal transition hover:bg-gym-mint disabled:opacity-60"
                  disabled={isSaving || selectedIsPast || !dateAiPrompt.trim()}
                  onClick={() => void handleDateAiAdjust()}
                  type="button"
                >
                  <Bot aria-hidden="true" size={17} />
                  AI 修改
                </button>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {isModalEditing ? (
                <>
                  <button
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-gym-teal hover:text-gym-teal"
                    disabled={selectedIsPast}
                    onClick={() =>
                      setModalItems((current) => [
                        ...current,
                        createDefaultItem(selectedDate),
                      ])
                    }
                    type="button"
                  >
                    <Plus aria-hidden="true" size={17} />
                    添加项目
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                    disabled={isSaving || selectedIsPast}
                    onClick={() => void saveSelectedDate()}
                    type="button"
                  >
                    <Save aria-hidden="true" size={17} />
                    保存
                  </button>
                  <button
                    className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-gym-teal hover:text-gym-teal"
                    onClick={() => setIsModalEditing(false)}
                    type="button"
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  className="inline-flex items-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                  disabled={selectedIsPast}
                  onClick={() => {
                    setModalItems(
                      selectedDisplayItems.length > 0
                        ? selectedDisplayItems
                        : [createDefaultItem(selectedDate)],
                    );
                    setIsModalEditing(true);
                  }}
                  type="button"
                >
                  <Edit3 aria-hidden="true" size={17} />
                  编辑
                </button>
              )}
            </div>

            {selectedIsPast ? (
              <p className="mt-3 text-sm text-slate-500">过去日期不可修改。</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
