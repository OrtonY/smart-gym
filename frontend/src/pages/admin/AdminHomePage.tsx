import { BookOpen, Dumbbell, ListChecks, RadioTower } from "lucide-react";

export default function AdminHomePage() {
  const items = [
    { title: "动作库", icon: Dumbbell },
    { title: "课程教程", icon: BookOpen },
    { title: "运动模式", icon: RadioTower },
    { title: "发布检查", icon: ListChecks },
  ];

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">管理总览</h2>
        <p className="mt-1 text-sm text-slate-600">
          内容、课程和动作规则维护入口。
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <article
              key={item.title}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
            >
              <Icon aria-hidden="true" className="text-gym-coral" size={22} />
              <h3 className="mt-3 text-base font-semibold text-slate-950">
                {item.title}
              </h3>
            </article>
          );
        })}
      </div>
    </section>
  );
}
