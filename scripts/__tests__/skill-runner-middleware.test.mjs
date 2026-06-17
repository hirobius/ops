/**
 * Tests for scripts/skill-runner-middleware.mjs
 *
 * Covers:
 *   - resolveArgv: pure argv-template substitution + input-required guard
 *   - parseInputBody: 8 KiB cap, JSON parse, empty-body back-compat
 *   - createSkillRunnerMiddleware: end-to-end wiring with injected spawn
 */

import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import {
  resolveArgv,
  parseInputBody,
  createSkillRunnerMiddleware,
  BODY_BYTE_CAP,
} from '../skill-runner-middleware.mjs';

// ── resolveArgv (pure) ────────────────────────────────────────────────────────

describe('resolveArgv', () => {
  it('returns argv unchanged when spec has no ${input} placeholder and no input', () => {
    const spec = { argv: ['pnpm', 'closure:plan'], timeoutMs: 1000 };
    expect(resolveArgv(spec, undefined)).toEqual({ argv: ['pnpm', 'closure:plan'] });
  });

  it('ignores provided input when spec has no placeholder (back-compat)', () => {
    const spec = { argv: ['pnpm', 'closure:plan'], timeoutMs: 1000 };
    expect(resolveArgv(spec, 'ignored')).toEqual({ argv: ['pnpm', 'closure:plan'] });
  });

  it('substitutes ${input} when spec has placeholder and input provided', () => {
    const spec = { argv: ['node', 'scripts/page-clone.mjs', '${input}'], timeoutMs: 1000 };
    expect(resolveArgv(spec, 'https://example.com')).toEqual({
      argv: ['node', 'scripts/page-clone.mjs', 'https://example.com'],
    });
  });

  it('substitutes every occurrence across argv items', () => {
    const spec = { argv: ['node', 'x.mjs', '--in', '${input}', '--label', '${input}'], timeoutMs: 1000 };
    expect(resolveArgv(spec, 'foo')).toEqual({
      argv: ['node', 'x.mjs', '--in', 'foo', '--label', 'foo'],
    });
  });

  it('returns 400 error when placeholder present but input is missing (undefined)', () => {
    const spec = { argv: ['node', 'x.mjs', '${input}'], timeoutMs: 1000 };
    const r = resolveArgv(spec, undefined);
    expect(r.argv).toBeUndefined();
    expect(r.error).toEqual({ status: 400, body: { ok: false, error: 'input required' } });
  });

  it('returns 400 error when placeholder present but input is empty string', () => {
    const spec = { argv: ['node', 'x.mjs', '${input}'], timeoutMs: 1000 };
    const r = resolveArgv(spec, '');
    expect(r.error?.status).toBe(400);
  });

  it('does not interpret shell metacharacters — input passed as raw argv element', () => {
    const spec = { argv: ['node', 'x.mjs', '${input}'], timeoutMs: 1000 };
    const r = resolveArgv(spec, '; rm -rf /');
    expect(r.argv).toEqual(['node', 'x.mjs', '; rm -rf /']);
  });
});

// ── parseInputBody ────────────────────────────────────────────────────────────

function fakeReq(chunks) {
  const r = new Readable({ read() {} });
  for (const c of chunks) r.push(Buffer.from(c));
  r.push(null);
  return r;
}

describe('parseInputBody', () => {
  it('resolves with input=undefined when body is empty', async () => {
    const r = await parseInputBody(fakeReq([]));
    expect(r).toEqual({ input: undefined });
  });

  it('parses JSON body and returns input string', async () => {
    const r = await parseInputBody(fakeReq([JSON.stringify({ input: 'foo' })]));
    expect(r).toEqual({ input: 'foo' });
  });

  it('returns 413 error when body exceeds BODY_BYTE_CAP', async () => {
    const big = 'x'.repeat(BODY_BYTE_CAP + 1);
    const r = await parseInputBody(fakeReq([JSON.stringify({ input: big })]));
    expect(r.input).toBeUndefined();
    expect(r.error?.status).toBe(413);
  });

  it('returns 400 error when body is not valid JSON', async () => {
    const r = await parseInputBody(fakeReq(['{not-json']));
    expect(r.error?.status).toBe(400);
  });

  it('returns input=undefined when JSON body lacks "input" field', async () => {
    const r = await parseInputBody(fakeReq([JSON.stringify({ other: 'x' })]));
    expect(r).toEqual({ input: undefined });
  });
});

// ── createSkillRunnerMiddleware (integration with injected spawn) ─────────────

