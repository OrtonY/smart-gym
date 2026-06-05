import { FormEvent, useEffect, useState } from "react";

import { UserProfile, fetchProfile, updateProfile } from "../../api/client";

const emptyProfile: UserProfile = {
  height_cm: null,
  weight_kg: null,
  fitness_goal: "",
  training_frequency: "",
  dietary_preferences: "",
};

function toNumberOrNull(value: string) {
  return value.trim() === "" ? null : Number(value);
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    fetchProfile()
      .then((data) => {
        if (isMounted) {
          setProfile({ ...emptyProfile, ...data });
        }
      })
      .catch((caught) => {
        if (isMounted) {
          setError(caught instanceof Error ? caught.message : "资料读取失败");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    try {
      const saved = await updateProfile({
        height_cm: toNumberOrNull(String(profile.height_cm ?? "")),
        weight_kg: toNumberOrNull(String(profile.weight_kg ?? "")),
        fitness_goal: profile.fitness_goal || null,
        training_frequency: profile.training_frequency || null,
        dietary_preferences: profile.dietary_preferences || null,
      });
      setProfile({ ...emptyProfile, ...saved });
      setStatus("资料已保存");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "资料保存失败");
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-slate-950">我的资料</h2>
        <p className="mt-1 text-sm text-slate-600">
          身体数据和目标会用于后续 AI 训练建议。
        </p>
      </div>
      <form
        className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-soft sm:grid-cols-2"
        onSubmit={handleSubmit}
      >
        <label className="text-sm font-medium text-slate-700">
          身高 cm
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            disabled={isLoading}
            inputMode="decimal"
            value={profile.height_cm ?? ""}
            onChange={(event) =>
              setProfile((current) => ({
                ...current,
                height_cm: event.target.value === "" ? null : Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          体重 kg
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            disabled={isLoading}
            inputMode="decimal"
            value={profile.weight_kg ?? ""}
            onChange={(event) =>
              setProfile((current) => ({
                ...current,
                weight_kg: event.target.value === "" ? null : Number(event.target.value),
              }))
            }
          />
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">
          健身目标
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            disabled={isLoading}
            value={profile.fitness_goal ?? ""}
            onChange={(event) =>
              setProfile((current) => ({
                ...current,
                fitness_goal: event.target.value,
              }))
            }
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          训练频率
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            disabled={isLoading}
            value={profile.training_frequency ?? ""}
            onChange={(event) =>
              setProfile((current) => ({
                ...current,
                training_frequency: event.target.value,
              }))
            }
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          饮食偏好
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
            disabled={isLoading}
            value={profile.dietary_preferences ?? ""}
            onChange={(event) =>
              setProfile((current) => ({
                ...current,
                dietary_preferences: event.target.value,
              }))
            }
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            className="rounded-md bg-gym-teal px-4 py-2 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            type="submit"
          >
            保存资料
          </button>
          {status ? <span className="text-sm text-gym-teal">{status}</span> : null}
          {error ? <span className="text-sm text-red-600">{error}</span> : null}
        </div>
      </form>
    </section>
  );
}
