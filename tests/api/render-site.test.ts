// @vitest-environment node
/**
 * lib/render + renderLeadSite — the Astro-cutover hand-off seam, tested with the
 * real vendored schema (no mocks: renderArtifacts must round-trip a genuine
 * ClientConfig through defineClient) and a stub Supabase client for the state
 * transition.
 */
import { describe, it, expect } from 'vitest';

import { renderArtifacts } from '../../lib/render/index.mjs';
import { renderLeadSite } from '../../lib/leads/pipeline.mjs';

/** Minimal valid ClientConfig (defaults fill the rest via defineClient). */
const CONFIG = {
  slug: 'pressure-pros',
  business: {
    name: 'Pressure Pros',
    phone: '+1-555-1234',
    email: 'info@pressurepros.com',
    hours: [{ days: 'Mon–Fri', hours: '8–6' }],
    serviceAreas: ['Austin'],
  },
  brand: { palettePreset: 'pressure-washing' },
  layout: {},
  services: [{ title: 'Driveway washing', description: 'We clean driveways.' }],
  copy: { heroHeadline: 'Austin Pressure Washing', heroSub: 'Spotless in a day.', about: 'Local & insured.' },
  form: { provider: 'web3forms', accessKey: 'abc123' },
  seo: {
    title: 'Pressure Washing in Austin',
    description: 'Top-rated pressure washing.',
    city: 'Austin',
    region: 'TX',
    siteUrl: 'https://pressurepros.com',
  },
};

function makeSb(opts: {
  lead: Record<string, unknown> | null;
  updateErrors?: Array<{ message: string } | null>;
}) {
  const { lead, updateErrors = [] } = opts;
  const updates: Array<Record<string, unknown>> = [];
  let i = 0;
  const sb = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                single: async () =>
                  lead ? { data: lead, error: null } : { data: null, error: { message: 'not found' } },
              };
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: async () => {
              updates.push(patch);
              return { error: updateErrors[i++] ?? null };
            },
          };
        },
      };
    },
  };
  return { sb: sb as never, updates };
}

describe('renderArtifacts', () => {
  it('emits the drop-in client.config.ts + scaffold commands', () => {
    const a = renderArtifacts(CONFIG);
    expect(a.slug).toBe('pressure-pros');
    expect(a.preset).toBe('pressure-washing');
    expect(a.configFile).toContain('import { defineClient } from "@hirobius/schema"');
    expect(a.configFile).toContain('"slug": "pressure-pros"');
    // defaults applied by the contract are baked into the emitted file
    expect(a.configFile).toContain('"font": "system"');
    expect(a.commands).toContain('pnpm new-client pressure-pros --name "Pressure Pros" --preset pressure-washing');
    expect(a.commands).toContain('apps/pressure-pros/client.config.ts');
  });

  it('throws readable zod issues on an invalid config', () => {
    expect(() => renderArtifacts({ slug: 'Bad Slug!' })).toThrow(/Invalid client config/);
  });
});

describe('renderLeadSite', () => {
  it('404s when the lead is missing', async () => {
    const { sb } = makeSb({ lead: null });
    expect(await renderLeadSite(sb, 'nope')).toEqual({ status: 404, body: { error: 'lead not found' } });
  });

  it('409s when the lead has no generated config', async () => {
    const { sb } = makeSb({ lead: { id: 'l1', status: 'sourced', config: null } });
    const r = await renderLeadSite(sb, 'l1');
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('NO_CONFIG');
  });

  it('422s (and changes nothing) when the stored config no longer validates', async () => {
    const { sb, updates } = makeSb({ lead: { id: 'l1', status: 'scored', config: { slug: 'Bad!' } } });
    const r = await renderLeadSite(sb, 'l1');
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('CONFIG_INVALID');
    expect(updates).toHaveLength(0);
  });

  it('returns artifacts read-only when no previewUrl is given', async () => {
    const { sb, updates } = makeSb({ lead: { id: 'l1', status: 'scored', config: CONFIG } });
    const r = await renderLeadSite(sb, 'l1');
    expect(r.status).toBe(200);
    expect(r.body.rendered).toBe(false);
    expect(r.body.slug).toBe('pressure-pros');
    expect(updates).toHaveLength(0); // no state change until the preview is live
  });

  it('flips to rendered + preview_url when the preview deploy is reported', async () => {
    const { sb, updates } = makeSb({ lead: { id: 'l1', status: 'scored', config: CONFIG } });
    const r = await renderLeadSite(sb, 'l1', { previewUrl: 'https://preview.vercel.app' });
    expect(r.status).toBe(200);
    expect(r.body.rendered).toBe(true);
    expect(updates).toEqual([{ status: 'rendered', preview_url: 'https://preview.vercel.app' }]);
  });

  it('500s when the rendered-state write fails', async () => {
    const { sb } = makeSb({
      lead: { id: 'l1', status: 'scored', config: CONFIG },
      updateErrors: [{ message: 'db down' }],
    });
    const r = await renderLeadSite(sb, 'l1', { previewUrl: 'https://preview.vercel.app' });
    expect(r).toEqual({ status: 500, body: { error: 'db down' } });
  });
});
