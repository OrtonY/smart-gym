import { Timer } from "lucide-react";
import { Link } from "react-router-dom";

export default function GuidedWorkoutPage() {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">训练进行中</h2>
        <p className="mt-1 text-sm text-slate-600">
          分步骤引导、计时和姿态检测会在下一步接入。
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5">
        <Timer aria-hidden="true" className="text-gym-teal" size={22} />
        <p className="mt-3 text-sm text-slate-600">训练播放器骨架已就绪。</p>
        <Link
          className="mt-4 inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          to="/app/train"
        >
          返回训练
        </Link>
      </div>
    </section>
  );
}
