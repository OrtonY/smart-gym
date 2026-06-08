import {
  FormEvent,
  ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Bot, Plus, Send, X } from "lucide-react";

import {
  AiConversationDetail,
  AiConversationSummary,
  fetchAiConversation,
  fetchAiConversations,
} from "../api/client";

type ConversationMode = "history" | "new";

type Props = {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  topic: string;
  trainingPlanId?: number | null;
  nutritionPlanId?: number | null;
  defaultPrompt?: string;
  extraFields?: ReactNode;
  canSendEmptyMessage?: boolean;
  sendLabel?: string;
  loadingLabel?: string;
  onClose: () => void;
  onSend: (payload: {
    message: string;
    conversationId: number | null;
    mode: ConversationMode;
  }) => Promise<number | null | void>;
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function readableContent(content: string) {
  try {
    const parsed = JSON.parse(content) as
      | { title?: unknown; items?: unknown; food_name?: unknown }
      | unknown[];

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (typeof parsed.title === "string" && parsed.title.trim()) {
        return parsed.title;
      }
      if (Array.isArray(parsed.items)) {
        return `${parsed.items.length} 项`;
      }
      if (typeof parsed.food_name === "string" && parsed.food_name.trim()) {
        return parsed.food_name;
      }
    }
  } catch {
    return content;
  }

  return content;
}

