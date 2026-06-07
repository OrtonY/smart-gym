import { Layers3 } from "lucide-react";

export default function AdminWorkoutTemplatesPage() {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">训练模板</h2>
        <p className="mt-1 text-sm text-slate-600">
          模板维护、发布和动作步骤编辑会在后续任务接入。
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5">
        <Layers3 aria-hidden="true" className="text-gym-coral" size={22} />
        <p className="mt-3 text-sm text-slate-600">管理端模板页骨架已就绪。</p>
      </div>
    </section>
  );
}
