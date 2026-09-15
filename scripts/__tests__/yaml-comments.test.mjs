import { describe, it, expect } from 'vitest';
import { stripYamlComments } from '../lib/yaml-comments.mjs';

describe('stripYamlComments', () => {
  it('strips a full-line comment', () => {
    expect(stripYamlComments('# just a note\nrun: echo hi')).toBe('\nrun: echo hi');
  });

  it('strips an indented comment', () => {
    expect(stripYamlComments('    # indented note')).toBe('');
  });

  it('strips a trailing comment but keeps the code before it', () => {
    expect(stripYamlComments('run: node scripts/foo.mjs  # why')).toBe('run: node scripts/foo.mjs');
  });

  it('keeps a # inside double quotes', () => {
    expect(stripYamlComments('run: echo "a # b"')).toBe('run: echo "a # b"');
  });

  it('keeps a # inside single quotes', () => {
    expect(stripYamlComments("run: echo 'a # b'")).toBe("run: echo 'a # b'");
  });

  it('strips a trailing comment that follows a quoted string', () => {
    expect(stripYamlComments('run: echo "hi"  # trailing')).toBe('run: echo "hi"');
  });

  it('leaves a real gate invocation intact', () => {
    const yml = 'jobs:\n  q:\n    steps:\n      - run: node scripts/audit-sbom.mjs --json';
    expect(stripYamlComments(yml)).toContain('scripts/audit-sbom.mjs');
  });

  // The ops#262 regression: a prose comment naming a gate script was read as
  // live wiring by check-validator-wiring's substring matcher, producing a
  // warn-severity WIRING_DRIFT that blocked every commit in the repo.
  it('does not leave a gate script name behind when it appears only in a comment', () => {
    const yml = [
      'jobs:',
      '  quality:',
      '    steps:',
      '      # audit-sbom was dropped here in #260 — see the registry instead',
      '      - run: node scripts/run-gates.mjs --channel ci-pr',
    ].join('\n');
    expect(stripYamlComments(yml)).not.toContain('audit-sbom');
    expect(stripYamlComments(yml)).toContain('run-gates.mjs --channel ci-pr');
  });

  it('is a no-op on content with no comments', () => {
    expect(stripYamlComments('a: 1\nb: 2')).toBe('a: 1\nb: 2');
  });
});
