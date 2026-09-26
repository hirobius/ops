/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * PitchPage — /ops/pitch. The call sheet.
 *
 * Built for a partner working through businesses on a phone, not for an
 * operator at a desk. That shapes every choice here:
 *
 *   - The phone number is a `tel:` link, big enough to hit while standing up.
 *   - The site being pitched opens in one tap, because that is the pitch.
 *   - Stage moves are one tap, and "Pitched" asks how — phone or email — so
 *     the record says what actually happened.
 *   - Notes are a log, newest first. A second person picking up a lead needs
 *     what was said, not a field somebody overwrote.
 *
 * Deliberately NOT a CRM. No pipelines, no custom fields, no automation. GHL
 * exists for that; this exists so two people can work one list without calling
 * the same business twice.
 *
 * Only pitchable leads appear: `preview_url` present (there is something to
 * show) and `do_not_contact` false. Both are enforced in SQL and re-checked on
 * every write, so a queue left open in a tab cannot contact someone who opted
 * out since it loaded.
 *
 * Marking a lead pitched stamps `contacted_at` + `contact_channel` — the
 * evidence the #321 tripwire is evaluated on.
 */

import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Badge, Button } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from '../PageHeader';
import { usePoll } from '../../../lib/usePoll';

const POLL_MS = 45_000;

type Stage = 'queued' | 'sent' | 'replied' | 'won' | 'lost';

const STAGE_LABEL: Record<string, string> = {
  queued: 'To pitch',
  sent: 'Pitched',
  replied: 'Replied',
  won: 'Won',
  lost: 'Lost',
  bounced: 'Bounced',
};

const STAGE_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  queued: 'neutral',
  sent: 'info',
  replied: 'warning',
  won: 'success',
  lost: 'danger',
  bounced: 'danger',
};

interface PitchNote {
  id: string;
  created_at: string;
  author: string;
  body: string;
}

interface GbpGap {
  gap: string;
  evidence: string;
  line: string;
}

interface PitchLead {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
  lead_score: number | null;
  preview_url: string | null;
  outreach_status: string | null;
  contacted_at: string | null;
  contact_channel: string | null;
  assigned_to: string | null;
  next_action_at: string | null;
  /** Only the ?pitch=1 shape carries these; treat as optional at the edge. */
  notes?: PitchNote[];
  /** The lead's strongest Google Business Profile gap (ops#413), or null when
   * it has none — an opening line for the call, never a dial-pressure prompt. */
  gbp_gap?: GbpGap | null;
}

interface PitchResponse {
  leads: PitchLead[];
  summary: { total: number; toPitch: number; inPlay: number; won: number; closed: number };
}

async function fetchPitch(signal: AbortSignal): Promise<PitchResponse> {
  const res = await fetch('/api/leads?pitch=1', { signal });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  if (!body || typeof body !== 'object' || !Array.isArray((body as PitchResponse).leads)) {
    throw new Error('GET /api/leads?pitch=1 returned 200 with a body that is not the queue.');
  }
  return body as PitchResponse;
}

