import { lazy, Suspense, type ComponentType } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import NotFoundPage from './pages/NotFoundPage';
import ErrorPage from './pages/ErrorPage';
import InfoPageWrapper from './pages/InfoPageWrapper';
import OpsGate from './components/OpsGate';

// ── Ops / internal tooling — lazy loaded ─────────────────────────────────────
const AgenticOSPage = lazy(() => import('./pages/ops/agentic-os/AgenticOSPage'));
const ClientsIndexPage = lazy(() => import('./pages/ops/ClientsIndexPage'));
const ClientDashboardPage = lazy(() => import('./pages/ops/ClientDashboardPage'));
const ClientReportPage = lazy(() => import('./pages/ops/ClientReportPage'));
const ClientBrandAuditPage = lazy(() => import('./pages/ops/ClientBrandAuditPage'));
const LeadsPage = lazy(() => import('./pages/ops/leads/LeadsPage'));
const TasksPage = lazy(() => import('./pages/ops/tasks/TasksPage'));
const DigestPage = lazy(() => import('./pages/ops/digest/DigestPage'));
const ProjectsPage = lazy(() => import('./pages/ops/projects/ProjectsPage'));

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
// @hirobius/design-system site; pages provide their own chrome. Context
// providers are wired in App.tsx.
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
              <Outlet />
            </Suspense>
          </OpsGate>
        ),
        children: [
          { index: true, element: <LazyHDS Page={AgenticOSPage} /> },
          { path: 'leads', element: <LazyHDS Page={LeadsPage} /> },
          { path: 'tasks', element: <LazyHDS Page={TasksPage} /> },
          { path: 'digest', element: <LazyHDS Page={DigestPage} /> },
          { path: 'projects', element: <LazyHDS Page={ProjectsPage} /> },
          // /ops/issues retired 2026-07-09 (#52): consolidated into /ops/tasks —
          // the importer already pulls the same cross-repo issue feed, and the
          // multi-select "Copy refs" action moved onto the tasks board.
          { path: 'issues', element: <Navigate to="/ops/tasks" replace /> },
          { path: 'clients', element: <LazyHDS Page={ClientsIndexPage} /> },
          { path: 'clients/:slug', element: <LazyHDS Page={ClientDashboardPage} /> },
          { path: 'clients/:slug/report', element: <LazyHDS Page={ClientReportPage} /> },
          { path: 'clients/:slug/brand-audit', element: <LazyHDS Page={ClientBrandAuditPage} /> },
          // Legacy /ops/hds/* doc routes now live in the standalone DS site.
          { path: 'hds/*', element: <Navigate to="/ops" replace /> },
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
