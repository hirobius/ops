/**
 * lib/pii/detect.mjs — the pure PII detector behind scripts/check-pii.mjs.
 *
 * Every value here is synthetic ("Jane Example", example.com, 555 numbers, the
 * unassigned 999 area code). The real denylist never enters the repo: it is
 * loaded at runtime from the PII_DENYLIST secret or the gitignored
 * .pii-denylist file (ops#27).
 */
import { describe, it, expect } from 'vitest';
import { detectPii } from '../../lib/pii/detect.mjs';
import { parseDenylist } from '../../lib/pii/denylist.mjs';

const denylist = parseDenylist('# synthetic\njane\\s+example\nexample client co\n').entries;

describe('detectPii — denylist terms', () => {
  it('reports a denylist hit as an error with its location, never the matched value', () => {
    const findings = detectPii('Intro line\nCall Jane  Example tomorrow.', {
      path: 'docs/notes.md',
      denylist,
    });
    expect(findings).toEqual([
      {
        rule: 'denylist',
        detail: 'denylist entry 2',
        severity: 'error',
        path: 'docs/notes.md',
        line: 2,
        column: 6,
        length: 13,
      },
    ]);
    expect(JSON.stringify(findings)).not.toMatch(/jane/i);
  });

  it('matches case-insensitively and across a wrapped line', () => {
    const findings = detectPii('We met JANE\nexample at the office.', { path: 'a.md', denylist });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'denylist', line: 1, column: 8 });
  });

  it('offsets line numbers when scanning a block that starts mid-file', () => {
    const findings = detectPii('ok\nExample Client Co invoice', {
      path: 'b.md',
      denylist,
      firstLine: 40,
    });
    expect(findings[0]).toMatchObject({ detail: 'denylist entry 3', line: 41, column: 1 });
  });
});

describe('detectPii — private workspace URLs', () => {
  const rulesFor = (text) =>
    detectPii(text, { path: 'x.md' }).map((f) => `${f.severity}:${f.rule}:${f.detail}`);

  it('flags Google Docs, Drive and Chat links as errors', () => {
    expect(rulesFor('Spec: https://docs.google.com/document/d/SYNTHETIC-DOC-ID/edit')).toEqual([
      'error:private-url:google-workspace',
    ]);
    expect(rulesFor('<https://drive.google.com/drive/folders/SYNTHETIC-FOLDER>')).toEqual([
      'error:private-url:google-workspace',
    ]);
    expect(rulesFor('thread https://chat.google.com/room/SYNTHETIC')).toEqual([
      'error:private-url:google-workspace',
    ]);
  });

  it('flags Outlook/Microsoft 365 admin, SharePoint and Wix editor links as errors', () => {
    expect(rulesFor('https://outlook.office.com/mail/inbox/id/SYNTHETIC')).toEqual([
      'error:private-url:microsoft-365',
    ]);
    expect(rulesFor('https://admin.microsoft.com/#/users')).toEqual([
      'error:private-url:microsoft-365',
    ]);
    expect(rulesFor('https://example-tenant.sharepoint.com/sites/Shared')).toEqual([
      'error:private-url:sharepoint',
    ]);
    expect(rulesFor('https://manage.wix.com/dashboard/SYNTHETIC')).toEqual([
      'error:private-url:wix-editor',
    ]);
  });

  it('reports the URL position and length, not its host or path', () => {
    const [finding] = detectPii('see https://docs.google.com/spreadsheets/d/SYNTHETIC', {
      path: 'x.md',
    });
    expect(finding).toMatchObject({ line: 1, column: 5, length: 48 });
    expect(JSON.stringify(finding)).not.toMatch(/docs\.google|SYNTHETIC/);
  });

  it('does not flag public Google URLs or a bare host name in prose', () => {
    expect(rulesFor('https://www.google.com/maps/place/Seattle')).toEqual([]);
    expect(rulesFor('Links to docs.google.com are blocked by this gate.')).toEqual([]);
    expect(rulesFor('https://fonts.google.com/specimen/Inter')).toEqual([]);
  });
});