async function post(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/lead-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error:
          body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
            ? body.error
            : `HTTP ${res.status}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** "3 days ago" — a partner cares how stale a lead is, not the exact stamp. */
function ago(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '';
  const d = Math.floor(ms / 86_400_000);
  if (d > 0) return `${d}d ago`;
  const h = Math.floor(ms / 3_600_000);
  if (h > 0) return `${h}h ago`;
  return 'just now';
}

export default function PitchPage() {
  const { data, error, refetch } = usePoll<PitchResponse>(fetchPitch, {
    intervalMs: POLL_MS,
    offlineIntervalMs: POLL_MS * 3,
    requestTimeoutMs: 15_000,
  });

  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [mine, setMine] = useState(false);
  const [who, setWho] = useState('');

  // Memoised so the `shown` filter below does not re-run on every render just
  // because `?? []` produced a fresh array reference.
  const leads = useMemo(() => data?.leads ?? [], [data]);
  const summary = data?.summary;
  const loaded = data !== null;

  const shown = useMemo(
    () => (mine && who.trim() ? leads.filter((l) => l.assigned_to === who.trim()) : leads),
    [leads, mine, who],
  );

  const run = useCallback(
    async (leadId: string, payload: Record<string, unknown>, okText: string) => {
      setBusy((p) => new Set(p).add(leadId));
      const result = await post({ leadId, ...payload });
      setBusy((p) => {
        const n = new Set(p);
        n.delete(leadId);
        return n;
      });
      if (result.ok) {
        setNote({ text: okText, ok: true });
        refetch();
      } else {
        setNote({ text: result.error ?? 'action failed', ok: false });
      }
    },
    [refetch],
  );

  return (
    <div style={s.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Pitch' }]}
        title="Pitch"
        lede="Businesses with a site built and ready to show. Work top to bottom."
      />

      {summary ? (
        <p style={s.summary}>
          <strong style={s.strong}>{summary.toPitch}</strong> to pitch ·{' '}
          <strong style={s.strong}>{summary.inPlay}</strong> in play ·{' '}
          <strong style={s.strong}>{summary.won}</strong> won · {summary.closed} closed
        </p>
      ) : null}

      <div style={s.whoRow}>
        <input
          id="pitch-who"
          style={s.input}
          placeholder="Your name (goes on your notes)"
          value={who}
          onChange={(e) => setWho(e.target.value)}
        />
        <label style={s.check} htmlFor="pitch-mine">
          <input
            id="pitch-mine"
            type="checkbox"
            checked={mine}
            onChange={(e) => setMine(e.target.checked)}
          />
          Only mine
        </label>
      </div>

      {note ? (
        <p style={note.ok ? s.noteOk : s.noteBad} role="status">
          {note.text}
        </p>
      ) : null}

      {error && !loaded ? (
        <p style={s.notice}>Couldn’t reach /api/leads — {error}</p>
      ) : !loaded ? (
        <p style={s.notice}>Loading the queue…</p>
      ) : shown.length === 0 ? (
        <p style={s.notice}>
          {leads.length === 0
            ? 'Nothing to pitch yet. A business appears here once its site is built — generate and render one on the Leads board.'
            : 'Nothing assigned to that name yet.'}
        </p>
      ) : (
        <ul style={s.list}>
          {shown.map((lead) => {
            const stage = (lead.outreach_status ?? 'queued') as Stage;
            const working = busy.has(lead.id);
            return (
              <li key={lead.id} style={s.card}>
                <div style={s.cardTop}>
                  <span style={s.name}>{lead.name ?? 'Unnamed business'}</span>
                  <Badge tone={STAGE_TONE[stage] ?? 'neutral'}>{STAGE_LABEL[stage] ?? stage}</Badge>
                </div>

                <div style={s.meta}>
                  {[lead.city, lead.region].filter(Boolean).join(', ')}
                  {lead.lead_score != null ? ` · score ${lead.lead_score}` : ''}
                  {lead.assigned_to ? ` · ${lead.assigned_to}` : ''}
                  {lead.contacted_at
                    ? ` · pitched ${ago(lead.contacted_at)}${
                        lead.contact_channel ? ` by ${lead.contact_channel}` : ''
                      }`
                    : ''}
                </div>

                {lead.gbp_gap ? <p style={s.openingLine}>{lead.gbp_gap.line}</p> : null}

                <div style={s.actions}>
                  {lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="hds-focus" style={s.callBtn}>
                      Call {lead.phone}
                    </a>
                  ) : (
                    <span style={s.noPhone}>no phone on file</span>
                  )}
                  {lead.preview_url ? (
                    <a
                      href={lead.preview_url}
                      target="_blank"
                      rel="noreferrer"
                      className="hds-focus"
                      style={s.siteBtn}
                    >
                      Their site
                    </a>
                  ) : null}
                </div>

                <div style={s.stageRow}>
                  {stage === 'queued' ? (
                    <>
                      <Button
                        size="sm"
                        disabled={working}
                        onClick={() =>
                          run(
                            lead.id,
                            { action: 'pitch_stage', stage: 'sent', channel: 'phone' },
                            `Marked pitched by phone — ${lead.name ?? 'lead'}`,
                          )
                        }
                      >
                        Pitched by phone
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={working}
                        onClick={() =>
                          run(
                            lead.id,
                            { action: 'pitch_stage', stage: 'sent', channel: 'email' },
                            `Marked pitched by email — ${lead.name ?? 'lead'}`,
                          )
                        }
                      >
                        by email
                      </Button>
                    </>
                  ) : null}
                  {stage === 'sent' ? (
                    <Button
                      size="sm"
                      disabled={working}
                      onClick={() =>
                        run(
                          lead.id,
                          { action: 'pitch_stage', stage: 'replied' },
                          `Marked replied — ${lead.name ?? 'lead'}`,
                        )
                      }
                    >
                      They replied
                    </Button>
                  ) : null}
                  {stage === 'sent' || stage === 'replied' ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={working}
                        onClick={() =>
                          run(
                            lead.id,
                            { action: 'pitch_stage', stage: 'won' },
                            `Won — ${lead.name ?? 'lead'}`,
                          )
                        }
                      >
                        Won
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={working}
                        onClick={() =>
                          run(
                            lead.id,
                            { action: 'pitch_stage', stage: 'lost' },
                            `Lost — ${lead.name ?? 'lead'}`,
                          )
                        }
                      >
                        Lost
                      </Button>
                    </>
                  ) : null}
                  {!lead.assigned_to && who.trim() ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={working}
                      onClick={() =>
                        run(
                          lead.id,
                          { action: 'pitch_assign', assignee: who.trim() },
                          `Assigned to ${who.trim()}`,
                        )
                      }
                    >
                      Take it
                    </Button>
                  ) : null}
                </div>

                <div style={s.noteBox}>
                  <textarea
                    id={`note-${lead.id}`}
                    style={s.textarea}
                    rows={2}
                    placeholder="What was said…"
                    value={drafts[lead.id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [lead.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={working || !(drafts[lead.id] ?? '').trim()}
                    onClick={async () => {
                      await run(
                        lead.id,
                        {
                          action: 'pitch_note',
                          note: drafts[lead.id],
                          author: who.trim() || 'unknown',
                        },
                        'Note saved',
                      );
                      setDrafts((d) => ({ ...d, [lead.id]: '' }));
                    }}
                  >
                    Add note
                  </Button>
                </div>

                {(lead.notes ?? []).length > 0 ? (
                  <ol style={s.notes}>
                    {(lead.notes ?? []).slice(0, 4).map((n) => (
                      <li key={n.id} style={s.noteRow}>
                        <span style={s.noteMeta}>
                          {n.author} · {ago(n.created_at)}
                        </span>
                        <span style={s.noteBody}>{n.body}</span>
                      </li>
                    ))}
                    {(lead.notes ?? []).length > 4 ? (
                      <li style={s.noteMeta}>+{(lead.notes ?? []).length - 4} earlier</li>
                    ) : null}
                  </ol>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px20,
    maxWidth: '760px',
    margin: '0 auto',
    padding: hds.space.px24,
  },
  summary: {
    ...hds.typeStyles.bodySmall,
    margin: 0,
    color: 'var(--semantic-color-content-secondary)',
  },
  strong: { color: 'var(--semantic-color-content-primary)', fontWeight: 600 },
  whoRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: hds.space.px8,
  },
  input: {
    ...hds.typeStyles.body,
    flex: '1 1 220px',
    minWidth: 0,
    padding: hds.space.px8,
    borderRadius: hds.borderRadius.sm,
    border: '1px solid var(--semantic-color-border-default)',
    background: 'var(--semantic-color-surface-base)',
    color: 'var(--semantic-color-content-primary)',
  },
  check: {
    ...hds.typeStyles.bodySmall,
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px6,
    color: 'var(--semantic-color-content-secondary)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px12,
  },
  card: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
    padding: hds.space.px16,
    borderRadius: hds.borderRadius.md,
    border: '1px solid var(--semantic-color-border-default)',
    background: 'var(--semantic-color-surface-raised)',
  },
  cardTop: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: hds.space.px8,
  },
  name: { ...hds.typeStyles.h3, margin: 0, color: 'var(--semantic-color-content-primary)' },
  meta: { ...hds.typeStyles.caption, color: 'var(--semantic-color-content-secondary)' },
  openingLine: {
    ...hds.typeStyles.bodySmall,
    margin: 0,
    padding: hds.space.px8,
    borderRadius: hds.borderRadius.sm,
    borderLeft: '3px solid var(--semantic-color-content-accent)',
    background: 'var(--semantic-color-surface-base)',
    color: 'var(--semantic-color-content-primary)',
  },
  actions: { display: 'flex', flexWrap: 'wrap' as const, gap: hds.space.px8 },
  callBtn: {
    ...hds.typeStyles.label,
    flex: '1 1 auto',
    textAlign: 'center' as const,
    padding: `${hds.space.px12} ${hds.space.px16}`,
    borderRadius: hds.borderRadius.sm,
    background: 'var(--semantic-color-content-accent)',
    color: 'var(--semantic-color-content-on)',
    textDecoration: 'none',
  },
  siteBtn: {
    ...hds.typeStyles.label,
    padding: `${hds.space.px12} ${hds.space.px16}`,
    borderRadius: hds.borderRadius.sm,
    border: '1px solid var(--semantic-color-border-default)',
    color: 'var(--semantic-color-content-primary)',
    textDecoration: 'none',
  },
  noPhone: { ...hds.typeStyles.caption, color: 'var(--semantic-color-content-tertiary)' },
  stageRow: { display: 'flex', flexWrap: 'wrap' as const, gap: hds.space.px6 },
  noteBox: { display: 'flex', flexDirection: 'column' as const, gap: hds.space.px6 },
  textarea: {
    ...hds.typeStyles.bodySmall,
    width: '100%',
    padding: hds.space.px8,
    borderRadius: hds.borderRadius.sm,
    border: '1px solid var(--semantic-color-border-default)',
    background: 'var(--semantic-color-surface-base)',
    color: 'var(--semantic-color-content-primary)',
    resize: 'vertical' as const,
  },
  notes: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px6,
    borderTop: '1px solid var(--semantic-color-border-subtle)',
    paddingTop: hds.space.px8,
  },
  noteRow: { display: 'flex', flexDirection: 'column' as const, gap: hds.space.px2 },
  noteMeta: { ...hds.typeStyles.caption, color: 'var(--semantic-color-content-tertiary)' },
  noteBody: { ...hds.typeStyles.bodySmall, color: 'var(--semantic-color-content-primary)' },
  noteOk: {
    ...hds.typeStyles.bodySmall,
    margin: 0,
    padding: hds.space.px8,
    borderRadius: hds.borderRadius.sm,
    borderLeft: '3px solid var(--semantic-color-feedback-success)',
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-primary)',
  },
  noteBad: {
    ...hds.typeStyles.bodySmall,
    margin: 0,
    padding: hds.space.px8,
    borderRadius: hds.borderRadius.sm,
    borderLeft: '3px solid var(--semantic-color-feedback-error)',
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-primary)',
  },
  notice: {
    ...hds.typeStyles.bodySmall,
    margin: 0,
    color: 'var(--semantic-color-content-secondary)',
    maxWidth: '60ch',
  },
} satisfies Record<string, CSSProperties>;
