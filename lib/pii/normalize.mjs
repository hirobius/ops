/**
 * lib/pii/normalize — rewrite text into the forms a denylisted name is most
 * likely hiding in, keeping a map back to the original offsets.
 *
 * Raw-text matching misses a name that is percent-encoded in a URL, escaped in
 * JSON or HTML, accented or decomposed, split by a zero-width character, or
 * wrapped across `//`, ` * `, `#` or `>` lines. The detector scans the raw text
 * AND these copies, and reports every hit at its position in the raw text.
 *
 *   decoded   JSON/JS escapes (\n \uXXXX \xHH \/), HTML entities (&nbsp;
 *             &eacute; &#233;), percent-encoding; comment and quote prefixes
 *             removed at line starts; NFKD with combining marks and invisible
 *             format characters dropped (é → e, fullwidth j to j, soft hyphen → nothing).
 *             Decoded line breaks become spaces, so line numbers still hold.
 *   loosened  decoded, plus `-` `_` `.` `+` and camelCase boundaries turned
 *             into spaces — the slug, identifier and query-string forms, so an
 *             entry like `jane\s+example` also matches `jane-example`,
 *             `JaneExample` and `Jane+Example`.
 *
 * Pure: no I/O.
 *
 * @module pii/normalize
 */

/**
 * @typedef {object} NormalizedText
 * @property {string} text
 * @property {number[]} start  raw offset where the source of text[i] starts
 * @property {number[]} end    raw offset where the source of text[i] ends
 */

// Invisible format characters people (or editors) leave inside words: soft
// hyphen, combining grapheme joiner, zero-width space/joiners, bidi marks and
// isolates, word joiner, variation selectors, BOM.
const INVISIBLE =
  /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/;
const MARK = /\p{M}/u;
const LOWER = /\p{Ll}/u;
const UPPER = /\p{Lu}/u;

/**
 * A comment or quote marker opening a line (`//`, `/*`, `*`, `#`, `>`, `--`,
 * `;`, `<!--`) with the blanks around it. Plain indentation is left alone:
 * `\s` in an entry already spans it.
 */
const LINE_PREFIX = /[ \t]*(?:\/\/+|\/\*+|\*+|#+|>+|--+|;+|<!--)[ \t]*/y;

const BACKSLASH_SIMPLE = {
  n: ' ',
  r: ' ',
  t: ' ',
  f: ' ',
  b: ' ',
  v: ' ',
  '"': '"',
  "'": "'",
  '\\': '\\',
  '/': '/',
};

const NAMED_ENTITIES = {
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ndash: '-',
  mdash: '-',
  shy: '',
  zwj: '',
  zwnj: '',
  lrm: '',
  rlm: '',
};

/** `&eacute;`-style entities: base letter + combining mark (dropped later). */
const ENTITY_ACCENT = /^([A-Za-z])(?:acute|grave|circ|uml|tilde|cedil|ring|caron)$/;

const PERCENT_RUN = /(?:%[0-9A-Fa-f]{2})+/y;
const ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9A-Fa-f]{1,6})|([A-Za-z]{2,8}));/y;
const UNICODE_BRACED = /\\u\{([0-9A-Fa-f]{1,6})\}/y;
const UNICODE_4 = /\\u([0-9A-Fa-f]{4})/y;
const HEX_2 = /\\x([0-9A-Fa-f]{2})/y;

/**
 * @param {string} text
 * @param {{ loosen?: boolean }} [options]
 * @returns {NormalizedText}
 */
