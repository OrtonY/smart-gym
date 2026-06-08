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
  const [config, setConfig] = useState<AiProviderConfig | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);

  function applyConfig(activeConfig: AiProviderConfig | null) {
    setConfig(activeConfig);
    setForm(
      activeConfig
        ? {
            provider_type: activeConfig.provider_type,
            base_url: activeConfig.base_url ?? "",
            model_name: activeConfig.model_name,
            api_key: "",
            is_active: activeConfig.is_active,
          }
        : emptyForm,
    );
  }

  async function refreshConfig() {
    const [activeConfig = null] = await fetchAiProviderConfigs();
    applyConfig(activeConfig);
  }

  async function loadConfigs() {
    setIsLoading(true);
    setError(null);
    try {
      await refreshConfig();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 配置读取失败");
      throw caught;
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadConfigs().catch(() => undefined);
  }, []);

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
      setIsMutating(true);
      if (config) {
        await updateAiProviderConfig(config.id, payload);
        await refreshConfig();
        setStatus("配置已保存");
      } else {
        if (!form.api_key) {
          setError("新配置需要 API Key");
          return;
        }
        await createAiProviderConfig({ ...payload, api_key: form.api_key });
        await refreshConfig();
        setStatus("配置已创建");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 配置保存失败");
    } finally {
      setIsMutating(false);
    }
  }

  async function handleDelete(configId: number) {
    setError(null);
    setStatus(null);
    try {
      setIsMutating(true);
      await deleteAiProviderConfig(configId);
      applyConfig(null);
      await refreshConfig();
      setStatus("配置已删除");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI 配置删除失败");
    } finally {
      setIsMutating(false);
    }
  }

  const isBusy = isLoading || isMutating;

  return (
    <section className="max-w-2xl space-y-5">
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">AI 配置</h2>
          <p className="mt-1 text-sm text-slate-600">
            每个账号独立保存自己的模型和密钥配置。
          </p>
        </div>
      </div>

      <form
        className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft"
        onSubmit={handleSubmit}
      >
        <div className="flex items-center gap-2">
          <KeyRound aria-hidden="true" className="text-gym-teal" size={20} />
          <h3 className="text-lg font-semibold text-slate-950">模型连接</h3>
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
              placeholder="留空则保留原密钥"
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
            className="rounded-md bg-gym-teal px-4 py-2 font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
            disabled={isBusy}
            type="submit"
          >
            {config ? "保存" : "创建"}
          </button>
          {config ? (
            <button
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 font-semibold text-slate-700 transition hover:border-red-300 hover:text-red-600 disabled:opacity-60"
              disabled={isBusy}
              onClick={() => void handleDelete(config.id)}
              type="button"
            >
              <Trash2 aria-hidden="true" size={16} />
              删除配置
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
