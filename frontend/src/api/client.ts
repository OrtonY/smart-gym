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
  status: "in_progress" | "completed" | "partial" | "abandoned";
  source_type: "free" | "plan" | "template";
  source_plan_id: number | null;
  source_plan_item_id: number | null;
  source_template_id: number | null;
  pose_detection_enabled: boolean;
  completed_steps_count: number;
  total_steps_count: number;
  notes: string | null;
  steps?: WorkoutSessionStep[];
};

export type WorkoutSessionPayload = Omit<
  WorkoutSession,
  | "id"
  | "user_id"
  | "source_type"
  | "source_plan_id"
  | "source_plan_item_id"
  | "source_template_id"
  | "pose_detection_enabled"
  | "completed_steps_count"
  | "total_steps_count"
  | "steps"
>;

export type WorkoutSessionStep = {
  id: number;
  sort_order: number;
  exercise_id: number | null;
  workout_mode_id: number | null;
  title: string;
  planned_sets: number | null;
  planned_reps: number | null;
  planned_duration_seconds: number | null;
  planned_rest_seconds: number | null;
  actual_reps: number | null;
  actual_duration_seconds: number | null;
  score: number | null;
  status: "planned" | "completed" | "partial" | "skipped";
  pose_detection_result_id: number | null;
  notes: string | null;
};

export type WorkoutSessionStartPayload = {
  source_type: "plan" | "template" | "free";
  source_plan_id?: number | null;
  source_plan_item_id?: number | null;
  source_template_id?: number | null;
  workout_mode_id?: number | null;
  exercise_id?: number | null;
  pose_detection_enabled: boolean;
};

export type WorkoutSessionStartResponse = WorkoutSession & {
  steps: WorkoutSessionStep[];
};

export type WorkoutSessionStepFinishPayload = {
  sort_order: number;
  title: string;
  actual_reps?: number | null;
  actual_duration_seconds?: number | null;
  score?: number | null;
  status: "completed" | "partial" | "skipped";
  pose_detection_result_id?: number | null;
  notes?: string | null;
};

export type WorkoutSessionFinishPayload = {
  ended_at: string;
  duration_minutes: number;
  calories_burned: number;
  status: "completed" | "partial" | "abandoned";
  reps?: number | null;
  score?: number | null;
  notes?: string | null;
  steps: WorkoutSessionStepFinishPayload[];
};

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
  nutrition_plan_meal_id: number | null;
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
  | "nutrition_plan_meal_id"
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

export type NutritionPlanMeal = {
  id: number;
  nutrition_plan_id: number;
  version_number: number;
  scheduled_date: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  sort_order: number;
  title: string;
  food_items: Array<Record<string, unknown>>;
  portion_notes: string | null;
  target_calories_kcal: number | null;
  target_protein_g: number | null;
  target_carbs_g: number | null;
  target_fat_g: number | null;
  notes: string | null;
  status: "planned" | "logged" | "partial" | "over_target" | "missed";
  actual_calories_kcal: number;
  actual_protein_g: number | null;
  actual_carbs_g: number | null;
  actual_fat_g: number | null;
  last_reconciled_at: string | null;
};

export type NutritionPlan = {
  id: number;
  user_id: number;
  title: string;
  source: string;
  current_version: number;
  is_active: boolean;
  start_date: string;
  end_date: string;
  days_count: number;
  created_at: string;
  updated_at: string;
};

export type NutritionPlanDetail = NutritionPlan & {
  items: NutritionPlanMeal[];
  versions: Array<{
    id: number;
    nutrition_plan_id: number;
    version_number: number;
    source: string;
    user_prompt: string | null;
    change_summary: string | null;
    created_at: string;
  }>;
};

export type AiConversationMessage = {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | string;
  content: string;
  provider_type: string | null;
  model_name: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
};

export type AiConversationSummary = {
  id: number;
  user_id: number;
  topic: "training_plan" | "nutrition_plan" | "food_record" | string;
  training_plan_id: number | null;
  nutrition_plan_id: number | null;
  title: string;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
};

export type AiConversationDetail = AiConversationSummary & {
  messages: AiConversationMessage[];
};

export type AiConversationQuery = {
  topic?: string;
  trainingPlanId?: number | null;
  nutritionPlanId?: number | null;
};