export function AiConversationModal({
  isOpen,
  title,
  subtitle,
  topic,
  trainingPlanId = null,
  nutritionPlanId = null,
  defaultPrompt = "",
  extraFields,
  canSendEmptyMessage = false,
  sendLabel = "发送",
  loadingLabel = "处理中",
  onClose,
  onSend,
}: Props) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wasOpenRef = useRef(false);
  const sessionIdRef = useRef(0);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<ConversationMode>("new");
  const [message, setMessage] = useState(defaultPrompt);
  const [conversations, setConversations] = useState<AiConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [activeConversation, setActiveConversation] = useState<AiConversationDetail | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      lastFocusedElementRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setMessage(defaultPrompt);
    }

    if (!isOpen && wasOpenRef.current) {
      sessionIdRef.current += 1;
      setError(null);
      setIsLoadingConversation(false);
      setIsSubmitting(false);
      lastFocusedElementRef.current?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [defaultPrompt, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    sessionIdRef.current += 1;
    setIsSubmitting(false);
    setError(null);
  }, [isOpen, nutritionPlanId, topic, trainingPlanId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isCancelled = false;

    async function loadConversations() {
      setIsLoadingList(true);
      setError(null);

      try {
        const list = await fetchAiConversations({
          topic,
          trainingPlanId,
          nutritionPlanId,
        });
        if (isCancelled) {
          return;
        }
        setConversations(list);
        if (list.length > 0) {
          setMode("history");
          setActiveConversationId(list[0].id);
        } else {
          setMode("new");
          setActiveConversationId(null);
          setActiveConversation(null);
        }
      } catch (loadError) {
        if (isCancelled) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "加载对话失败");
        setConversations([]);
        setMode("new");
        setActiveConversationId(null);
        setActiveConversation(null);
      } finally {
        if (!isCancelled) {
          setIsLoadingList(false);
        }
      }
    }

    void loadConversations();

    return () => {
      isCancelled = true;
    };
  }, [isOpen, nutritionPlanId, topic, trainingPlanId]);

  useEffect(() => {
    if (!isOpen || mode !== "history" || !activeConversationId) {
      setActiveConversation(null);
      setIsLoadingConversation(false);
      return;
    }

    const conversationId = activeConversationId;
    let isCancelled = false;

    async function loadConversation() {
      setIsLoadingConversation(true);
      setError(null);

      try {
        const detail = await fetchAiConversation(conversationId);
        if (!isCancelled) {
          setActiveConversation(detail);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(loadError instanceof Error ? loadError.message : "加载对话失败");
          setActiveConversation(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingConversation(false);
        }
      }
    }

    void loadConversation();

    return () => {
      isCancelled = true;
    };
  }, [activeConversationId, isOpen, mode]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (textareaRef.current && !textareaRef.current.disabled) {
        textareaRef.current.focus();
        return;
      }
      closeButtonRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isOpen, mode]);

  async function refreshConversations(nextConversationId?: number | null) {
    const list = await fetchAiConversations({
      topic,
      trainingPlanId,
      nutritionPlanId,
    });
    setConversations(list);

    if (list.length === 0) {
      setMode("new");
      setActiveConversationId(null);
      setActiveConversation(null);
      return;
    }

    const matchedConversation = nextConversationId
      ? list.find((conversation) => conversation.id === nextConversationId) ?? null
      : null;
    const fallbackConversation = matchedConversation ?? list[0];

    setMode("history");
    setActiveConversationId(fallbackConversation.id);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage && !canSendEmptyMessage) {
      return;
    }

    const submitSessionId = sessionIdRef.current;
    const submitMode = mode;
    const submitConversationId = mode === "history" ? activeConversationId : null;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await onSend({
        message: trimmedMessage,
        conversationId: submitConversationId,
        mode: submitMode,
      });
      if (sessionIdRef.current !== submitSessionId) {
        return;
      }
      const nextConversationId =
        typeof result === "number"
          ? result
          : submitMode === "history"
            ? submitConversationId
            : null;
      await refreshConversations(nextConversationId);
      if (sessionIdRef.current !== submitSessionId) {
        return;
      }
      setMessage("");
    } catch (submitError) {
      if (sessionIdRef.current !== submitSessionId) {
        return;
      }
      setError(submitError instanceof Error ? submitError.message : "发送失败");
    } finally {
      if (sessionIdRef.current === submitSessionId) {
        setIsSubmitting(false);
      }
    }
  }

  if (!isOpen) {
    return null;
  }

  const isBusy = isLoadingList || isLoadingConversation || isSubmitting;

  return (
    <div
      className="fixed inset-0 z-30 flex items-end bg-slate-950/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-lg bg-white p-5 shadow-soft sm:mx-auto sm:max-w-5xl sm:rounded-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-slate-950" id={titleId}>
              {title}
            </h3>
            {subtitle ? (
              <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            ) : null}
          </div>
          <button
            aria-label="关闭"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100"
            ref={closeButtonRef}
            title="关闭"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-1">
          <button
            className={[
              "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
              mode === "history"
                ? "bg-gym-teal text-white"
                : "text-slate-600 hover:bg-slate-100",
            ].join(" ")}
            disabled={conversations.length === 0}
            type="button"
            onClick={() => {
              if (conversations.length === 0) {
                return;
              }
              setMode("history");
              setActiveConversationId((current) => current ?? conversations[0].id);
            }}
          >
            <Bot aria-hidden="true" size={17} />
            历史续聊
          </button>
          <button
            className={[
              "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
              mode === "new"
                ? "bg-gym-teal text-white"
                : "text-slate-600 hover:bg-slate-100",
            ].join(" ")}
            type="button"
            onClick={() => setMode("new")}
          >
            <Plus aria-hidden="true" size={17} />
            新建对话
          </button>
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-slate-950">对话历史</h4>
              {isLoadingList ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-gym-teal" />
                  {loadingLabel}
                </div>
              ) : null}
            </div>

            {conversations.length > 0 ? (
              <div className="space-y-2">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    className={[
                      "w-full rounded-lg border p-3 text-left transition",
                      mode === "history" && activeConversationId === conversation.id
                        ? "border-gym-teal bg-gym-mint"
                        : "border-slate-200 hover:border-gym-teal",
                    ].join(" ")}
                    type="button"
                    onClick={() => {
                      setMode("history");
                      setActiveConversationId(conversation.id);
                    }}
                  >
                    <p className="text-sm font-semibold text-slate-950">
                      {conversation.title}
                    </p>
                    {conversation.last_message_preview ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                        {readableContent(conversation.last_message_preview)}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-slate-500">
                      {formatTimestamp(conversation.updated_at)}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">
                暂无历史对话
              </div>
            )}
          </div>

          <div>
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-950">
                  {mode === "history" ? "对话内容" : "新对话"}
                </h4>
                {isLoadingConversation || isSubmitting ? (
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-gym-teal" />
                    {loadingLabel}
                  </div>
                ) : null}
              </div>

              {mode === "history" ? (
                <div className="mt-4 space-y-3">
                  {activeConversation?.messages.length ? (
                    activeConversation.messages.map((item) => {
                      const isAssistant = item.role === "assistant";
                      return (
                        <div
                          key={item.id}
                          className={[
                            "flex",
                            isAssistant ? "justify-start" : "justify-end",
                          ].join(" ")}
                        >
                          <div
                            className={[
                              "max-w-[85%] rounded-lg px-4 py-3 text-sm leading-6",
                              isAssistant
                                ? "bg-slate-100 text-slate-700"
                                : "bg-gym-teal text-white",
                            ].join(" ")}
                          >
                            <p>{readableContent(item.content)}</p>
                            <p
                              className={[
                                "mt-2 text-[11px]",
                                isAssistant ? "text-slate-500" : "text-white/80",
                              ].join(" ")}
                            >
                              {formatTimestamp(item.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  ) : isLoadingConversation ? (
                    <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">
                      {loadingLabel}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">
                      暂无消息
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">
                  创建新的 AI 对话并发送首条消息。
                </div>
              )}

              <form className="mt-5" onSubmit={handleSubmit}>
                {extraFields ? <div className="mb-4">{extraFields}</div> : null}
                <label className="block text-sm font-medium text-slate-700">
                  输入内容
                  <textarea
                    className="mt-1 min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-gym-teal focus:ring-2 focus:ring-gym-mint"
                    disabled={isSubmitting}
                    ref={textareaRef}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </label>
                <button
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-gym-teal px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-60"
                  disabled={isBusy || (!canSendEmptyMessage && !message.trim())}
                  type="submit"
                >
                  <Send aria-hidden="true" size={17} />
                  {isSubmitting ? loadingLabel : sendLabel}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AiConversationModal;
