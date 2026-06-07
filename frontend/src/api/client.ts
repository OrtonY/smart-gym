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
  if (
    !headers.has("Content-Type") &&
    options.body &&
    !(options.body instanceof FormData)
  ) {
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

export type PoseDetectionResult = {
  id: number;
  user_id: number;
  workout_session_id: number | null;
  exercise_id: number | null;
  workout_mode_id: number | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  reps_counted: number;
  score: number | null;
  feedback_summary: string | null;
  metrics_json: Record<string, unknown>;
  landmarks_sample_json: Record<string, unknown> | null;
  ai_advice: string | null;
  ai_provider_type: string | null;
  ai_model_name: string | null;
  ai_generated_at: string | null;
  created_at: string;
};

export type PoseDetectionResultPayload = Omit<
  PoseDetectionResult,
  | "id"
  | "user_id"
  | "ai_advice"
  | "ai_provider_type"
  | "ai_model_name"
  | "ai_generated_at"
  | "created_at"
>;

export type NutritionLog = {
  id: number;
  user_id: number;
  logged_at: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack" | "other";
  food_name: string;
  description: string | null;
  image_path: string | null;
  calories_kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  ai_confidence: number | null;
  ai_provider_type: string | null;
  ai_model_name: string | null;
  ai_raw_json: Record<string, unknown> | null;
  user_correction: string | null;
  created_at: string;
  updated_at: string;
};

export type NutritionLogPayload = Omit<
  NutritionLog,
  | "id"
  | "user_id"
  | "image_path"
  | "ai_confidence"
  | "ai_provider_type"
  | "ai_model_name"
  | "ai_raw_json"
  | "user_correction"
  | "created_at"
  | "updated_at"
>;

export type NutritionCorrectionPayload = Partial<
  Pick<
    NutritionLog,
    "food_name" | "description" | "calories_kcal" | "protein_g" | "carbs_g" | "fat_g"
  >
> & {
  user_correction: string;
};

export type DeviceMetric = {
  id: number;
  user_id: number;
  source: string;
  metric_type: string;
  measured_at: string;
  value: number;
  unit: string;
  workout_session_id: number | null;
  raw_json: Record<string, unknown>;
  created_at: string;
};

export type HeartRateImportPayload = {
  source: string;
  workout_session_id?: number | null;
  samples: Array<{ measured_at: string; bpm: number }>;
};

export type HeartRateSummary = {
  samples_count: number;
  latest_bpm: number | null;
  average_bpm: number | null;
  max_bpm: number | null;
};

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

export type TrainingPlanItem = {
  id: number;
  training_plan_id: number;
  version_number: number;
  scheduled_date: string | null;
  day_of_week: number;
  sort_order: number;
  exercise_id: number | null;
  workout_mode_id: number | null;
  title: string;
  sets: number | null;
  reps: number | null;
  duration_minutes: number | null;
  notes: string | null;
};

export type TrainingPlanItemPayload = Omit<
  TrainingPlanItem,
  "id" | "training_plan_id" | "version_number"
>;

export type TrainingPlanVersion = {
  id: number;
  training_plan_id: number;
  version_number: number;
  source: "manual" | "ai";
  change_summary: string | null;
  created_at: string;
};

export type TrainingPlanSummary = {
  id: number;
  user_id: number;
  title: string;
  source: "manual" | "ai";
  current_version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TrainingPlanDetail = TrainingPlanSummary & {
  items: TrainingPlanItem[];
  versions: TrainingPlanVersion[];
};

export type TrainingPlanCreatePayload = {
  title: string;
  items: TrainingPlanItemPayload[];
  change_summary?: string | null;
};

export type TrainingPlanItemsReplacePayload = {
  items: TrainingPlanItemPayload[];
  change_summary?: string | null;
};

export type AiTrainingPlanResponse = {
  conversation_id: number;
  plan: TrainingPlanDetail;
};

export function fetchWorkoutModes() {
  return apiRequest<WorkoutMode[]>("/catalog/workout-modes");
}

export function fetchExercises() {
  return apiRequest<Exercise[]>("/catalog/exercises");
}

export type WorkoutModePayload = Omit<WorkoutMode, "id">;
export type ExercisePayload = Omit<Exercise, "id">;
export type WorkoutModeUpdatePayload = Partial<Omit<WorkoutModePayload, "code">>;
export type ExerciseUpdatePayload = Partial<Omit<ExercisePayload, "slug">>;

export function fetchAdminWorkoutModes() {
  return apiRequest<WorkoutMode[]>("/admin/workout-modes");
}

export function fetchAdminExercises() {
  return apiRequest<Exercise[]>("/admin/exercises");
}

export function createAdminWorkoutMode(payload: WorkoutModePayload) {
  return apiRequest<WorkoutMode>("/admin/workout-modes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminWorkoutMode(
  modeId: number,
  payload: WorkoutModeUpdatePayload,
) {
  return apiRequest<WorkoutMode>(`/admin/workout-modes/${modeId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function createAdminExercise(payload: ExercisePayload) {
  return apiRequest<Exercise>("/admin/exercises", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminExercise(exerciseId: number, payload: ExerciseUpdatePayload) {
  return apiRequest<Exercise>(`/admin/exercises/${exerciseId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
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

export function fetchPoseDetectionResults() {
  return apiRequest<PoseDetectionResult[]>("/pose/results");
}

export function createPoseDetectionResult(payload: PoseDetectionResultPayload) {
  return apiRequest<PoseDetectionResult>("/pose/results", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function requestPoseAdvice(resultId: number) {
  return apiRequest<{ result: PoseDetectionResult }>(
    `/pose/results/${resultId}/ai-advice`,
    {
      method: "POST",
    },
  );
}

export function fetchNutritionLogs() {
  return apiRequest<NutritionLog[]>("/nutrition/logs");
}

export function createNutritionLog(payload: NutritionLogPayload) {
  return apiRequest<NutritionLog>("/nutrition/logs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function recognizeFood(formData: FormData) {
  return apiRequest<{ log: NutritionLog }>("/nutrition/recognize", {
    method: "POST",
    body: formData,
  });
}

export function updateNutritionLogCorrection(
  logId: number,
  payload: NutritionCorrectionPayload,
) {
  return apiRequest<NutritionLog>(`/nutrition/logs/${logId}/correction`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function importHeartRateSamples(payload: HeartRateImportPayload) {
  return apiRequest<{ metrics: DeviceMetric[] }>("/devices/heart-rate/import", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchDeviceMetrics(metricType?: string) {
  const params = metricType
    ? `?${new URLSearchParams({ metric_type: metricType }).toString()}`
    : "";
  return apiRequest<DeviceMetric[]>(`/devices/metrics${params}`);
}

export function fetchHeartRateSummary() {
  return apiRequest<HeartRateSummary>("/devices/heart-rate/summary");
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

export function fetchTrainingPlans() {
  return apiRequest<TrainingPlanSummary[]>("/training-plans");
}

export function fetchTrainingPlan(planId: number) {
  return apiRequest<TrainingPlanDetail>(`/training-plans/${planId}`);
}

export function createTrainingPlan(payload: TrainingPlanCreatePayload) {
  return apiRequest<TrainingPlanDetail>("/training-plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function replaceTrainingPlanItems(
  planId: number,
  payload: TrainingPlanItemsReplacePayload,
) {
  return apiRequest<TrainingPlanDetail>(`/training-plans/${planId}/items`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function generateAiTrainingPlan(prompt: string, title?: string) {
  return apiRequest<AiTrainingPlanResponse>("/ai-coach/training-plans/generate", {
    method: "POST",
    body: JSON.stringify({ prompt, title: title || undefined }),
  });
}

export function adjustAiTrainingPlan(
  planId: number,
  message: string,
  targetDate?: string,
) {
  return apiRequest<AiTrainingPlanResponse>(
    `/ai-coach/training-plans/${planId}/adjust`,
    {
      method: "POST",
      body: JSON.stringify({ message, target_date: targetDate }),
    },
  );
}
