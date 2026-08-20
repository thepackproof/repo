import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Shell } from './Shell';
import { SignInPage } from './pages/SignIn';
import { HomePage } from './pages/Home';
import { LibraryPage } from './pages/Library';
import { WorkspaceActivity, WorkspaceEvidence, WorkspaceOverview, WorkspacePage } from './pages/Workspace';
import { PassportPage } from './pages/Passport';
import { HandoffPage } from './pages/Handoff';
import { ActivityPage } from './pages/Activity';
import { SettingsPage } from './pages/Settings';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, enabled } = useAuth();
  if (loading) return <main className="main"><p className="meta">Loading session…</p></main>;
  if (!enabled || !user) return <SignInPage />;
  return children;
}

function SignInRoute() {
  const { user, loading, enabled } = useAuth();
  if (loading) return <main className="main"><p className="meta">Loading session…</p></main>;
  if (enabled && user) return <Navigate to="/" replace />;
  return <SignInPage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInRoute />} />
      <Route
        path="/"
        element={(
          <RequireAuth>
            <Shell />
          </RequireAuth>
        )}
      >
        <Route index element={<HomePage />} />
        <Route path="packproofs" element={<LibraryPage />} />
        <Route path="packproofs/:id" element={<WorkspacePage />}>
          <Route index element={<WorkspaceOverview />} />
          <Route path="activity" element={<WorkspaceActivity />} />
          <Route path="evidence" element={<WorkspaceEvidence />} />
          <Route path="passport" element={<PassportPage />} />
        </Route>
        <Route path="packproofs/:id/handoff" element={<HandoffPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
