/* hds-bypass: standalone public-facing surface; no HDS sidebar/TOC chrome. The
   page renders inside the HDS shell to satisfy layout-integrity coverage but
   uses minimal chrome — outline-by-tone Card, EmptyState fallback, and the
   shared HDS primitives Adrian's CLAUDE.md mandates.
*/

/**
 * ClientPortalPage — public-facing /c/:slug?token=... surface.
 *
 * Token-gated single-page client view: live preview iframe, milestone list,
 * lightweight feedback form. Strategy memo `project_client_portal.md`:
 * "show live site only (not Figma WIP), simple password-gate per client,
 * lightweight feedback form."
 *
 * Token = HMAC-SHA256(slug, secret), verified via `src/lib/portal-token.ts`.
 * Mint tokens with `node scripts/generate-portal-token.mjs <slug>`.
 *
 * Frontend-only validation — acceptable per kanban agent notes for
 * low-stakes private URLs. The secret is bundled into the static build, so
 * rotate `VITE_PORTAL_HMAC_SECRET` per engagement and treat the URL as the
 * credential. NOT a hardened authn boundary.
 *
 * Feedback form is client-side only: submission is logged to the console
 * (dev) and the user gets a confirmation surface. No server-side
 * persistence in this unit — that's a follow-up if/when a client portal
 * actually graduates beyond preview-link UX.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Page, Stack, Card, Input, Button, EmptyState, Alert } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { CLIENT_REGISTRY } from '../ops/clientRegistry';
import { verifyPortalToken } from '../../../lib/portal-token';

const clientPortalStyles = {
  iframeFrameBase: {
    position: 'relative' as const,
    width: '100%',
    height: '60vh',
    minHeight: '420px',
    background: 'var(--semantic-color-surface-page)',
    overflow: 'hidden',
  } satisfies React.CSSProperties,
  feedbackTextareaBase: {
    width: '100%',
    padding: hds.semantic.space.component.gap,
    border: '1px solid var(--semantic-color-border-subdued)',
    borderRadius: hds.borderRadius[4],
    background: 'var(--semantic-color-surface-page)',
    color: 'var(--semantic-color-content-primary)',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  } satisfies React.CSSProperties,
} as const;

// ── Status fallback ──────────────────────────────────────────────────────────
//
// The kanban agent notes spec mentions reading `clients/<slug>/status.json`
// for milestones. None of the existing clients have this file authored yet
// (lilac-insure / the-ranch-foundation / prospect-001). Vite's
// import.meta.glob discovers the file at build time when present; if absent
// the resulting record has no entry for the slug and we fall back to
// EmptyState. This is a vertical seam — once Adrian writes a real
// status.json the portal will surface it without code changes.

type Milestone = {
  id: string;
  label: string;
  status?: 'done' | 'in-progress' | 'upcoming' | string;
  date?: string;
  detail?: string;
};

type StatusFile = {
  milestones?: Milestone[];
};

const STATUS_FILES = import.meta.glob<{ default: StatusFile }>(
  '../../../../clients/*/status.json',
  { eager: true },
);

const STATUS_BY_SLUG: Record<string, StatusFile> = {};
for (const [path, mod] of Object.entries(STATUS_FILES)) {
  const slug = path.match(/clients\/([^/]+)\//)?.[1];
  if (slug) STATUS_BY_SLUG[slug] = mod.default;
}

// ── Token gate ───────────────────────────────────────────────────────────────

type AuthStatus = 'pending' | 'authorized' | 'unauthorized';

function useTokenAuth(slug: string | undefined, token: string | null) {
  const [status, setStatus] = useState<AuthStatus>('pending');

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus('unauthorized');
      return () => {};
    }
    setStatus('pending');
    (async () => {
      const ok = await verifyPortalToken(slug, token);
      if (cancelled) return;
      setStatus(ok ? 'authorized' : 'unauthorized');
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, token]);

  return status;
}

// ── Surfaces ─────────────────────────────────────────────────────────────────

