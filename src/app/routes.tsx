import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import NotFoundPage from './pages/NotFoundPage';
import ErrorPage from './pages/ErrorPage';
import InfoPageWrapper from './pages/InfoPageWrapper';
import OpsGate from './components/OpsGate';

// ── Ops / internal tooling — lazy loaded ─────────────────────────────────────
const AtlasPage = lazy(() => import('./pages/ops/AtlasPage'));
const AgenticOSPage = lazy(() => import('./pages/ops/agentic-os/AgenticOSPage'));
const OpsDashboardLegacyPage = lazy(() => import('./pages/ops/OpsDashboardPage'));
const StagingPage = lazy(() => import('./pages/ops/StagingPage'));
const BriefingPage = lazy(() => import('./pages/ops/BriefingPage'));
const ClientsIndexPage = lazy(() => import('./pages/ops/ClientsIndexPage'));
const ClientDashboardPage = lazy(() => import('./pages/ops/ClientDashboardPage'));
const ClientReportPage = lazy(() => import('./pages/ops/ClientReportPage'));
const ClientBrandAuditPage = lazy(() => import('./pages/ops/ClientBrandAuditPage'));
const SessionsPage = lazy(() => import('./pages/ops/SessionsPage'));
const KanbanPage = lazy(() => import('./pages/ops/kanban/KanbanPage'));
const OpsShell = lazy(() => import('./pages/ops/OpsShell').then((m) => ({ default: m.OpsShell })));
const BuildPage = lazy(() => import('./pages/ops/BuildPage'));
const KnowledgePage = lazy(() => import('./pages/ops/KnowledgePage'));
const LeadsPage = lazy(() => import('./pages/ops/leads/LeadsPage'));
const TasksPage = lazy(() => import('./pages/ops/tasks/TasksPage'));
const DigestPage = lazy(() => import('./pages/ops/digest/DigestPage'));
const ProjectsPage = lazy(() => import('./pages/ops/projects/ProjectsPage'));

// ── Admin (approval inbox) — lazy loaded ─────────────────────────────────────
const ApprovalsPage = lazy(() => import('./pages/admin/Approvals'));
const ApprovalDetailPage = lazy(() => import('./pages/admin/ApprovalDetail'));

// ── Client portal — public token-gated route at /c/:slug ─────────────────────
const ClientPortalPage = lazy(() => import('./pages/portal/ClientPortalPage'));

// ── Fallback ──────────────────────────────────────────────────────────────────
function HDSFallback() {
  return <div style={{ flex: 1, minHeight: '60vh' }} />;
}

function LazyHDS({ Page }: { Page: ComponentType }) {
  return (
    <Suspense fallback={<HDSFallback />}>
      <Page />
    </Suspense>
  );
}

// Minimal root layout. The design-system doc shell (HDSLayout) now lives in the
// @hirobius/design-system site; the ops dashboard provides its own chrome via
// OpsShell. Context providers are wired in App.tsx.
function RootLayout() {
  return <Outlet />;
}

// ── Router ────────────────────────────────────────────────────────────────────
// Hirobius Ops — agency operations dashboard. UI primitives come from the
// @hirobius/design-system package; `/` lands on the Ops HQ dashboard.

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <Navigate to="/ops" replace /> },
      { path: 'info', Component: InfoPageWrapper },
      // Legacy design-system doc deep-links now live in the standalone DS site.
      { path: 'hds/*', element: <Navigate to="/ops" replace /> },
      {
        path: 'ops',
        element: (
          <OpsGate>
            <Suspense fallback={<HDSFallback />}>
              <OpsShell />
            </Suspense>
          </OpsGate>
        ),
        children: [
          { index: true, element: <LazyHDS Page={AgenticOSPage} /> },
          { path: '_legacy', element: <LazyHDS Page={OpsDashboardLegacyPage} /> },
          { path: 'staging', element: <LazyHDS Page={StagingPage} /> },
          { path: 'briefing', element: <LazyHDS Page={BriefingPage} /> },
          { path: 'atlas', element: <LazyHDS Page={AtlasPage} /> },
          { path: 'build', element: <LazyHDS Page={BuildPage} /> },
          { path: 'knowledge', element: <LazyHDS Page={KnowledgePage} /> },
          { path: 'sessions', element: <LazyHDS Page={SessionsPage} /> },
          { path: 'kanban', element: <LazyHDS Page={KanbanPage} /> },
          { path: 'leads', element: <LazyHDS Page={LeadsPage} /> },
          { path: 'tasks', element: <LazyHDS Page={TasksPage} /> },
          { path: 'digest', element: <LazyHDS Page={DigestPage} /> },
          { path: 'projects', element: <LazyHDS Page={ProjectsPage} /> },
          { path: 'clients', element: <LazyHDS Page={ClientsIndexPage} /> },
          { path: 'clients/:slug', element: <LazyHDS Page={ClientDashboardPage} /> },
          { path: 'clients/:slug/report', element: <LazyHDS Page={ClientReportPage} /> },
          { path: 'clients/:slug/brand-audit', element: <LazyHDS Page={ClientBrandAuditPage} /> },
          // Legacy /ops/hds/* doc routes now live in the standalone DS site.
          { path: 'hds/*', element: <Navigate to="/ops" replace /> },
        ],
      },
      {
        path: 'admin',
        children: [
          { index: true, element: <Navigate to="/admin/approvals" replace /> },
          { path: 'approvals', element: <LazyHDS Page={ApprovalsPage} /> },
          { path: 'approvals/:id', element: <LazyHDS Page={ApprovalDetailPage} /> },
        ],
      },
      { path: '*', Component: NotFoundPage },
    ],
  },
  // ── Client portal — public, no chrome. Token-gated. ──────────────────────────
  {
    path: '/c/:slug',
    element: <LazyHDS Page={ClientPortalPage} />,
    errorElement: <ErrorPage />,
  },
]);
