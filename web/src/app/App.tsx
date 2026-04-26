import { Routes, Route, Navigate } from "react-router-dom";
import { ShellLayout } from "../shell/ShellLayout";
import { DashboardPage } from "../modules/dashboard/DashboardPage";
import { OverviewPage } from "../modules/overview/OverviewPage";
import { SentryPage } from "../modules/sentry/SentryPage";
import { AegisPage } from "../modules/aegis/AegisPage";
import { AuthorityPlaceholderPage } from "../modules/authority/AuthorityPlaceholderPage";
import { SessionProvider } from "../lib/session/SessionProvider";
import { NatsProvider } from "../lib/nats/NatsProvider";

export function App() {
  return (
    <SessionProvider>
      <NatsProvider>
        <Routes>
          <Route path="/" element={<ShellLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="debug/overview" element={<OverviewPage />} />
            <Route path="sentry" element={<SentryPage />} />
            <Route path="aegis" element={<AegisPage />} />
            <Route path="authority/:surface" element={<AuthorityPlaceholderPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </NatsProvider>
    </SessionProvider>
  );
}