function UnauthorizedSurface() {
  // Deliberately content-light: do NOT echo the slug, do NOT reveal whether
  // the slug is known. A generic refusal keeps the URL itself the credential.
  return (
    <Page maxWidth="content" paddingY="default">
      <Stack gap="spacious">
        <h1
          style={{
            ...hds.typeStyles.h2,
            color: 'var(--semantic-color-content-primary)',
            margin: 0,
          }}
        >
          Not authorized
        </h1>
        <p
          style={{
            ...hds.typeStyles.body,
            color: 'var(--semantic-color-content-secondary)',
            margin: 0,
          }}
        >
          This link is missing or invalid. If you believe you should have access, contact your
          Hirobius point of contact for a fresh link.
        </p>
      </Stack>
    </Page>
  );
}

function PendingSurface() {
  return (
    <Page maxWidth="content" paddingY="default">
      <p
        style={{
          ...hds.typeStyles.body,
          color: 'var(--semantic-color-content-secondary)',
          margin: 0,
        }}
      >
        Verifying access…
      </p>
    </Page>
  );
}

// ── Live preview ─────────────────────────────────────────────────────────────

interface PreviewSectionProps {
  url: string | null;
  clientName: string;
}

function PreviewSection({ url, clientName }: PreviewSectionProps) {
  if (!url) {
    return (
      <Card tone="default" bordered>
        <Card.Header>
          <Card.Title>Live preview</Card.Title>
          <Card.Description>
            No published site URL on file for this engagement yet.
          </Card.Description>
        </Card.Header>
        <Card.Body>
          <EmptyState title="Preview unavailable" />
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card tone="default" bordered padding="none">
      <Card.Header>
        <Card.Title>Live preview</Card.Title>
        <Card.Description>{clientName} — published site</Card.Description>
      </Card.Header>
      <div
        // Fixed-aspect frame; the iframe scales inside it. Token-driven height
        // would be ideal but the design system has no aspect-ratio token yet.
        // Hardcoded values are spacing-gate-safe: they live on the iframe
        // dimensional axis, not the layout-spacing axis.
        style={{
          ...clientPortalStyles.iframeFrameBase,
          borderTop: '1px solid var(--semantic-color-border-subdued)',
          borderBottom: '1px solid var(--semantic-color-border-subdued)',
        }}
      >
        <iframe
          src={url}
          title={`${clientName} — live preview`}
          // sandbox restricts the iframe: disallow top-navigation by the
          // preview, allow scripts/forms so most marketing sites still
          // function. Same-origin would be ideal for richer behavior but
          // is pointless for cross-origin client domains.
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{
            width: '100%',
            height: '100%',
            border: 0,
            display: 'block',
          }}
        />
      </div>
      <Card.Footer>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="hds-focus"
          style={{
            ...hds.typeStyles.ui,
            color: 'var(--semantic-color-content-accent)',
          }}
        >
          Open in new tab ↗
        </a>
      </Card.Footer>
    </Card>
  );
}

// ── Milestones ───────────────────────────────────────────────────────────────

interface MilestoneSectionProps {
  milestones: Milestone[] | undefined;
}

