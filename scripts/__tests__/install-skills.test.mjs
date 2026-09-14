import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installSkill } from '../install-skills.mjs';

let cleanup = [];
afterEach(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true });
  cleanup = [];
  vi.unstubAllGlobals();
});

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'install-skills-'));
  cleanup.push(dir);
  return dir;
}

function stubFetch(content) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('installSkill', () => {
  const content = Buffer.from('demo skill content\n');
  const hash = createHash('sha256').update(content).digest('hex');
  const baseEntry = {
    source: 'owner/repo',
    sourceType: 'github',
    skillPath: 'skills/demo/SKILL.md',
    pinnedCommit: 'deadbeef',
    computedHash: hash,
  };

  it('fetches, verifies, and writes the skill when the hash matches', async () => {
    const root = tmp();
    const fetchMock = stubFetch(content);

    const result = await installSkill('demo', baseEntry, root);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://raw.githubusercontent.com/owner/repo/deadbeef/skills/demo/SKILL.md',
    );
    expect(result.files).toEqual(['SKILL.md']);
    const written = readFileSync(join(root, '.claude', 'skills', 'demo', 'SKILL.md'));
    expect(written.equals(content)).toBe(true);
  });

  it('throws and writes nothing when the fetched hash does not match computedHash', async () => {
    const root = tmp();
    stubFetch(Buffer.from('unexpected content\n'));

    await expect(installSkill('demo', baseEntry, root)).rejects.toThrow(/mismatch/);
    expect(() => readFileSync(join(root, '.claude', 'skills', 'demo', 'SKILL.md'))).toThrow();
  });

  it('throws an actionable error when pinnedCommit is missing', async () => {
    const root = tmp();
    const entryWithoutPin = { ...baseEntry };
    delete entryWithoutPin.pinnedCommit;
    await expect(installSkill('demo', entryWithoutPin, root)).rejects.toThrow(/pinnedCommit/);
  });

  it('throws for an unsupported sourceType', async () => {
    const root = tmp();
    await expect(
      installSkill('demo', { ...baseEntry, sourceType: 'gitlab' }, root),
    ).rejects.toThrow(/unsupported sourceType/);
  });
});
