/**
 * OpsGate — server-side password gate wrapping all /ops/* routes.
 *
 * @category System
 * @tier utility
 * @internal — ops infrastructure, not a consumer-facing HDS component
 *
 * Auth is server-side: POST /api/ops-login checks the password against the
 * server-only OPS_GATE_PASSWORD and sets an httpOnly session cookie; GET
 * /api/ops-me reports whether that cookie is valid. The data/action api/ routes
 * enforce the same cookie, so this is a real gate — no client-bundled hash.
 */
/* hds-bypass: gate screen — 320px maxWidth is a fixed form measure, not a layout token */
// motion-ok: auth gate renders once and exits — CSS opacity transition on button is sufficient, no choreographed sequence needed
// ref-ok: OpsGate is a self-contained auth screen; the password input is internal state and not composable
import { useEffect, useState, type ReactNode } from 'react';
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

// Dev has no deployed api/ functions (the Vite middleware serves the data routes
// locally, unguarded), so bypass the gate in `pnpm dev`.
const DEV_BYPASS = import.meta.env.DEV;

interface OpsGateProps {
  children: ReactNode;
}

/**
 * Wraps `/ops/*` with a server-checked password gate.
 *
 * - In dev, always renders children (DEV_BYPASS).
 * - On mount, asks /api/ops-me whether a valid session cookie exists.
 * - Submitting the form POSTs to /api/ops-login; success sets the httpOnly cookie.
 */
export default function OpsGate({ children }: OpsGateProps) {
  // null = checking the session, true = authed, false = locked.
  const [authed, setAuthed] = useState<boolean | null>(DEV_BYPASS ? true : null);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // On mount, ask the server whether we already hold a valid session cookie.
  useEffect(() => {
    if (DEV_BYPASS) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/ops-me', { credentials: 'same-origin' });
        const data = (await res.json()) as { authed?: boolean };
        if (!cancelled) setAuthed(Boolean(data?.authed));
      } catch {
        if (!cancelled) setAuthed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (authed === true) return <>{children}</>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      const res = await fetch('/api/ops-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password: input }),
      });
      if (res.ok) {
        setAuthed(true);
      } else if (res.status === 503) {
        setError('Ops auth isn’t configured yet (set OPS_GATE_PASSWORD + OPS_SESSION_SECRET).');
        setInput('');
      } else {
        setError('Incorrect.');
        setInput('');
      }
    } catch {
      setError('Network error — try again.');
    } finally {
      setChecking(false);
    }
  }

  // Session check still in flight — brief placeholder, no gate flash.
  if (authed === null) {
    return (
      <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
        <p style={{ ...hds.typeStyles.ui, color: 'var(--semantic-color-content-secondary)', margin: 0 }}>
          Checking…
        </p>
      </main>
    );
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
          autoComplete="current-password"
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
          style={{
            ...opsGateStyles.submitBtnBase,
            cursor: checking || input.length === 0 ? 'not-allowed' : 'pointer',
            opacity: checking || input.length === 0 ? 0.5 : 1,
          }}
        >
          {checking ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </main>
  );
}
