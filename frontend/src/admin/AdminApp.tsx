import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout";
import { AuditPage } from "./pages/AuditPage";
import { BoardEditorRoute } from "./pages/BoardEditorPage";
import { LeaderboardsPage } from "./pages/LeaderboardsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { RafflesPage } from "./pages/RafflesPage";
import { SiteSettingsPage } from "./pages/SiteSettingsPage";

/** Admin SPA router mounted at `/admin`. */
export function AdminApp() {
  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route element={<AdminLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="leaderboards" element={<LeaderboardsPage />} />
          <Route path="leaderboards/:slug" element={<BoardEditorRoute />} />
          <Route path="raffles" element={<RafflesPage />} />
          <Route path="site" element={<SiteSettingsPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
