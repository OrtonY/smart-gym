import { Route, Routes } from "react-router-dom";

import Layout from "../components/Layout";
import AdminHomePage from "../pages/admin/AdminHomePage";

function AdminPlaceholder({ title }: { title: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
    </section>
  );
}

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<Layout mode="admin" />}>
        <Route index element={<AdminHomePage />} />
        <Route path="content" element={<AdminPlaceholder title="内容管理" />} />
      </Route>
    </Routes>
  );
}
