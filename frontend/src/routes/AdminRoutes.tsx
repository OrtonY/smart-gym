import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import Layout from "../components/Layout";
import AdminExercisesPage from "../pages/admin/AdminExercisesPage";
import AdminHomePage from "../pages/admin/AdminHomePage";
import AdminWorkoutModesPage from "../pages/admin/AdminWorkoutModesPage";
import AdminWorkoutTemplatesPage from "../pages/admin/AdminWorkoutTemplatesPage";

export default function AdminRoutes() {
  const { currentUser } = useAuth();

  if (currentUser?.role !== "admin") {
    return <Navigate to="/app" replace />;
  }

  return (
    <Routes>
      <Route element={<Layout mode="admin" />}>
        <Route index element={<AdminHomePage />} />
        <Route path="content" element={<Navigate to="/admin/workout-modes" replace />} />
        <Route path="workout-modes" element={<AdminWorkoutModesPage />} />
        <Route path="exercises" element={<AdminExercisesPage />} />
        <Route path="workout-templates" element={<AdminWorkoutTemplatesPage />} />
      </Route>
    </Routes>
  );
}
