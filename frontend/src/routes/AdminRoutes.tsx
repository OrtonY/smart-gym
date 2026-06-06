import { Route, Routes } from "react-router-dom";

import Layout from "../components/Layout";
import AdminContentPage from "../pages/admin/AdminContentPage";
import AdminHomePage from "../pages/admin/AdminHomePage";

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<Layout mode="admin" />}>
        <Route index element={<AdminHomePage />} />
        <Route path="content" element={<AdminContentPage />} />
      </Route>
    </Routes>
  );
}