describe('detectPii — email addresses', () => {
  const emails = (text) =>
    detectPii(text, { path: 'x.ts' })
      .filter((f) => f.rule === 'email')
      .map((f) => ({ severity: f.severity, column: f.column, length: f.length }));

  it('warns on an address outside the allowlist, reporting position and length only', () => {
    expect(emails('owner: jane.example@fictional-client.biz')).toEqual([
      { severity: 'warn', column: 8, length: 33 },
    ]);
  });

  it('allows the reviewed allowlist: hirobius.com, reserved example domains and system senders', () => {
    const allowed = [
      'studio@hirobius.com',
      'jane@example.com',
      'jane@example.org',
      'jane@mail.example.net',
      'jane@clinic.example',
      'jane@site.test',
      'jane@nowhere.invalid',
      '12345+someone@users.noreply.github.com',
      'Co-Authored-By: Claude <noreply@anthropic.com>',
      'git@github.com:hirobius/ops.git',
      'npm-oidc-no-reply@github.com',
      'noreply@vercel.com',
    ];
    for (const text of allowed) expect(emails(text), text).toEqual([]);
  });

  it('does not let a look-alike domain borrow the allowlist', () => {
    expect(emails('jane@nothirobius.com')).toHaveLength(1);
    expect(emails('jane@example.com.fictional-client.biz')).toHaveLength(1);
    expect(emails('jane@github.com')).toHaveLength(1);
  });

  it('ignores asset file names that only look like addresses', () => {
    expect(emails('logo@2x.png hero@sprite.svg icon@3x.webp')).toEqual([]);
  });
});

// 999 is an unassigned North American area code, so these numbers are
// real-format but reach no one.
describe('detectPii — US phone numbers', () => {
  const phones = (text) =>
    detectPii(text, { path: 'x.md' })
      .filter((f) => f.rule === 'phone')
      .map((f) => ({ severity: f.severity, column: f.column, length: f.length }));

  it('warns on the common written formats', () => {
    expect(phones('Call (999) 234-5678.')).toEqual([{ severity: 'warn', column: 6, length: 14 }]);
    expect(phones('cell 999-234-5678')).toEqual([{ severity: 'warn', column: 6, length: 12 }]);
    expect(phones('999.234.5678')).toEqual([{ severity: 'warn', column: 1, length: 12 }]);
    expect(phones('tel:+1 999 234 5678')).toEqual([{ severity: 'warn', column: 5, length: 15 }]);
    expect(phones('+1-999-234-5678')).toEqual([{ severity: 'warn', column: 1, length: 15 }]);
  });

  it('skips fictional placeholders: the 555 exchange, the 555 area code, repeated digits', () => {
    expect(phones('(206) 555-0100, 206-555-0142, 555-234-5678, 222-222-2222')).toEqual([]);
  });

  it('does not read dates, ids, versions or number lists as phone numbers', () => {
    const notPhones = [
      '2026-09-16T05:48:04Z',
      '123-456-7890',
      'grid 250 300 1000',
      '12999-234-5678',
      '999-234.5678',
      'v999.234.5678',
      'order 999-234-56789',
      '(000) 000-0000',
    ];
    for (const text of notPhones) expect(phones(text), text).toEqual([]);
  });
});

describe('detectPii — paths exempt from the generic patterns', () => {
  const text =
    'Jane Example https://docs.google.com/document/d/SYNTHETIC jane@fictional-client.biz';

  it("skips generic patterns in the gate's own synthetic fixtures and tests", () => {
    for (const path of [
      'fixtures/check-pii/violating.example.json',
      'scripts/__tests__/pii-detect.test.mjs',
      'scripts\\__tests__\\pii-cli.test.mjs',
    ]) {
      const rules = detectPii(text, { path }).map((f) => f.rule);
      expect(rules, path).toEqual([]);
    }
  });

  it('still applies the denylist there: a real client name is never exempt', () => {
    const rules = detectPii(text, {
      path: 'fixtures/check-pii/passing.example.json',
      denylist,
    }).map((f) => f.rule);
    expect(rules).toEqual(['denylist']);
  });

  it('does not exempt look-alike paths elsewhere', () => {
    const rules = detectPii(text, { path: 'docs/fixtures/check-pii/notes.md' }).map((f) => f.rule);
    expect(rules).toEqual(['private-url', 'email']);
  });
});
