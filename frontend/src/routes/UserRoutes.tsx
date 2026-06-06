import { Route, Routes } from "react-router-dom";

import Layout from "../components/Layout";
import AiProviderSettingsPage from "../pages/user/AiProviderSettingsPage";
import HomePage from "../pages/user/HomePage";
import LeaderboardPage from "../pages/user/LeaderboardPage";
import ProfilePage from "../pages/user/ProfilePage";
import TrainingPage from "../pages/user/TrainingPage";
import TrainingPlansPage from "../pages/user/TrainingPlansPage";

export default function UserRoutes() {
  return (
    <Routes>
      <Route element={<Layout mode="user" />}>
        <Route index element={<HomePage />} />
        <Route path="train" element={<TrainingPage />} />
        <Route path="plans" element={<TrainingPlansPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="ai-settings" element={<AiProviderSettingsPage />} />
      </Route>
    </Routes>
  );
}
