/**
 * Server-side render entry for static pre-rendering.
 *
 * Renders public routes to an HTML string at build time. The pre-render
 * script (scripts/prerender.mjs) imports and calls render() after running
 * `vite build --ssr src/entry-server.tsx`.
 *
 * Renders ONLY page content (no animated shell/sidebar) so the output
 * is safe for any environment without browser globals.
 *
 * Note: the public portfolio/visuals/case-study/sketch surfaces were removed
 * in the ops extraction; only /info remains pre-renderable here.
 */
import { renderToString } from 'react-dom/server';
import { createMemoryRouter, matchRoutes, RouterProvider } from 'react-router';
import { MotionConfig } from 'motion/react';
import {
  TenantProvider,
  LanguageProvider,
  ThemeProvider,
  FontProvider,
} from '@hirobius/design-system/contexts';

// Direct (non-lazy) imports so renderToString resolves them synchronously
import InfoPageWrapper from './app/pages/InfoPageWrapper';

const SSR_ROUTES = [{ path: '/info', element: <InfoPageWrapper /> }];

export function render(url: string): string {
  // Routes not in SSR_ROUTES (the gated /ops app, or stale prerender entries) have
  // no server render — return an empty body so prerender writes the clean SPA shell
  // instead of React Router's default 404 error-boundary HTML (which otherwise gets
  // baked into index.html and shows on every SPA-fallback route, e.g. /ops).
  if (!matchRoutes(SSR_ROUTES, url)) return '';
  const router = createMemoryRouter(SSR_ROUTES, {
    initialEntries: [url],
    initialIndex: 0,
  });

  return renderToString(
    <MotionConfig reducedMotion="user">
      <TenantProvider>
        <LanguageProvider>
          <ThemeProvider>
            <FontProvider>
              <RouterProvider router={router} />
            </FontProvider>
          </ThemeProvider>
        </LanguageProvider>
      </TenantProvider>
    </MotionConfig>,
  );
}
