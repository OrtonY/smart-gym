import { ListChecks } from "lucide-react";
import { Link } from "react-router-dom";

export default function WorkoutReviewPage() {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">训练复盘</h2>
        <p className="mt-1 text-sm text-slate-600">
          完成数据、动作结果和课表回写状态会在下一步展示。
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5">
        <ListChecks aria-hidden="true" className="text-gym-teal" size={22} />
        <p className="mt-3 text-sm text-slate-600">训练复盘骨架已就绪。</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="inline-flex items-center justify-center rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
            to="/app/plans"
          >
            查看课表
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            to="/app/train"
          >
            返回训练
          </Link>
        </div>
      </div>
    </section>
  );
}
