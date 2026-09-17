import { describe, it, expect, vi } from 'vitest';

import {
  missingEnvViolations,
  checkTasksEndpoint,
  checkSupabaseProjectStatus,
  runHealthCheck,
  DEFAULT_PROJECT_REF,
  OPS_BASE_URL_FIX,
  OPS_AGENT_KEY_FIX,
} from '../check-production-health.mjs';

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

describe('missingEnvViolations', () => {
  it('is empty when both required vars are set', () => {
    expect(missingEnvViolations({ OPS_BASE_URL: 'https://x.example', OPS_AGENT_KEY: 'k' })).toEqual(
      [],
    );
  });

  it('names OPS_BASE_URL and the fix when missing', () => {
    const out = missingEnvViolations({ OPS_AGENT_KEY: 'k' });
    expect(out).toHaveLength(1);
    expect(out[0].rule).toBe('missing-env-ops-base-url');
    expect(out[0].message).toBe(OPS_BASE_URL_FIX);
  });

  it('names OPS_AGENT_KEY and the fix when missing', () => {
    const out = missingEnvViolations({ OPS_BASE_URL: 'https://x.example' });
    expect(out).toHaveLength(1);
    expect(out[0].rule).toBe('missing-env-ops-agent-key');
    expect(out[0].message).toBe(OPS_AGENT_KEY_FIX);
  });

  it('reports both when neither is set', () => {
    expect(missingEnvViolations({})).toHaveLength(2);
  });
});

describe('checkTasksEndpoint', () => {
  const opts = {
    baseUrl: 'https://ops.example',
    agentKey: 'agent-key',
    projectRef: DEFAULT_PROJECT_REF,
  };

  it('is healthy when tasks has rows', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { tasks: [{ id: '1' }, { id: '2' }] }));
    const result = await checkTasksEndpoint({ ...opts, fetchImpl });
    expect(result).toEqual({
      ok: true,
      state: 'healthy',
      message: expect.stringContaining('2 task(s)'),
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://ops.example/api/tasks');
    expect(init.headers.Authorization).toBe('Bearer agent-key');
  });

  it('fails on the known-failing shape: 200 with { tasks: [] } when rows are expected', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { tasks: [] }));
    const result = await checkTasksEndpoint({ ...opts, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.state).toBe('empty');
    expect(result.message).toMatch(/paused Supabase/);
    expect(result.message).toContain(
      `https://supabase.com/dashboard/project/${DEFAULT_PROJECT_REF}`,
    );
  });

  it('fails on a non-200', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    const result = await checkTasksEndpoint({ ...opts, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.state).toBe('http_error');
    expect(result.message).toMatch(/HTTP 500/);
  });

  it.each([401, 403])(
    'names OPS_AGENT_KEY and both places to fix it on HTTP %i',
    async (status) => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue({ ok: false, status, json: () => Promise.resolve({}) });
      const result = await checkTasksEndpoint({ ...opts, fetchImpl });
      expect(result.ok).toBe(false);
      expect(result.state).toBe('unauthorized');
      expect(result.message).toContain('OPS_AGENT_KEY');
      expect(result.message).toContain(`HTTP ${status}`);
      expect(result.message).toContain(
        'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables',
      );
      expect(result.message).toContain('https://github.com/hirobius/ops/settings/secrets/actions');
    },
  );

  it('fails when the endpoint is unreachable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const result = await checkTasksEndpoint({ ...opts, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.state).toBe('unreachable');
    expect(result.message).toMatch(/fetch failed/);
  });

  it('fails on an unexpected body shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const result = await checkTasksEndpoint({ ...opts, fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.state).toBe('invalid_response');
  });

  it('strips a trailing slash from baseUrl', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { tasks: [{ id: '1' }] }));
    await checkTasksEndpoint({ ...opts, baseUrl: 'https://ops.example/', fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://ops.example/api/tasks');
  });
});

