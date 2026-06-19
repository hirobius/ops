import { Component, useEffect, useState, type ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import { MotionConfig } from 'motion/react';
// Phosphor IconContext removed — Lucide icons accept individual size/color/strokeWidth props
import hds from '@hirobius/design-system/tokens';
import {
  FontProvider,
  LanguageProvider,
  TenantProvider,
  ThemeProvider,
} from '@hirobius/design-system/contexts';
import { router } from './routes';

const HDS_XRAY_BODY_ATTRIBUTE = 'data-hds-xray';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (error)
      return (
        <div
          style={{ padding: 32, fontFamily: hds.monoFamily, whiteSpace: 'pre-wrap', color: 'red' }}
        >
          {' '}
          {/* spacing-ok: error boundary fallback, not a UI component */}
          <strong>Runtime error:</strong>
          {'\n'}
          {(error as Error).message}
          {'\n\n'}
          {(error as Error).stack}
        </div>
      );
    return this.props.children;
  }
}

function GlobalXRayMode() {
  const [isXRayEnabled, setIsXRayEnabled] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditableTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT');

      if (event.repeat || isEditableTarget || !event.shiftKey || event.key.toLowerCase() !== 'x') {
        return;
      }

      event.preventDefault();
      setIsXRayEnabled((currentValue) => !currentValue);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof document === 'undefined') {
      return;
    }

    if (isXRayEnabled) {
      document.body.setAttribute(HDS_XRAY_BODY_ATTRIBUTE, 'true');
    } else {
      document.body.removeAttribute(HDS_XRAY_BODY_ATTRIBUTE);
    }

    return () => {
      document.body.removeAttribute(HDS_XRAY_BODY_ATTRIBUTE);
    };
  }, [isXRayEnabled]);

  return null;
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <TenantProvider>
        <LanguageProvider>
          <ThemeProvider>
            <FontProvider>
              <ErrorBoundary>
                <GlobalXRayMode />
                <RouterProvider router={router} />
              </ErrorBoundary>
            </FontProvider>
          </ThemeProvider>
        </LanguageProvider>
      </TenantProvider>
    </MotionConfig>
  );
}
