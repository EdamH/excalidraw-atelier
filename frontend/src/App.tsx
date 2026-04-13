import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { HomePage } from "./pages/HomePage";
import { RequireAuth } from "./auth/RequireAuth";
import { KeyboardShortcuts } from "./components/KeyboardShortcuts";
import { KonamiEasterEgg } from "./components/KonamiEasterEgg";
import { Spinner } from "./components/ui/Spinner";

const EditorPage = lazy(() =>
  import("./pages/EditorPage").then((m) => ({ default: m.EditorPage }))
);
const AdminPage = lazy(() =>
  import("./pages/AdminPage").then((m) => ({ default: m.AdminPage }))
);
const TemplateEditorPage = lazy(() =>
  import("./pages/TemplateEditorPage").then((m) => ({ default: m.TemplateEditorPage }))
);
const LeaderboardPage = lazy(() =>
  import("./pages/LeaderboardPage").then((m) => ({ default: m.LeaderboardPage }))
);
const ProfilePage = lazy(() =>
  import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage }))
);
const BrainstormPage = lazy(() =>
  import("./pages/BrainstormPage").then((m) => ({ default: m.BrainstormPage }))
);

export default function App() {
  return (
    <>
      <KeyboardShortcuts />
      <KonamiEasterEgg />
      <Suspense
        fallback={
          <div className="flex h-screen items-center justify-center bg-paper">
            <div className="inline-flex items-center gap-3 text-ink-fade">
              <Spinner size={18} />
              <span className="font-mono uppercase tracking-[0.14em] text-[10px]">
                // LOADING
              </span>
            </div>
          </div>
        }
      >
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/d/:docId"
          element={
            <RequireAuth>
              <EditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/templates/:templateId/edit"
          element={
            <RequireAuth>
              <TemplateEditorPage />
            </RequireAuth>
          }
        />
        <Route
          path="/leaderboard"
          element={
            <RequireAuth>
              <LeaderboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/profile/:userId"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route
          path="/brainstorm"
          element={
            <RequireAuth>
              <BrainstormPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </>
  );
}
