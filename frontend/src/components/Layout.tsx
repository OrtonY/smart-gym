import { Activity, Bot, Dumbbell, Home, Settings, Shield } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

type LayoutProps = {
  mode: "user" | "admin";
};

const userNavItems = [
  { to: "/app", label: "首页", icon: Home },
  { to: "/app/train", label: "训练", icon: Dumbbell },
  { to: "/app/ai-settings", label: "AI", icon: Bot },
  { to: "/app/profile", label: "我的", icon: Settings },
];

const adminNavItems = [
  { to: "/admin", label: "总览", icon: Shield },
  { to: "/admin/content", label: "内容", icon: Activity },
];

function navClass({ isActive }: { isActive: boolean }) {
  return [
    "flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition",
    isActive ? "bg-gym-teal text-white" : "text-slate-600 hover:bg-slate-100",
  ].join(" ");
}

export default function Layout({ mode }: LayoutProps) {
  const isAdmin = mode === "admin";
  const items = isAdmin ? adminNavItems : userNavItems;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gym-teal">
              Smart Gym
            </p>
            <h1 className="text-lg font-semibold text-slate-950">
              {isAdmin ? "管理工作台" : "训练空间"}
            </h1>
          </div>
          {isAdmin ? (
            <nav className="hidden items-center gap-2 sm:flex" aria-label="管理端导航">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink key={item.to} to={item.to} end className={navClass}>
                    <Icon aria-hidden="true" size={18} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>
          ) : null}
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-72px)] max-w-6xl px-4 pb-24 pt-5 sm:pb-8">
        <Outlet />
      </main>

      <nav
        aria-label={isAdmin ? "管理端底部导航" : "用户端底部导航"}
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-3 py-2 shadow-soft sm:hidden"
      >
        <div
          className={[
            "mx-auto grid max-w-md gap-2",
            isAdmin ? "grid-cols-2" : "grid-cols-4",
          ].join(" ")}
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end className={navClass}>
                <Icon aria-hidden="true" size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
