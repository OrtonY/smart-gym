import { useEffect, useState } from "react";
import { Medal } from "lucide-react";

import { LeaderboardEntry, fetchLeaderboard } from "../../api/client";

type PeriodType = LeaderboardEntry["period_type"];
type MetricType = LeaderboardEntry["metric_type"];

const periodOptions: { value: PeriodType; label: string }[] = [
  { value: "weekly", label: "本周" },
  { value: "monthly", label: "本月" },
];

const metricOptions: { value: MetricType; label: string; unit: string }[] = [
  { value: "duration_minutes", label: "训练时长", unit: "分钟" },
  { value: "calories_burned", label: "消耗热量", unit: "千卡" },
  { value: "sessions_count", label: "训练次数", unit: "次" },
];

function optionClass(isActive: boolean) {
  return [
    "rounded-md px-3 py-2 text-sm font-medium transition",
    isActive ? "bg-gym-teal text-white" : "border border-slate-300 text-slate-700",
  ].join(" ");
}

export default function LeaderboardPage() {
  const [periodType, setPeriodType] = useState<PeriodType>("weekly");
  const [metricType, setMetricType] = useState<MetricType>("duration_minutes");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    fetchLeaderboard(periodType, metricType)
      .then((nextEntries) => {
        if (isMounted) {
          setEntries(nextEntries);
        }
      })
      .catch((caught) => {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "榜单读取失败");
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
  }, [periodType, metricType]);

  const metric = metricOptions.find((option) => option.value === metricType);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">榜单</h2>
        <p className="mt-1 text-sm text-slate-600">
          按周期和指标查看训练排名。
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">周期</p>
            <div className="flex flex-wrap gap-2">
              {periodOptions.map((option) => (
                <button
                  key={option.value}
                  className={optionClass(periodType === option.value)}
                  onClick={() => setPeriodType(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">指标</p>
            <div className="flex flex-wrap gap-2">
              {metricOptions.map((option) => (
                <button
                  key={option.value}
                  className={optionClass(metricType === option.value)}
                  onClick={() => setMetricType(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="space-y-3">
        {entries.map((entry) => (
          <article
            key={`${entry.period_type}-${entry.metric_type}-${entry.rank}-${entry.display_name}`}
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-gym-mint text-gym-teal">
                <Medal aria-hidden="true" size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-950">
                  {entry.display_name}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  第 {entry.rank} 名 · {metric?.label}
                </p>
              </div>
              <p className="text-right text-lg font-semibold text-slate-950">
                {entry.value}
                <span className="ml-1 text-sm font-medium text-slate-500">
                  {metric?.unit}
                </span>
              </p>
            </div>
          </article>
        ))}
        {!isLoading && entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            暂无榜单数据。
          </div>
        ) : null}
      </div>
    </section>
  );
}
