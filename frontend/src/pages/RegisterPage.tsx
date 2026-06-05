import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register(email, password, displayName);
      navigate("/app", { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "注册失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-xs font-semibold uppercase tracking-wide text-gym-teal">
          Smart Gym
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">注册</h1>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-700">
            昵称
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            邮箱
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            密码
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              minLength={6}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            className="w-full rounded-md bg-gym-teal px-4 py-2 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "创建中" : "创建账号"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-600">
          已有账号？{" "}
          <Link className="font-medium text-gym-teal" to="/login">
            登录
          </Link>
        </p>
      </section>
    </main>
  );
}
