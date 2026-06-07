import { Route, Routes } from "react-router-dom";

import Layout from "../components/Layout";
import AiProviderSettingsPage from "../pages/user/AiProviderSettingsPage";
import HomePage from "../pages/user/HomePage";
import GuidedWorkoutPage from "../pages/user/GuidedWorkoutPage";
import LeaderboardPage from "../pages/user/LeaderboardPage";
import NutritionPage from "../pages/user/NutritionPage";
import PoseDetectionPage from "../pages/user/PoseDetectionPage";
import ProfilePage from "../pages/user/ProfilePage";
import TrainingPage from "../pages/user/TrainingPage";
import TrainingOverviewPage from "../pages/user/TrainingOverviewPage";
import TrainingPlansPage from "../pages/user/TrainingPlansPage";
import WorkoutReviewPage from "../pages/user/WorkoutReviewPage";

export default function UserRoutes() {
  return (
    <Routes>
      <Route element={<Layout mode="user" />}>
        <Route index element={<HomePage />} />
        <Route path="train" element={<TrainingPage />} />
        <Route path="train/templates/:templateId" element={<TrainingOverviewPage />} />
        <Route path="train/overview" element={<TrainingOverviewPage />} />
        <Route path="train/session/:sessionId" element={<GuidedWorkoutPage />} />
        <Route
          path="train/session/:sessionId/review"
          element={<WorkoutReviewPage />}
        />
        <Route path="pose" element={<PoseDetectionPage />} />
        <Route path="nutrition" element={<NutritionPage />} />
        <Route path="plans" element={<TrainingPlansPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="ai-settings" element={<AiProviderSettingsPage />} />
      </Route>
    </Routes>
  );
}
