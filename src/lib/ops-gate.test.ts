import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  getStoredAccess,
  setStoredAccess,
  clearStoredAccess,
  OPS_GATE_TTL_MS,
} from './ops-gate';

describe('hashPassword', () => {
  it('returns a 64-character lowercase hex SHA-256', async () => {
    const hash = await hashPassword('hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('returns different hashes for different inputs', async () => {
    expect(await hashPassword('a')).not.toBe(await hashPassword('b'));
  });
});

describe('verifyPassword', () => {
  it('returns true when password hashes to expected', async () => {
    const expected = await hashPassword('open-sesame');
    expect(await verifyPassword('open-sesame', expected)).toBe(true);
  });

  it('returns false on mismatch', async () => {
    const expected = await hashPassword('open-sesame');
    expect(await verifyPassword('wrong', expected)).toBe(false);
  });

  it('returns false when expected is empty', async () => {
    expect(await verifyPassword('open-sesame', '')).toBe(false);
  });
});

describe('localStorage helpers', () => {
  let store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('setStoredAccess writes timestamp; getStoredAccess returns true within TTL', () => {
    setStoredAccess();
    expect(getStoredAccess()).toBe(true);
  });

  it('getStoredAccess returns false when nothing stored', () => {
    expect(getStoredAccess()).toBe(false);
  });

  it('getStoredAccess returns false after TTL expires', () => {
    setStoredAccess();
    vi.advanceTimersByTime(OPS_GATE_TTL_MS + 1);
    expect(getStoredAccess()).toBe(false);
  });

  it('clearStoredAccess removes the key', () => {
    setStoredAccess();
    clearStoredAccess();
    expect(getStoredAccess()).toBe(false);
  });

  it('getStoredAccess returns false on malformed value', () => {
    setStoredAccess();
    // overwrite the just-written key with garbage; key inferred from mock state
    const writtenKey = Object.keys(store)[0];
    expect(writtenKey).toBeDefined();
    localStorage.setItem(writtenKey!, 'not-a-number');
    expect(getStoredAccess()).toBe(false);
  });
});
