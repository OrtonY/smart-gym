import { FormEvent, useEffect, useState } from "react";
import { KeyRound, Trash2 } from "lucide-react";

import {
  AiProviderConfig,
  createAiProviderConfig,
  deleteAiProviderConfig,
  fetchAiProviderConfigs,
  updateAiProviderConfig,
} from "../../api/client";

type FormState = {
  provider_type: string;
  base_url: string;
  model_name: string;
  api_key: string;
  is_active: boolean;
};

const emptyForm: FormState = {
  provider_type: "openai_compatible",
  base_url: "https://api.example.com/v1",
  model_name: "",
  api_key: "",
  is_active: true,
};

export default function AiProviderSettingsPage() {
  const [configs, setConfigs] = useState<AiProviderConfig[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadConfigs() {
    setIsLoading(true);
    try {
      setConfigs(await fetchAiProviderConfigs());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 配置读取失败");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadConfigs();
  }, []);

  function startEdit(config: AiProviderConfig) {
    setEditingId(config.id);
    setForm({
      provider_type: config.provider_type,
      base_url: config.base_url ?? "",
      model_name: config.model_name,
      api_key: "",
      is_active: config.is_active,
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    const payload = {
      provider_type: form.provider_type,
      base_url: form.base_url || null,
      model_name: form.model_name,
      is_active: form.is_active,
      ...(form.api_key ? { api_key: form.api_key } : {}),
    };

    try {
      if (editingId) {
        await updateAiProviderConfig(editingId, payload);
        setStatus("配置已更新");
      } else {
        if (!form.api_key) {
          setError("新配置需要 API Key");
          return;
        }
        await createAiProviderConfig({ ...payload, api_key: form.api_key });
        setStatus("配置已创建");
      }
      resetForm();
      await loadConfigs();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 配置保存失败");
    }
  }

  async function handleDelete(configId: number) {
    setError(null);
    setStatus(null);
    try {
      await deleteAiProviderConfig(configId);
      setStatus("配置已删除");
      await loadConfigs();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 配置删除失败");
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">AI Provider</h2>
          <p className="mt-1 text-sm text-slate-600">
            每个账号独立保存自己的模型和密钥配置。
          </p>
        </div>
        <div className="space-y-3">
          {configs.map((config) => (
            <article
              key={config.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {config.model_name}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {config.provider_type} · {config.base_url ?? "默认地址"}
                  </p>
                  <p className="mt-2 text-xs font-medium text-gym-teal">
                    {config.is_active ? "启用中" : "已停用"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                    onClick={() => startEdit(config)}
                    type="button"
                  >
                    编辑
                  </button>
                  <button
                    aria-label="删除配置"
                    className="rounded-md border border-red-200 px-3 py-2 text-red-600"
                    onClick={() => void handleDelete(config.id)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}
          {!isLoading && configs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
              还没有 AI Provider 配置。
            </div>
          ) : null}
        </div>
      </div>

      <form
        className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center gap-2">
          <KeyRound aria-hidden="true" className="text-gym-teal" size={20} />
          <h3 className="text-lg font-semibold text-slate-950">
            {editingId ? "编辑配置" : "新增配置"}
          </h3>
        </div>
        <div className="mt-4 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Provider 类型
            <select
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              value={form.provider_type}
              onChange={(event) =>
                setForm((current) => ({ ...current, provider_type: event.target.value }))
              }
            >
              <option value="openai">OpenAI</option>
              <option value="openai_compatible">OpenAI-compatible</option>
              <option value="ollama">Ollama</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Base URL
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              value={form.base_url}
              onChange={(event) =>
                setForm((current) => ({ ...current, base_url: event.target.value }))
              }
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            模型名称
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              value={form.model_name}
              onChange={(event) =>
                setForm((current) => ({ ...current, model_name: event.target.value }))
              }
              required
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            API Key
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
              placeholder={editingId ? "留空则保留原密钥" : ""}
              type="password"
              value={form.api_key}
              onChange={(event) =>
                setForm((current) => ({ ...current, api_key: event.target.value }))
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              checked={form.is_active}
              onChange={(event) =>
                setForm((current) => ({ ...current, is_active: event.target.checked }))
              }
              type="checkbox"
            />
            启用配置
          </label>
        </div>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {status ? <p className="mt-4 text-sm text-gym-teal">{status}</p> : null}
        <div className="mt-5 flex gap-2">
          <button
            className="rounded-md bg-gym-teal px-4 py-2 font-semibold text-white transition hover:bg-teal-800"
            type="submit"
          >
            {editingId ? "保存" : "创建"}
          </button>
          {editingId ? (
            <button
              className="rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-700"
              onClick={resetForm}
              type="button"
            >
              取消
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
