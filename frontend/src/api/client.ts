const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const TOKEN_STORAGE_KEY = "smart-gym-token";
const UNAUTHORIZED_EVENT = "smart-gym:unauthorized";

export type CurrentUser = {
  id: number;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
};

export type UserProfile = {
  height_cm?: number | null;
  weight_kg?: number | null;
  fitness_goal?: string | null;
  training_frequency?: string | null;
  dietary_preferences?: string | null;
};

export type AiProviderConfig = {
  id: number;
  provider_type: string;
  base_url: string | null;
  model_name: string;
  is_active: boolean;
};

export type AiProviderConfigPayload = {
  provider_type: string;
  base_url?: string | null;
  model_name: string;
  api_key?: string;
  is_active: boolean;
};

type RequestOptions = RequestInit & {
  auth?: boolean;
};

export function getStoredToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function onUnauthorized(handler: () => void) {
  window.addEventListener(UNAUTHORIZED_EVENT, handler);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
}

async function readErrorMessage(response: Response) {
  try {
    const data = (await response.json()) as { detail?: string };
    return data.detail ?? "请求失败";
  } catch {
    return "请求失败";
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const token = getStoredToken();
  if (options.auth !== false && token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearStoredToken();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function loginRequest(email: string, password: string) {
  return apiRequest<{ access_token: string; token_type: string }>("/auth/login", {
    auth: false,
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function registerRequest(email: string, password: string, displayName: string) {
  return apiRequest<CurrentUser>("/auth/register", {
    auth: false,
    method: "POST",
    body: JSON.stringify({ email, password, display_name: displayName }),
  });
}

export function fetchCurrentUser() {
  return apiRequest<CurrentUser>("/auth/me");
}

export function fetchProfile() {
  return apiRequest<UserProfile>("/users/me/profile");
}

export function updateProfile(profile: UserProfile) {
  return apiRequest<UserProfile>("/users/me/profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
}

export function fetchAiProviderConfigs() {
  return apiRequest<AiProviderConfig[]>("/ai-configs");
}

export function createAiProviderConfig(payload: AiProviderConfigPayload) {
  return apiRequest<AiProviderConfig>("/ai-configs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAiProviderConfig(
  configId: number,
  payload: Partial<AiProviderConfigPayload>,
) {
  return apiRequest<AiProviderConfig>(`/ai-configs/${configId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteAiProviderConfig(configId: number) {
  return apiRequest<void>(`/ai-configs/${configId}`, {
    method: "DELETE",
  });
}

export type WorkoutMode = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  estimated_calories_per_hour: number;
  is_active: boolean;
};

export type Exercise = {
  id: number;
  slug: string;
  name: string;
  target_muscle: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  description: string | null;
  tutorial_url: string | null;
  media_url: string | null;
  detection_rules: Record<string, unknown> | null;
  is_published: boolean;
};

export type WorkoutSession = {
  id: number;
  user_id: number;
  workout_mode_id: number | null;
  exercise_id: number | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  calories_burned: number;
  reps: number | null;
  score: number | null;
  status: "completed" | "abandoned";
  notes: string | null;
};

export type WorkoutSessionPayload = Omit<WorkoutSession, "id" | "user_id">;

export type WorkoutSummary = {
  sessions_count: number;
  total_duration_minutes: number;
  total_calories_burned: number;
};

export type LeaderboardEntry = {
  display_name: string;
  avatar_url: string | null;
  value: number;
  rank: number;
  period_type: "weekly" | "monthly";
  metric_type: "duration_minutes" | "calories_burned" | "sessions_count";
};

export function fetchWorkoutModes() {
  return apiRequest<WorkoutMode[]>("/catalog/workout-modes");
}

export function fetchExercises() {
  return apiRequest<Exercise[]>("/catalog/exercises");
}

export function fetchWorkoutSessions() {
  return apiRequest<WorkoutSession[]>("/workouts/sessions");
}

export function createWorkoutSession(payload: WorkoutSessionPayload) {
  return apiRequest<WorkoutSession>("/workouts/sessions", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchWorkoutSummary() {
  return apiRequest<WorkoutSummary>("/workouts/summary");
}

export function fetchLeaderboard(
  periodType: LeaderboardEntry["period_type"],
  metricType: LeaderboardEntry["metric_type"],
) {
  const params = new URLSearchParams({
    period_type: periodType,
    metric_type: metricType,
  });
  return apiRequest<LeaderboardEntry[]>(`/leaderboard?${params.toString()}`);
}