export type NutritionSummary = {
  today: {
    date: string;
    target_calories_kcal: number;
    actual_calories_kcal: number;
    actual_protein_g: number;
    actual_carbs_g: number;
    actual_fat_g: number;
    meals: NutritionPlanMeal[];
  };
  daily: Array<{
    date: string;
    target_calories_kcal: number;
    actual_calories_kcal: number;
    actual_protein_g: number;
    actual_carbs_g: number;
    actual_fat_g: number;
    has_logs: boolean;
  }>;
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
  duration_seconds: number | null;
  rest_seconds: number | null;
  instruction: string | null;
  source_template_id: number | null;
  source_template_step_id: number | null;
  entry_type: "scheduled" | "ad_hoc";
  status: "planned" | "completed" | "partial" | "skipped" | "rescheduled";
  linked_workout_session_id: number | null;
  completed_at: string | null;
  actual_duration_seconds: number | null;
  actual_score: number | null;
  notes: string | null;
};

export type TrainingPlanItemPayload = {
  scheduled_date: string | null;
  day_of_week: number;
  sort_order: number;
  exercise_id: number | null;
  workout_mode_id: number | null;
  title: string;
  sets: number | null;
  reps: number | null;
  duration_minutes: number | null;
  duration_seconds?: number | null;
  rest_seconds?: number | null;
  instruction?: string | null;
  source_template_id?: number | null;
  source_template_step_id?: number | null;
  entry_type?: "scheduled" | "ad_hoc";
  status?: "planned" | "completed" | "partial" | "skipped" | "rescheduled";
  notes: string | null;
};

export type TrainingPlanVersion = {
  id: number;
  training_plan_id: number;
  version_number: number;
  source: string;
  change_summary: string | null;
  created_at: string;
};

export type TrainingPlanSummary = {
  id: number;
  user_id: number;
  title: string;
  source: string;
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

export type WorkoutTemplateStep = {
  id: number;
  workout_template_id: number;
  sort_order: number;
  exercise_id: number | null;
  workout_mode_id: number | null;
  title: string;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rest_seconds: number | null;
  instruction: string | null;
  allow_pose_detection: boolean;
};

export type WorkoutTemplate = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  goal: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  target_muscles: string;
  estimated_duration_minutes: number;
  cover_url: string | null;
  tags: string[];
  recommendation_weight: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  steps: WorkoutTemplateStep[];
};

export type WorkoutTemplateStepPayload = Omit<
  WorkoutTemplateStep,
  "id" | "workout_template_id"
>;

export type WorkoutTemplatePayload = Omit<
  WorkoutTemplate,
  "id" | "created_at" | "updated_at" | "steps"
> & {
  steps: WorkoutTemplateStepPayload[];
};

export type WorkoutTemplateUpdatePayload = Partial<WorkoutTemplatePayload>;

export type WorkoutTemplateFilters = {
  goal?: string;
  difficulty?: WorkoutTemplate["difficulty"];
  target?: string;
  max_duration?: number;
};

export type WorkoutTemplateApplyPayload = {
  scheduled_date: string;
  plan_title?: string;
};

export type TodayWorkoutStep = {
  id: number | null;
  sort_order: number;
  exercise_id: number | null;
  workout_mode_id: number | null;
  title: string;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rest_seconds: number | null;
  instruction: string | null;
  allow_pose_detection: boolean;
};

export type TodayWorkout = {
  source_type: "plan" | "template" | "empty";
  source_id: number | null;
  title: string;
  description: string | null;
  estimated_duration_minutes: number | null;
  difficulty: string | null;
  target_muscles: string | null;
  steps: TodayWorkoutStep[];
  pose_detection_available: boolean;
  empty_state: string | null;
};

export type TrainingPlanReconcileResponse = {
  skipped_items: number;
  ad_hoc_entries_created: number;
  reconciled_date: string;
};

export function fetchWorkoutModes() {
  return apiRequest<WorkoutMode[]>("/catalog/workout-modes");
}

export function fetchExercises() {
  return apiRequest<Exercise[]>("/catalog/exercises");
}

export async function fetchExercise(exerciseId: number) {
  const exercises = await fetchExercises();
  return exercises.find((exercise) => exercise.id === exerciseId) ?? null;
}

export function fetchTodayTraining(date?: string) {
  const params = date ? `?${new URLSearchParams({ date }).toString()}` : "";
  return apiRequest<TodayWorkout>(`/today/training${params}`);
}