describe('checkSupabaseProjectStatus', () => {
  const projectRef = DEFAULT_PROJECT_REF;

  it('is skipped (not a violation) when no access token is set', async () => {
    const fetchImpl = vi.fn();
    const result = await checkSupabaseProjectStatus({
      projectRef,
      accessToken: undefined,
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    expect(result.state).toBe('skipped');
    expect(result.message).toMatch(/SUPABASE_ACCESS_TOKEN/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('is healthy on ACTIVE_HEALTHY', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'ACTIVE_HEALTHY' }));
    const result = await checkSupabaseProjectStatus({ projectRef, accessToken: 't', fetchImpl });
    expect(result).toEqual({
      ok: true,
      state: 'healthy',
      message: expect.stringContaining('ACTIVE_HEALTHY'),
    });
  });

  it('distinguishes INACTIVE with a resume link', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'INACTIVE' }));
    const result = await checkSupabaseProjectStatus({ projectRef, accessToken: 't', fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.state).toBe('inactive');
    expect(result.message).toMatch(/free-tier 7-day idle pause/);
    expect(result.message).toContain(`https://supabase.com/dashboard/project/${projectRef}`);
  });

  it('distinguishes COMING_UP', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'COMING_UP' }));
    const result = await checkSupabaseProjectStatus({ projectRef, accessToken: 't', fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.state).toBe('coming_up');
    expect(result.message).toMatch(/resuming from pause/);
  });

  it('distinguishes RESTORING', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'RESTORING' }));
    const result = await checkSupabaseProjectStatus({ projectRef, accessToken: 't', fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.state).toBe('restoring');
    expect(result.message).toMatch(/restoring from a backup\/pause/);
  });

  it('names the variable and the fix on an expired/invalid token', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, json: () => Promise.resolve({}) });
    const result = await checkSupabaseProjectStatus({ projectRef, accessToken: 'bad', fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.state).toBe('unauthorized');
    expect(result.message).toMatch(/SUPABASE_ACCESS_TOKEN/);
    expect(result.message).toMatch(/Rotate it/);
  });

  it('reports an unrecognized status as degraded', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { status: 'GOING_DOWN' }));
    const result = await checkSupabaseProjectStatus({ projectRef, accessToken: 't', fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.state).toBe('degraded');
    expect(result.message).toContain('GOING_DOWN');
  });
});

describe('runHealthCheck', () => {
  const baseEnv = { OPS_BASE_URL: 'https://ops.example', OPS_AGENT_KEY: 'agent-key' };

  it('reports no violations and does not notify when everything is healthy', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { tasks: [{ id: '1' }] }));
    const notify = vi.fn();
    const { violations, notified } = await runHealthCheck({ env: baseEnv, fetchImpl, notify });
    expect(violations).toEqual([]);
    expect(notified).toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });

  it('notifies with a violation summary when the tasks endpoint is empty', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { tasks: [] }));
    const notify = vi.fn().mockResolvedValue({ appended: {}, discord: { sent: true } });
    const { violations, notified } = await runHealthCheck({
      env: baseEnv,
      fetchImpl,
      notify,
      now: () => '2026-09-16T00:00:00.000Z',
    });
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('tasks-endpoint-empty');
    expect(notified).toEqual({ appended: {}, discord: { sent: true } });
    expect(notify).toHaveBeenCalledOnce();
    const [event] = notify.mock.calls[0];
    expect(event).toMatchObject({
      ts: '2026-09-16T00:00:00.000Z',
      kind: 'deploy_error',
      task: 'ops#347',
    });
    expect(event.detail).toMatch(/paused Supabase/);
  });

  it('collects violations from both checks', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { tasks: [] })) // tasks endpoint
      .mockResolvedValueOnce(jsonResponse(200, { status: 'INACTIVE' })); // supabase status
    const notify = vi.fn().mockResolvedValue({ appended: {}, discord: { sent: false } });
    const { violations } = await runHealthCheck({
      env: { ...baseEnv, SUPABASE_ACCESS_TOKEN: 't' },
      fetchImpl,
      notify,
    });
    expect(violations.map((v) => v.rule)).toEqual([
      'tasks-endpoint-empty',
      'supabase-project-inactive',
    ]);
  });
});
