/**
 * lib/pii/decode.mjs — reading file bytes as text for the PII gate. Exported
 * contact lists are often UTF-16 (Excel "Unicode text", PowerShell 5.1
 * Out-File); git calls those binary, so without decoding they were never
 * scanned. All data here is synthetic.
 */
import { describe, it, expect } from 'vitest';
import { decodeText } from '../../lib/pii/decode.mjs';

const TEXT = 'name,email\r\nJane Example,jane@example.com\r\n';

describe('decodeText', () => {
  it('reads plain and BOM-prefixed UTF-8', () => {
    expect(decodeText(Buffer.from(TEXT, 'utf8'))).toBe(TEXT);
    expect(decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(TEXT)]))).toBe(
      TEXT,
    );
  });

  it('reads UTF-16LE and UTF-16BE by their byte-order mark', () => {
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(TEXT, 'utf16le')]);
    expect(decodeText(le)).toBe(TEXT);
    const be = Buffer.from(Buffer.from(TEXT, 'utf16le')).swap16();
    expect(decodeText(Buffer.concat([Buffer.from([0xfe, 0xff]), be]))).toBe(TEXT);
  });

  it('recognises BOM-less UTF-16 by where its NUL bytes sit', () => {
    expect(decodeText(Buffer.from(TEXT, 'utf16le'))).toBe(TEXT);
    expect(decodeText(Buffer.from(Buffer.from(TEXT, 'utf16le')).swap16())).toBe(TEXT);
  });

  it('returns null for real binary content', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49]);
    expect(decodeText(png)).toBeNull();
    expect(decodeText(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0, 0x08, 0]))).toBeNull();
  });
});