export function fetchWorkoutTemplates(filters: WorkoutTemplateFilters = {}) {
  const params = new URLSearchParams();
  if (filters.goal) {
    params.set("goal", filters.goal);
  }
  if (filters.difficulty) {
    params.set("difficulty", filters.difficulty);
  }
  if (filters.target) {
    params.set("target", filters.target);
  }
  if (filters.max_duration) {
    params.set("max_duration", String(filters.max_duration));
  }
  const query = params.toString();
  return apiRequest<WorkoutTemplate[]>(`/workout-templates${query ? `?${query}` : ""}`);
}

export function fetchWorkoutTemplate(templateId: number) {
  return apiRequest<WorkoutTemplate>(`/workout-templates/${templateId}`);
}

export function applyWorkoutTemplateToPlan(
  templateId: number,
  payload: WorkoutTemplateApplyPayload,
) {
  return apiRequest<TrainingPlanDetail>(
    `/workout-templates/${templateId}/apply-to-plan`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
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

export function fetchAdminWorkoutTemplates() {
  return apiRequest<WorkoutTemplate[]>("/admin/workout-templates");
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

export function createAdminWorkoutTemplate(payload: WorkoutTemplatePayload) {
  return apiRequest<WorkoutTemplate>("/admin/workout-templates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminWorkoutTemplate(
  templateId: number,
  payload: WorkoutTemplateUpdatePayload,
) {
  return apiRequest<WorkoutTemplate>(`/admin/workout-templates/${templateId}`, {
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

export function startWorkoutSession(payload: WorkoutSessionStartPayload) {
  return apiRequest<WorkoutSessionStartResponse>("/workouts/sessions/start", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function finishWorkoutSession(
  sessionId: number,
  payload: WorkoutSessionFinishPayload,
) {
  return apiRequest<WorkoutSessionStartResponse>(
    `/workouts/sessions/${sessionId}/finish`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
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
  return apiRequest<{ log: NutritionLog; conversation_id: number }>("/nutrition/recognize", {
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

export function fetchNutritionSummary(days = 7) {
  return apiRequest<NutritionSummary>(`/nutrition/summary?days=${days}`);
}

export function fetchNutritionPlans() {
  return apiRequest<NutritionPlan[]>("/nutrition/plans");
}

export function fetchNutritionPlan(planId: number) {
  return apiRequest<NutritionPlanDetail>(`/nutrition/plans/${planId}`);
}

export function fetchAiConversations(query: AiConversationQuery) {
  const params = new URLSearchParams();
  if (query.topic) params.set("topic", query.topic);
  if (query.trainingPlanId) params.set("training_plan_id", String(query.trainingPlanId));
  if (query.nutritionPlanId) params.set("nutrition_plan_id", String(query.nutritionPlanId));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<AiConversationSummary[]>(`/ai-conversations${suffix}`);
}

export function fetchAiConversation(conversationId: number) {
  return apiRequest<AiConversationDetail>(`/ai-conversations/${conversationId}`);
}

export function generateNutritionPlan(prompt: string, conversationId?: number | null) {
  return apiRequest<{ conversation_id: number; plan: NutritionPlanDetail }>(
    "/ai-coach/nutrition-plans/generate",
    {
      method: "POST",
      body: JSON.stringify({ prompt, conversation_id: conversationId || undefined }),
    },
  );
}

export function adjustNutritionPlan(
  planId: number,
  prompt: string,
  conversationId?: number | null,
) {
  return apiRequest<{ conversation_id: number; plan: NutritionPlanDetail }>(
    `/ai-coach/nutrition-plans/${planId}/adjust`,
    {
      method: "POST",
      body: JSON.stringify({ prompt, conversation_id: conversationId || undefined }),
    },
  );
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

export function reconcileTrainingPlans(today?: string) {
  return apiRequest<TrainingPlanReconcileResponse>("/training-plans/reconcile", {
    method: "POST",
    body: JSON.stringify({ today: today || undefined }),
  });
}

export function generateAiTrainingPlan(
  prompt: string,
  title?: string,
  conversationId?: number | null,
) {
  return apiRequest<AiTrainingPlanResponse>("/ai-coach/training-plans/generate", {
    method: "POST",
    body: JSON.stringify({
      prompt,
      title: title || undefined,
      conversation_id: conversationId || undefined,
    }),
  });
}

export function adjustAiTrainingPlan(
  planId: number,
  message: string,
  targetDate?: string,
  conversationId?: number | null,
) {
  return apiRequest<AiTrainingPlanResponse>(
    `/ai-coach/training-plans/${planId}/adjust`,
    {
      method: "POST",
      body: JSON.stringify({
        message,
        target_date: targetDate,
        conversation_id: conversationId || undefined,
      }),
    },
  );
}
