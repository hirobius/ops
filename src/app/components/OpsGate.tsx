/**
 * OpsGate — client-side password gate wrapping all /ops/* routes.
 *
 * @category System
 * @tier utility
 * @internal — ops infrastructure, not a consumer-facing HDS component
 */
/* hds-bypass: gate screen — 320px maxWidth is a fixed form measure, not a layout token */
// motion-ok: auth gate renders once and exits — CSS opacity transition on button is sufficient, no choreographed sequence needed
// ref-ok: OpsGate is a self-contained auth screen; the password input is internal state and not composable
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { getStoredAccess, setStoredAccess, verifyPassword } from '../../lib/ops-gate';
import hds from '@hirobius/design-system/tokens';

const opsGateStyles = {
  submitBtnBase: {
    ...hds.typeStyles.ui,
    padding: `var(--hds-space-sm) var(--hds-space-lg)`,
    border: '1px solid var(--semantic-color-border-strong)',
    borderRadius: 'var(--semantic-radius-action)',
    background: 'var(--semantic-color-surface-overlay)',
    color: 'var(--semantic-color-content-primary)',
    transition: `opacity var(--hds-motion-productive-duration) ease, background-color var(--hds-motion-productive-duration) ease`,
  } satisfies React.CSSProperties,
} as const;

const EXPECTED_HASH =
  (import.meta.env as Record<string, string | undefined>)['VITE_OPS_GATE_HASH'] ?? '';
const DEV_BYPASS = import.meta.env.DEV;

interface OpsGateProps {
  children: ReactNode;
}

/**
 * Wraps `/ops/*` routes with a client-side password gate.
 *
 * - In dev mode, always renders children (DEV_BYPASS).
 * - On first prod visit, shows a password screen.
 * - Successful password sets a 7-day localStorage flag.
 * - `?key=<password>` URL param accepted for shareable deep links.
 */
export default function OpsGate({ children }: OpsGateProps) {
  const [searchParams] = useSearchParams();
  const [unlocked, setUnlocked] = useState<boolean>(() => DEV_BYPASS || getStoredAccess());
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // ?key=<password> deep link — verify on mount.
  useEffect(() => {
    if (unlocked) return;
    const keyParam = searchParams.get('key');
    if (!keyParam) return;
    let cancelled = false;
    (async () => {
      const ok = await verifyPassword(keyParam, EXPECTED_HASH);
      if (cancelled) return;
      if (ok) {
        setStoredAccess();
        setUnlocked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, unlocked]);

  if (unlocked) return <>{children}</>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    const ok = await verifyPassword(input, EXPECTED_HASH);
    setChecking(false);
    if (ok) {
      setStoredAccess();
      setUnlocked(true);
    } else {
      setError('Incorrect.');
      setInput('');
    }
  }

  return (
    <main
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--hds-space-2xl)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'grid',
          gap: 'var(--hds-space-md)',
          width: '100%',
          maxWidth: '320px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            ...hds.typeStyles.h2,
            color: 'var(--semantic-color-content-primary)',
            margin: 0,
          }}
        >
          /ops
        </h1>
        <p
          style={{
            ...hds.typeStyles.body,
            color: 'var(--semantic-color-content-secondary)',
            margin: 0,
          }}
        >
          Internal area. Enter the key to continue.
        </p>
        <input
          type="password"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError(null);
          }}
          aria-label="Ops gate key"
          style={{
            ...hds.typeStyles.body,
            padding: `var(--hds-space-sm) var(--hds-space-md)`,
            border: '1px solid var(--semantic-color-border-subdued)',
            borderRadius: 'var(--semantic-radius-action)',
            background: 'var(--semantic-color-surface-page)',
            color: 'var(--semantic-color-content-primary)',
          }}
        />
        {error && (
          <p
            role="alert"
            style={{
              ...hds.typeStyles.ui,
              color: 'var(--semantic-color-feedback-error)',
              margin: 0,
            }}
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={checking || input.length === 0}
          className="hds-focus"
          style={{ ...opsGateStyles.submitBtnBase, cursor: checking || input.length === 0 ? 'not-allowed' : 'pointer', opacity: checking || input.length === 0 ? 0.5 : 1 }}
        >
          {checking ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </main>
  );
}