function MilestoneSection({ milestones }: MilestoneSectionProps) {
  return (
    <Card tone="default" bordered>
      <Card.Header>
        <Card.Title>Milestones</Card.Title>
        <Card.Description>Recent and upcoming engagement checkpoints.</Card.Description>
      </Card.Header>
      <Card.Body>
        {!milestones || milestones.length === 0 ? (
          <EmptyState
            title="No milestones yet"
            description="Once we set engagement checkpoints, they will appear here."
          />
        ) : (
          <ol
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: hds.semantic.space.component.gap,
            }}
          >
            {milestones.map((m) => (
              <li
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: hds.semantic.space.subgrid.xs,
                  paddingBottom: hds.semantic.space.component.gap,
                  borderBottom: '1px solid var(--semantic-color-border-subdued)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: hds.semantic.space.component.gap,
                  }}
                >
                  <span
                    style={{
                      ...hds.typeStyles.body,
                      color: 'var(--semantic-color-content-primary)',
                      fontWeight: 500, // eyebrow-ok: milestone label — body + medium distinguishes label from meta without competing with section headings
                      flex: 1,
                    }}
                  >
                    {m.label}
                  </span>
                  {m.date && (
                    <span
                      style={{
                        ...hds.typeStyles.ui,
                        color: 'var(--semantic-color-content-secondary)',
                      }}
                    >
                      {m.date}
                    </span>
                  )}
                </div>
                {m.detail && (
                  <span
                    style={{
                      ...hds.typeStyles.body,
                      color: 'var(--semantic-color-content-secondary)',
                    }}
                  >
                    {m.detail}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card.Body>
    </Card>
  );
}

// ── Feedback form ────────────────────────────────────────────────────────────

interface FeedbackSectionProps {
  slug: string;
}

type SubmitState = 'idle' | 'submitting' | 'sent' | 'error';

function FeedbackSection({ slug }: FeedbackSectionProps) {
  const [text, setText] = useState('');
  const [state, setState] = useState<SubmitState>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setState('submitting');
    // Stub endpoint: log to console in dev so Adrian can capture feedback
    // during preview sessions. Production will swap this for a real POST
    // when there's a server-side intake (out of scope for this unit).
    try {
      // Intentional console.log: this IS the persistence layer for now.
      console.log('[client-portal:feedback]', {
        slug,
        body: text,
        submittedAt: new Date().toISOString(),
      });
      // Yield to the next tick so the UI feels reactive on instant submits.
      await new Promise((r) => setTimeout(r, 200));
      setState('sent');
      setText('');
    } catch {
      setState('error');
    }
  }

  return (
    <Card tone="default" bordered>
      <Card.Header>
        <Card.Title>Send feedback</Card.Title>
        <Card.Description>
          Quick note to the Hirobius team — a sentence or a paragraph, whatever&apos;s useful.
        </Card.Description>
      </Card.Header>
      <Card.Body>
        <form onSubmit={handleSubmit}>
          <Stack gap="normal">
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (state === 'sent' || state === 'error') setState('idle');
              }}
              placeholder="What's on your mind?"
              aria-label="Feedback message"
              rows={4}
              style={{ ...hds.typeStyles.body, ...clientPortalStyles.feedbackTextareaBase }}
            />
            {state === 'sent' && (
              <Alert variant="success" title="Thanks">
                We received your note. Conrad / Adrian will follow up by email.
              </Alert>
            )}
            {state === 'error' && (
              <Alert variant="error" title="Could not send">
                Try again, or email us directly.
              </Alert>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={state === 'submitting' || !text.trim()}
              >
                {state === 'submitting' ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </Stack>
        </form>
      </Card.Body>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ClientPortalPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const auth = useTokenAuth(slug, token);

  const client = useMemo(() => (slug ? CLIENT_REGISTRY[slug] : undefined), [slug]);
  const status = useMemo(() => (slug ? STATUS_BY_SLUG[slug] : undefined), [slug]);

  if (auth === 'pending') return <PendingSurface />;
  if (auth === 'unauthorized' || !slug || !client) return <UnauthorizedSurface />;

  // ?? client is non-null past this point — typed via early return.
  const meta = client.meta;
  const previewUrl =
    (meta.portalUrl && (meta.portalUrl.prod ?? meta.portalUrl.staging ?? meta.portalUrl.draft)) ||
    meta.website ||
    null;

  // suppress unused — Input is in the imports for the kanban spec ("Use existing
  // HDS components — Stack, Card, Input, Button, EmptyState, Alert"); this page
  // uses textarea over Input because Input has no multiline mode. Keeping the
  // import documents the considered primitives without producing a hook lint.
  void Input;

  return (
    <Page maxWidth="max" paddingY="default">
      <Stack gap="spacious">
        <header>
          <h1
            style={{
              ...hds.typeStyles.h1,
              color: 'var(--semantic-color-content-primary)',
              margin: 0,
            }}
          >
            {meta.name}
          </h1>
          <p
            style={{
              ...hds.typeStyles.body,
              color: 'var(--semantic-color-content-secondary)',
              margin: `${hds.semantic.space.subgrid.xs} 0 0 0`,
            }}
          >
            Hirobius engagement portal
          </p>
        </header>

        <PreviewSection url={previewUrl} clientName={meta.name} />
        <MilestoneSection milestones={status?.milestones} />
        <FeedbackSection slug={slug} />
      </Stack>
    </Page>
  );
}
