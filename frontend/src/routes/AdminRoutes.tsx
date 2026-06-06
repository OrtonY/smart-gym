import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import Layout from "../components/Layout";
import AdminContentPage from "../pages/admin/AdminContentPage";
import AdminHomePage from "../pages/admin/AdminHomePage";

export default function AdminRoutes() {
  const { currentUser } = useAuth();

  if (currentUser?.role !== "admin") {
    return <Navigate to="/app" replace />;
  }

  return (
    <Routes>
      <Route element={<Layout mode="admin" />}>
        <Route index element={<AdminHomePage />} />
        <Route path="content" element={<AdminContentPage />} />
      </Route>
    </Routes>
  );
}