function fakeRes() {
  const headers = {};
  let statusCode = 200;
  let body = '';
  return {
    setHeader(k, v) {
      headers[k] = v;
    },
    set statusCode(v) {
      statusCode = v;
    },
    get statusCode() {
      return statusCode;
    },
    end(s) {
      body = s ?? '';
      this._done = true;
    },
    _read() {
      return { statusCode, headers, body };
    },
  };
}

function fakeProc({ code = 0, stdout = '', stderr = '' } = {}) {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = () => {};
  setImmediate(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', code);
  });
  return proc;
}

describe('createSkillRunnerMiddleware', () => {
  it('responds 403 for unknown skill id', async () => {
    const calls = [];
    const spawn = (cmd, args) => {
      calls.push({ cmd, args });
      return fakeProc();
    };
    const mw = createSkillRunnerMiddleware({ cwd: '/tmp', spawn });
    const req = Object.assign(fakeReq([]), { method: 'POST', url: '/no-such-skill' });
    const res = fakeRes();
    const next = () => {};
    await new Promise((resolve) => {
      res.end = function (s) {
        this.body = s ?? '';
        this._done = true;
        resolve();
      };
      mw(req, res, next);
    });
    expect(res.statusCode).toBe(403);
    expect(calls).toHaveLength(0); // spawn not called
  });

  it('runs whitelisted skill with unchanged argv when spec has no placeholder', async () => {
    const calls = [];
    const spawn = (cmd, args) => {
      calls.push({ cmd, args });
      return fakeProc({ code: 0, stdout: 'ok' });
    };
    const mw = createSkillRunnerMiddleware({ cwd: '/tmp', spawn });
    const req = Object.assign(fakeReq([]), { method: 'POST', url: '/strength' });
    const res = fakeRes();
    await new Promise((resolve) => {
      res.end = function (s) {
        this.body = s ?? '';
        resolve();
      };
      mw(req, res, () => {});
    });
    expect(res.statusCode).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('pnpm');
    expect(calls[0].args).toEqual(['strength']);
  });

  it('substitutes ${input} from JSON body for placeholder-bearing specs', async () => {
    const calls = [];
    const spawn = (cmd, args) => {
      calls.push({ cmd, args });
      return fakeProc({ code: 0, stdout: 'done' });
    };
    const mw = createSkillRunnerMiddleware({
      cwd: '/tmp',
      spawn,
      // Test-only extra skill containing a placeholder. Real registrations
      // ship in dependent tasks; this fixture proves the wiring.
      extraSkills: {
        'echo-input': {
          argv: ['node', '-e', 'console.log("${input}")', '${input}'],
          timeoutMs: 1000,
        },
      },
    });
    const req = Object.assign(fakeReq([JSON.stringify({ input: 'hello' })]), {
      method: 'POST',
      url: '/echo-input',
      headers: { 'content-type': 'application/json' },
    });
    const res = fakeRes();
    await new Promise((resolve) => {
      res.end = function (s) {
        this.body = s ?? '';
        resolve();
      };
      mw(req, res, () => {});
    });
    expect(res.statusCode).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toEqual(['-e', 'console.log("hello")', 'hello']);
  });

  it('returns 400 when a placeholder-bearing skill is fired without input', async () => {
    const calls = [];
    const spawn = (cmd, args) => {
      calls.push({ cmd, args });
      return fakeProc();
    };
    const mw = createSkillRunnerMiddleware({
      cwd: '/tmp',
      spawn,
      extraSkills: {
        'needs-input': { argv: ['node', 'x.mjs', '${input}'], timeoutMs: 1000 },
      },
    });
    const req = Object.assign(fakeReq([]), { method: 'POST', url: '/needs-input' });
    const res = fakeRes();
    await new Promise((resolve) => {
      res.end = function (s) {
        this.body = s ?? '';
        resolve();
      };
      mw(req, res, () => {});
    });
    expect(res.statusCode).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('returns 413 when request body exceeds the cap', async () => {
    const calls = [];
    const spawn = (cmd, args) => {
      calls.push({ cmd, args });
      return fakeProc();
    };
    const mw = createSkillRunnerMiddleware({ cwd: '/tmp', spawn });
    const huge = JSON.stringify({ input: 'x'.repeat(BODY_BYTE_CAP + 1) });
    const req = Object.assign(fakeReq([huge]), { method: 'POST', url: '/strength' });
    const res = fakeRes();
    await new Promise((resolve) => {
      res.end = function (s) {
        this.body = s ?? '';
        resolve();
      };
      mw(req, res, () => {});
    });
    expect(res.statusCode).toBe(413);
    expect(calls).toHaveLength(0);
  });
});
