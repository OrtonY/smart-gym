import {
  Activity,
  Bot,
  BookOpen,
  CalendarDays,
  Dumbbell,
  Home,
  LogOut,
  Moon,
  Settings,
  Shield,
  Sun,
  Trophy,
  Utensils,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

type LayoutProps = {
  mode: "user" | "admin";
};

const userNavItems = [
  { to: "/app", label: "首页", icon: Home },
  { to: "/app/train", label: "训练", icon: Dumbbell },
  { to: "/app/plans", label: "课表", icon: CalendarDays },
  { to: "/app/nutrition", label: "饮食", icon: Utensils },
  { to: "/app/leaderboard", label: "榜单", icon: Trophy },
  { to: "/app/ai-settings", label: "AI", icon: Bot },
  { to: "/app/profile", label: "我的", icon: Settings },
];

const adminNavItems = [
  { to: "/admin", label: "总览", icon: Shield },
  { to: "/admin/workout-modes", label: "模式", icon: Activity },
  { to: "/admin/exercises", label: "动作", icon: BookOpen },
];

function navClass({ isActive }: { isActive: boolean }) {
  return [
    "flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition",
    isActive ? "bg-gym-teal text-white" : "text-slate-600 hover:bg-slate-100",
  ].join(" ");
}

function bottomNavClass({ isActive }: { isActive: boolean }) {
  return [
    "flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-1.5 text-[11px] font-medium leading-none transition",
    isActive ? "bg-gym-teal text-white" : "text-slate-600 hover:bg-slate-100",
  ].join(" ");
}

export default function Layout({ mode }: LayoutProps) {
  const isAdmin = mode === "admin";
  const items = isAdmin ? adminNavItems : userNavItems;
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const canSwitchWorkspace = currentUser?.role === "admin";
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme ?? "dark",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("smart-gym-theme", theme);
  }, [theme]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

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
          <div className="flex items-center gap-2">
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
            {canSwitchWorkspace ? (
              <Link
                aria-label={isAdmin ? "切换到应用" : "切换到管理"}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                title={isAdmin ? "切换到应用" : "切换到管理"}
                to={isAdmin ? "/app" : "/admin"}
              >
                {isAdmin ? (
                  <Home aria-hidden="true" size={18} />
                ) : (
                  <Shield aria-hidden="true" size={18} />
                )}
              </Link>
            ) : null}
            <button
              aria-label={theme === "dark" ? "切换浅色主题" : "切换深色主题"}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
              title={theme === "dark" ? "切换浅色主题" : "切换深色主题"}
              type="button"
            >
              {theme === "dark" ? (
                <Sun aria-hidden="true" size={18} />
              ) : (
                <Moon aria-hidden="true" size={18} />
              )}
            </button>
            <button
              aria-label="退出登录"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              onClick={handleLogout}
              title="退出登录"
              type="button"
            >
              <LogOut aria-hidden="true" size={18} />
            </button>
          </div>
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
            isAdmin ? "grid-cols-3" : "grid-cols-7",
          ].join(" ")}
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end className={bottomNavClass}>
                <Icon aria-hidden="true" size={18} />
                <span className="max-w-full truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
