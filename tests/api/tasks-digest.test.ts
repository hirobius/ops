// @vitest-environment node
/**
 * lib/discord/tasks-digest.mjs — the pure formatters behind the Discord
 * bot's `!status`/`!recent`/`!backlog` shortcuts (ops#30). No network, no
 * Date.now() inside — every fixture supplies its own `now`.
 */
import { describe, it, expect } from 'vitest';
import {
  taskCategories,
  matchesCategory,
  summarizeTasks,
  deployAlertLine,
  formatStatusDigest,
  formatRecentDigest,
  formatLaneDigest,
} from '../../lib/discord/tasks-digest.mjs';

function task(overrides = {}) {
  return {
    key: 'github:hirobius/ops#1',
    source: 'github:hirobius/ops',
    title: 'Fix the thing',
    status: 'open',
    lane: 'ops',
    tags: [],
    updated_at: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('taskCategories / matchesCategory', () => {
  it('reads ready/needs-adrian/needs-human/backlog/parked off tags', () => {
    expect(taskCategories(task({ tags: ['ralph-ready'] }))).toEqual(['ready']);
    expect(taskCategories(task({ tags: ['needs-adrian'] }))).toEqual(['needs-adrian']);
    expect(taskCategories(task({ tags: ['needs-human'] }))).toEqual(['needs-human']);
    expect(taskCategories(task({ tags: ['backlog'] }))).toEqual(['backlog']);
    expect(taskCategories(task({ tags: ['ralph-parked'] }))).toEqual(['parked']);
  });

  it('treats status=blocked and the blocked tag as equivalent', () => {
    expect(taskCategories(task({ status: 'blocked' }))).toEqual(['blocked']);
    expect(taskCategories(task({ tags: ['blocked'] }))).toEqual(['blocked']);
  });

  it('a task can match more than one category', () => {
    expect(taskCategories(task({ tags: ['ralph-ready', 'backlog'] }))).toEqual(['ready', 'backlog']);
  });

  it("'all' always matches in matchesCategory", () => {
    expect(matchesCategory(task(), 'all')).toBe(true);
  });
});

describe('summarizeTasks', () => {
  it('counts open/blocked/done and buckets by lane with a ready count', () => {
    const tasks = [
      task({ key: 'a', lane: 'ops', tags: ['ralph-ready'] }),
      task({ key: 'b', lane: 'ops', status: 'blocked' }),
      task({ key: 'c', lane: 'hds', tags: ['ralph-ready'] }),
      task({ key: 'd', lane: 'hds', status: 'done' }),
    ];
    const s = summarizeTasks(tasks);
    expect(s.total).toBe(3); // done task excluded from "open" total
    expect(s.byStatus).toEqual({ open: 2, blocked: 1, done: 1 });
    expect(s.byCategory.ready).toBe(2);
    expect(s.byCategory.blocked).toBe(1);
    expect(s.byLane).toEqual(
      expect.arrayContaining([
        { lane: 'ops', count: 2, ready: 1 },
        { lane: 'hds', count: 1, ready: 1 },
      ]),
    );
  });
});

describe('deployAlertLine', () => {
  it('is null when nothing is failing', () => {
    expect(deployAlertLine([{ name: 'ops', latestDeployment: { state: 'READY' } }])).toBeNull();
    expect(deployAlertLine([])).toBeNull();
  });

  it('names every project with a failing deployment', () => {
    const projects = [
      { name: 'ops', latestDeployment: { state: 'ERROR' } },
      { name: 'hds', latestDeployment: { state: 'READY' } },
      { name: 'site-engine', latestDeployment: { state: 'ERROR' } },
    ];
    expect(deployAlertLine(projects)).toBe('🔴 **2 deploy(s) failing:** ops, site-engine');
  });
});

describe('formatStatusDigest', () => {
  it('renders git head, category counts, and a deploy alert', () => {
    const tasks = [task({ tags: ['ralph-ready'] }), task({ key: 'b', status: 'blocked' })];
    const projects = [{ name: 'ops', latestDeployment: { state: 'ERROR' } }];
    const text = formatStatusDigest({ tasks, projects, gitBranch: 'main', gitShort: 'abc123' });
    expect(text).toContain('`main` @ `abc123`');
    expect(text).toContain('ready: **1**');
    expect(text).toContain('blocked: **1**');
    expect(text).toContain('🔴 **1 deploy(s) failing:** ops');
  });
});

describe('formatRecentDigest', () => {
  const NOW = new Date('2026-07-13T00:00:00.000Z').getTime();

  it('filters to the window and sorts newest first', () => {
    const tasks = [
      task({ key: 'old', updated_at: '2026-06-01T00:00:00.000Z' }),
      task({ key: 'new', title: 'Newer thing', updated_at: '2026-07-12T00:00:00.000Z' }),
      task({ key: 'mid', title: 'Mid thing', updated_at: '2026-07-08T00:00:00.000Z' }),
    ];
    const text = formatRecentDigest(tasks, { days: 7, now: NOW });
    const newIdx = text.indexOf('Newer thing');
    const midIdx = text.indexOf('Mid thing');
    expect(newIdx).toBeGreaterThan(-1);
    expect(midIdx).toBeGreaterThan(newIdx);
    expect(text).not.toContain('old');
  });

  it('says so when nothing changed in the window', () => {
    const text = formatRecentDigest([task({ updated_at: '2020-01-01T00:00:00.000Z' })], { days: 7, now: NOW });
    expect(text).toBe('No task activity in the last 7 day(s).');
  });
});

describe('formatLaneDigest', () => {
  it('with no filter, digests ready tasks grouped by repo', () => {
    const tasks = [
      task({ key: 'a', lane: 'ops', tags: ['ralph-ready'] }),
      task({ key: 'b', lane: 'ops', status: 'blocked' }),
    ];
    const text = formatLaneDigest(tasks, '');
    expect(text).toContain('**ops** (1 ready)');
    expect(text).not.toContain('`github:hirobius/ops#1` — Fix the thing\n🔴');
  });

  it('filters by a known category keyword', () => {
    const tasks = [task({ key: 'a', status: 'blocked' }), task({ key: 'b', tags: ['ralph-ready'] })];
    const text = formatLaneDigest(tasks, 'blocked');
    expect(text).toContain('**Backlog: 1 task(s) — `blocked`**');
  });

  it('falls back to a fuzzy repo/lane match', () => {
    const tasks = [task({ key: 'a', lane: 'site-engine' })];
    const text = formatLaneDigest(tasks, 'site');
    expect(text).toContain('**site-engine**');
  });

  it('names the available repos when nothing matches', () => {
    const tasks = [task({ key: 'a', lane: 'ops' })];
    const text = formatLaneDigest(tasks, 'nope');
    expect(text).toContain('No repo matched `nope`');
    expect(text).toContain('`ops`');
  });
});
