import { describe, it, expect } from 'vitest';
import {
  runAudit,
  classifyPr,
  buildViolations,
  APPROVE_LABEL,
} from '../audit-ralph-merge-boundary.mjs';

const NOW = Date.parse('2026-10-01T00:00:00Z');

/** A minimal `fetch`-shaped stub: search returns `items`, files returns `filesByPr[n]`. */
function fakeFetch({ items, filesByPr = {}, failFilesFor = new Set(), capFilesFor = new Set() }) {
  return async (url) => {
    if (url.includes('/search/issues')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ items }),
      };
    }
    const m = /\/pulls\/(\d+)\/files/.exec(url);
    const number = Number(m[1]);
    if (failFilesFor.has(number)) {
      return { ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) };
    }
    const page = Number(/[?&]page=(\d+)/.exec(url)?.[1] ?? '1');
    if (capFilesFor.has(number)) {
      // Every page comes back full (100 filler files) up to GitHub's cap.
      const files = Array.from({ length: 100 }, (_, i) => ({
        filename: `docs/filler-${page}-${i}.md`,
      }));
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => files };
    }
    const all = filesByPr[number] ?? [];
    const files = page === 1 ? all.map((filename) => ({ filename })) : [];
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => files };
  };
}

const searchItem = ({ number, labels = [] }) => ({
  number,
  pull_request: { merged_at: '2026-09-16T12:00:00Z' },
  labels: labels.map((name) => ({ name })),
});

describe('audit-ralph-merge-boundary: runAudit (no network — stubbed fetch)', () => {
  it('does not report a merged PR carrying ralph-approved', async () => {
    const fetchImpl = fakeFetch({
      items: [searchItem({ number: 1, labels: [APPROVE_LABEL] })],
      filesByPr: { 1: ['lib/leads/pipeline.mjs'] },
    });
    const result = await runAudit({ repo: 'hirobius/ops', token: 't', now: NOW, fetchImpl });
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('does not report a PR touching only unsupervised files', async () => {
    const fetchImpl = fakeFetch({
      items: [searchItem({ number: 2 })],
      filesByPr: { 2: ['docs/ai/HANDOFF.md', 'src/app/pages/ops/StandingPage.tsx'] },
    });
    const result = await runAudit({ repo: 'hirobius/ops', token: 't', now: NOW, fetchImpl });
    expect(result.violations).toEqual([]);
  });

  it('reports a PR whose file list cannot be read (API error) as unknown, never clean', async () => {
    const fetchImpl = fakeFetch({
      items: [searchItem({ number: 3 })],
      failFilesFor: new Set([3]),
    });
    const result = await runAudit({ repo: 'hirobius/ops', token: 't', now: NOW, fetchImpl });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].rule).toBe('MERGE_BOUNDARY_DIFF_UNREADABLE');
    expect(result.violations[0].severity).toBe('warn');
    expect(result.ok).toBe(false);
  });

  it('reports a PR that hits the 3000-file cap as unknown, never clean', async () => {
    const fetchImpl = fakeFetch({
      items: [searchItem({ number: 4 })],
      capFilesFor: new Set([4]),
    });
    const result = await runAudit({ repo: 'hirobius/ops', token: 't', now: NOW, fetchImpl });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].rule).toBe('MERGE_BOUNDARY_DIFF_UNREADABLE');
  });

  it('reports an unattended merge of a supervised path with mergedAt and files (PR 368 / PR 362 shape)', async () => {
    const fetchImpl = fakeFetch({
      items: [searchItem({ number: 368 }), searchItem({ number: 362 })],
      filesByPr: {
        368: ['api/lead-action.ts', 'lib/leads/pipeline.mjs'],
        362: [
          'api/lead-action.ts',
          'lib/leads/pipeline.mjs',
          'src/app/pages/ops/leads/LeadsPage.tsx',
        ],
      },
    });
    const result = await runAudit({ repo: 'hirobius/ops', token: 't', now: NOW, fetchImpl });
    expect(result.violations.map((v) => v.pr).sort()).toEqual([362, 368]);
    for (const v of result.violations) {
      expect(v.rule).toBe('MERGE_BOUNDARY_UNATTENDED_MERGE');
      expect(v.mergedAt).toBe('2026-09-16T12:00:00Z');
      expect(v.supervisedFiles.length).toBeGreaterThan(0);
    }
  });
});

describe('audit-ralph-merge-boundary: classifyPr / buildViolations (pure)', () => {
  it('classifies a boundary-self-file edit as a violation too, not only revenue-path', () => {
    const c = classifyPr({
      number: 5,
      mergedAt: '2026-09-17T00:00:00Z',
      labels: [],
      files: ['scripts/ralph-watchdog.mjs'],
      diffUnreadable: null,
    });
    expect(c.status).toBe('violation');
    expect(buildViolations([c])).toHaveLength(1);
  });
});
