/**
 * lib/pii/decode — read file bytes as text for the PII gate.
 *
 * Git calls any file with a NUL byte binary, and UTF-16 text is full of them.
 * Exported contact lists are often UTF-16 (Excel "Unicode text", PowerShell 5.1
 * `Out-File`), so a gate that skipped binary files skipped the likeliest way a
 * real list gets committed. This decodes UTF-8 and UTF-16 (by byte-order mark,
 * or by where the NULs sit) and returns null for anything else.
 *
 * @module pii/decode
 */

/** Bytes inspected to tell text from binary (git uses the same 8 KB window). */
const SNIFF_BYTES = 8000;

/**
 * @param {Uint8Array} bytes
 * @returns {string|null} the text, or null when the bytes are not UTF-8/UTF-16 text
 */
export function decodeText(bytes) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (startsWith(buf, [0xef, 0xbb, 0xbf])) return buf.subarray(3).toString('utf8');
  if (startsWith(buf, [0xff, 0xfe])) return buf.subarray(2).toString('utf16le');
  if (startsWith(buf, [0xfe, 0xff])) return utf16be(buf.subarray(2));

  const sample = buf.subarray(0, SNIFF_BYTES);
  if (!sample.includes(0)) return buf.toString('utf8');

  // BOM-less UTF-16: every NUL on one byte parity, and on a real share of it
  // (Latin text has a NUL in nearly every high byte).
  if (buf.length % 2 !== 0) return null;
  let evenNul = 0;
  let oddNul = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) {
      if (i % 2 === 0) evenNul += 1;
      else oddNul += 1;
    }
  }
  const pairs = Math.floor(sample.length / 2);
  if (evenNul === 0 && oddNul >= pairs * 0.25) return buf.toString('utf16le');
  if (oddNul === 0 && evenNul >= pairs * 0.25) return utf16be(buf);
  return null;
}

function startsWith(buf, prefix) {
  return buf.length >= prefix.length && prefix.every((byte, i) => buf[i] === byte);
}

function utf16be(buf) {
  const swapped = Buffer.from(buf.subarray(0, buf.length - (buf.length % 2)));
  return swapped.swap16().toString('utf16le');
}