export function normalizeForMatching(text, { loosen = false } = {}) {
  const source = String(text ?? '');
  const out = [];
  const start = [];
  const end = [];
  let prevLower = false;

  const emitUnit = (unit, s, e) => {
    out.push(unit);
    start.push(s);
    end.push(e);
  };

  /** Emit already-decoded characters that came from source[s, e). */
  const emit = (chars, s, e, { decoded }) => {
    for (const cp of chars) {
      const code = cp.codePointAt(0);
      const parts = code < 0x80 ? cp : cp.normalize('NFKD');
      for (const part of parts) {
        const partCode = part.codePointAt(0);
        let c = part;
        if (partCode >= 0x80 && (MARK.test(part) || INVISIBLE.test(part))) continue;
        if (partCode < 0x20 && (decoded || part !== '\n')) c = ' ';
        if (loosen) {
          if (c === '-' || c === '_' || c === '.' || c === '+') c = ' ';
          else if (prevLower && UPPER.test(c)) emitUnit(' ', s, s);
          prevLower = LOWER.test(c);
        }
        for (let k = 0; k < c.length; k++) emitUnit(c[k], s, e);
      }
    }
  };

  let i = 0;
  let atLineStart = true;
  while (i < source.length) {
    if (atLineStart) {
      atLineStart = false;
      LINE_PREFIX.lastIndex = i;
      const prefix = LINE_PREFIX.exec(source);
      if (prefix && prefix[0].length > 0) {
        i += prefix[0].length;
        continue;
      }
    }

    const ch = source[i];
    if (ch === '\n') {
      emit('\n', i, i + 1, { decoded: false });
      i += 1;
      atLineStart = true;
      continue;
    }

    const decoded =
      (ch === '\\' && decodeBackslash(source, i)) ||
      (ch === '%' && decodePercent(source, i)) ||
      (ch === '&' && decodeEntity(source, i)) ||
      null;
    if (decoded) {
      emit(decoded.value, i, i + decoded.length, { decoded: true });
      i += decoded.length;
      continue;
    }

    const cp = String.fromCodePoint(source.codePointAt(i));
    emit(cp, i, i + cp.length, { decoded: false });
    i += cp.length;
  }

  return { text: out.join(''), start, end };
}

/**
 * The same folding applied to a denylist pattern's source, so `josé` in an
 * entry matches `jose` in a folded copy. Returns null when the folded source
 * does not compile (the raw pattern still runs on the raw text).
 *
 * @param {RegExp} regex
 * @returns {RegExp|null}
 */
export function foldPattern(regex) {
  const folded = [...regex.source.normalize('NFKD')]
    .filter((c) => c.codePointAt(0) < 0x80 || !(MARK.test(c) || INVISIBLE.test(c)))
    .join('');
  try {
    return new RegExp(folded, regex.flags);
  } catch {
    return null;
  }
}

// ── decoders: { value, length } or null ─────────────────────────────────────

function sticky(re, text, at) {
  re.lastIndex = at;
  return re.exec(text);
}

function fromCode(code) {
  if (!Number.isFinite(code) || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null;
  return String.fromCodePoint(code);
}

function decodeBackslash(text, at) {
  const braced = sticky(UNICODE_BRACED, text, at);
  if (braced) {
    const value = fromCode(parseInt(braced[1], 16));
    return value === null ? null : { value, length: braced[0].length };
  }
  const four = sticky(UNICODE_4, text, at);
  if (four) {
    // JSON writes astral characters as surrogate pairs: \ud83d\ude00.
    const code = parseInt(four[1], 16);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = sticky(UNICODE_4, text, at + 6);
      const lowCode = low ? parseInt(low[1], 16) : 0;
      if (lowCode >= 0xdc00 && lowCode <= 0xdfff) {
        return { value: String.fromCharCode(code, lowCode), length: 12 };
      }
      return null;
    }
    const value = fromCode(code);
    return value === null ? null : { value, length: 6 };
  }
  const hex = sticky(HEX_2, text, at);
  if (hex) return { value: String.fromCharCode(parseInt(hex[1], 16)), length: 4 };
  const simple = BACKSLASH_SIMPLE[text[at + 1]];
  return simple === undefined ? null : { value: simple, length: 2 };
}

function decodePercent(text, at) {
  const run = sticky(PERCENT_RUN, text, at);
  if (!run) return null;
  const bytes = run[0].match(/[0-9A-Fa-f]{2}/g).map((h) => parseInt(h, 16));
  return { value: Buffer.from(bytes).toString('utf8'), length: run[0].length };
}

function decodeEntity(text, at) {
  const m = sticky(ENTITY, text, at);
  if (!m) return null;
  let value = null;
  if (m[1] !== undefined) value = fromCode(parseInt(m[1], 10));
  else if (m[2] !== undefined) value = fromCode(parseInt(m[2], 16));
  else {
    const name = m[3].toLowerCase();
    if (Object.hasOwn(NAMED_ENTITIES, name)) value = NAMED_ENTITIES[name];
    else {
      const accent = ENTITY_ACCENT.exec(m[3]);
      if (accent) value = accent[1];
    }
  }
  return value === null ? null : { value, length: m[0].length };
}
