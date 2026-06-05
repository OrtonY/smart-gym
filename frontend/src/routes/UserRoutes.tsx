import { Route, Routes } from "react-router-dom";

import Layout from "../components/Layout";
import AiProviderSettingsPage from "../pages/user/AiProviderSettingsPage";
import HomePage from "../pages/user/HomePage";
import ProfilePage from "../pages/user/ProfilePage";

function UserPlaceholder({ title }: { title: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
    </section>
  );
}

export default function UserRoutes() {
  return (
    <Routes>
      <Route element={<Layout mode="user" />}>
        <Route index element={<HomePage />} />
        <Route path="train" element={<UserPlaceholder title="训练" />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="ai-settings" element={<AiProviderSettingsPage />} />
      </Route>
    </Routes>
  );
}
