import { BookOpen, Dumbbell, ListChecks, RadioTower } from "lucide-react";
import { Link } from "react-router-dom";

export default function AdminHomePage() {
  const items = [
    { title: "运动模式", description: "配置训练类型、热量估算和启用状态", href: "/admin/workout-modes", icon: RadioTower },
    { title: "动作教程", description: "配置动作库、教程素材和发布状态", href: "/admin/exercises", icon: BookOpen },
    { title: "发布检查", description: "查看用户端可见的模式和动作", href: "/admin/workout-modes", icon: ListChecks },
    { title: "动作规则", description: "维护动作检测规则 JSON", href: "/admin/exercises", icon: Dumbbell },
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
            <Link
              key={item.title}
              to={item.href}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
            >
              <Icon aria-hidden="true" className="text-gym-coral" size={22} />
              <h3 className="mt-3 text-base font-semibold text-slate-950">
                {item.title}
              </h3>
              <p className="mt-1 text-sm text-slate-600">{item.description}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
