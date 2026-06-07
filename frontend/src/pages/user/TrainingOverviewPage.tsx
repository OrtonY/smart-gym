import { Dumbbell } from "lucide-react";
import { Link } from "react-router-dom";

export default function TrainingOverviewPage() {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">训练确认</h2>
        <p className="mt-1 text-sm text-slate-600">
          确认训练动作、姿态检测授权和开始入口。
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5">
        <Dumbbell aria-hidden="true" className="text-gym-teal" size={22} />
        <p className="mt-3 text-sm text-slate-600">
          训练总览将在下一步接入今日训练和模板详情。
        </p>
        <Link
          className="mt-4 inline-flex items-center justify-center rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800"
          to="/app/train"
        >
          返回训练
        </Link>
      </div>
    </section>
  );
}
