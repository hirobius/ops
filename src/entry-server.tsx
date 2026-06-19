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
import { createMemoryRouter, RouterProvider } from 'react-router';
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
