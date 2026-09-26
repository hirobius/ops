/**
 * hds-router-adapter — bridges @hirobius/design-system's router seam to
 * react-router, so HDS components that navigate (Breadcrumb, etc.) do
 * client-side navigation instead of falling back to plain <a> reloads.
 *
 * Must be mounted INSIDE the react-router tree (it calls useNavigate /
 * useLocation), which is why it wraps <Outlet /> in RootLayout rather than
 * wrapping <RouterProvider> itself in App.tsx.
 *
 * Refs hirobius/ops#425 (review round 2 — HDS Breadcrumb needs an adapter to
 * navigate client-side; ops mounted none, so every breadcrumb click reloaded
 * the page).
 */
import { forwardRef, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  HdsRouterProvider,
  type HdsLinkComponent,
  type HdsLinkProps,
  type HdsRouterAdapter,
} from '@hirobius/design-system';

const RouterLink: HdsLinkComponent = forwardRef<HTMLAnchorElement, HdsLinkProps>(
  function RouterLink({ to, ...rest }, ref) {
    return <Link ref={ref} to={to} {...rest} />;
  },
);

function useReactRouterAdapter(): HdsRouterAdapter {
  const navigate = useNavigate();
  const location = useLocation();

  return {
    navigate: (href, options) =>
      navigate(href, { replace: options?.replace, state: options?.state }),
    currentPath: location.pathname,
    LinkComponent: RouterLink,
  };
}

/** Wrap the routed subtree once so every HDS component below navigates via react-router. */
export function HdsReactRouterBridge({ children }: { children?: ReactNode }) {
  const adapter = useReactRouterAdapter();
  return <HdsRouterProvider adapter={adapter}>{children}</HdsRouterProvider>;
}
