import { Camera, Dumbbell, Sparkles, Timer } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../../auth/AuthContext";

export default function HomePage() {
  const { currentUser } = useAuth();
  const cards = [
    { title: "今日计划", label: "查看训练安排", to: "/app/train", icon: Timer },
    { title: "动作检测", label: "打开摄像头检测", to: "/app/pose", icon: Camera },
    { title: "AI 教练", label: "生成训练建议", to: "/app/ai-settings", icon: Sparkles },
    { title: "快速训练", label: "进入运动模式", to: "/app/train?tab=new", icon: Dumbbell },
  ];

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">
          {currentUser?.display_name ?? "今日概览"}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          训练入口、AI 教练和个人设置集中在一个移动端工作台。
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.title}
              to={card.to}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gym-mint text-gym-teal">
                <Icon aria-hidden="true" size={20} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-950">
                {card.title}
              </h3>
              <p className="mt-1 text-sm text-slate-600">{card.label}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
