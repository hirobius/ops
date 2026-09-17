/**
 * lib/pii/detect — find personal data in a piece of text.
 *
 * Pure: no I/O, no git, no environment. Callers hand in text plus a path (or
 * any location label) and a parsed denylist; this returns findings.
 *
 * A finding carries a rule, a severity, a location and the LENGTH of the match
 * — never the matched value. That is the masking contract: hirobius/ops,
 * portal-kit and site-engine are public repos, so gate output lands in public
 * Actions logs, and a detector that echoed what it caught would publish the
 * very data it exists to keep out.
 *
 * @module pii/detect
 */

/**
 * @typedef {object} PiiFinding
 * @property {string} rule        'denylist' | 'private-url' | 'email' | 'phone'
 * @property {string} detail      which entry or pattern fired — safe to print
 * @property {'error'|'warn'} severity
 * @property {string} path        file path or location label supplied by the caller
 * @property {number} line        1-based
 * @property {number} column      1-based
 * @property {number} length      length of the (unprinted) match
 */

// ── Private workspace URLs (error) ───────────────────────────────────────────
//
// Links into a private workspace: a client's Google Doc, Drive folder, Chat
// room, mailbox, SharePoint tenant or Wix editor. The 2026-09-16 sweep found 50
// distinct such URLs in ops history with zero public-document false positives,
// so they block. A scheme is required: a bare host named in prose (like the
// list below) is not a link to anything.
//
// The rule detail names the product family only. The host is not printed:
// a SharePoint host is `<tenant>.sharepoint.com`, and the tenant is often the
// client's name.

const URL_TAIL = String.raw`/[^\s<>"'\x60)\]]*`;

/** @type {{ detail: string, regex: RegExp }[]} */
export const PRIVATE_URL_PATTERNS = [
  {
    detail: 'google-workspace',
    regex: new RegExp(
      String.raw`https?://(?:docs|drive|chat|mail|admin|calendar)\.google\.com` + URL_TAIL,
      'gi',
    ),
  },
  {
    detail: 'microsoft-365',
    regex: new RegExp(
      String.raw`https?://(?:outlook\.office(?:365)?\.com|outlook\.cloud\.microsoft|outlook\.live\.com|admin\.microsoft\.com|admin\.exchange\.microsoft\.com|portal\.azure\.com)` +
        URL_TAIL,
      'gi',
    ),
  },
  {
    detail: 'sharepoint',
    regex: new RegExp(String.raw`https?://[a-z0-9-]+\.sharepoint\.com` + URL_TAIL, 'gi'),
  },
  {
    detail: 'wix-editor',
    regex: new RegExp(String.raw`https?://(?:editor|manage)\.wix\.com` + URL_TAIL, 'gi'),
  },
];

// ── Email addresses (warn) ───────────────────────────────────────────────────
//
// REVIEWED CONSTANT. Every entry is an address that is public on purpose or
// cannot belong to a person. Adding a real client domain here would silence
// the gate for exactly the data it protects, so a change to this list needs
// the same review as a change to the gate.

export const EMAIL_ALLOWLIST = Object.freeze({
  /** The domain itself or any subdomain of it. */
  domains: Object.freeze([
    'hirobius.com', // the studio's own, intentionally public addresses
    'example.com', // RFC 2606 documentation domains
    'example.org',
    'example.net',
    'users.noreply.github.com', // GitHub commit-author placeholders
  ]),
  /** RFC 2606 / RFC 6761 reserved top-level domains: never deliverable. */
  reservedTlds: Object.freeze(['example', 'test', 'invalid', 'localhost']),
  /** Exact system sender addresses (tooling, CI, commit trailers). */
  addresses: Object.freeze([
    'noreply@anthropic.com', // Co-Authored-By trailers
    'noreply@github.com',
    'notifications@github.com',
    'git@github.com', // SSH remote URLs
    'npm-oidc-no-reply@github.com',
    'noreply@vercel.com',
    'notifications@vercel.com',
  ]),
});

/** File extensions that make `name@2x.png` an asset name, not an address. */
const ASSET_EXTENSIONS = new Set(
  'png jpg jpeg gif svg webp avif ico bmp tif tiff mp4 webm mov js mjs cjs ts tsx jsx css scss json map woff woff2 ttf otf'.split(
    ' ',
  ),
);

const EMAIL_REGEX = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/**
 * True when an address is on the reviewed allowlist.
 *
 * @param {string} address
 * @returns {boolean}
 */
export function isAllowedEmail(address) {
  const lower = String(address).toLowerCase();
  if (EMAIL_ALLOWLIST.addresses.includes(lower)) return true;
  const domain = lower.slice(lower.lastIndexOf('@') + 1);
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  if (EMAIL_ALLOWLIST.reservedTlds.includes(tld)) return true;
  return EMAIL_ALLOWLIST.domains.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** An `x@y.z` match that is really an address (not an asset or version string). */
function looksLikeAddress(candidate) {
  const domain = candidate.slice(candidate.lastIndexOf('@') + 1);
  const tld = domain.slice(domain.lastIndexOf('.') + 1).toLowerCase();
  return /^[a-z]{2,}$/.test(tld) && !ASSET_EXTENSIONS.has(tld);
}

// ── US phone numbers (warn) ──────────────────────────────────────────────────
//
// North American numbers in the written forms people paste:
//   (AAA) EEE-LLLL · AAA-EEE-LLLL · AAA.EEE.LLLL · +1 AAA EEE LLLL
// Area code and exchange start with 2-9 (NANP), dash/dot forms must use one
// separator consistently, and a bare space-separated triple is NOT accepted —
// that is how number lists and SVG path data look. International formats are
// out of scope: outreach is Washington State only (docs/prospecting/compliance.md).

const AREA = '[2-9]\\d{2}';
const PHONE_REGEX = new RegExp(
  [
    '(?<![\\w.+-])(?:',
    `\\+1[-. ]?(?:\\(${AREA}\\)[-. ]?|${AREA}[-. ])${AREA}[-. ]\\d{4}`,
    `|\\(${AREA}\\) ?${AREA}[-. ]\\d{4}`,
    `|${AREA}([-.])${AREA}\\1\\d{4}`,
    ')(?![\\w-]|\\.\\d)',
  ].join(''),
  'g',
);

/** Fictional or placeholder numbers the sweep filtered with zero real loss. */
function isPlaceholderPhone(match) {
  let digits = match.replace(/\D/g, '');
  if (match.trimStart().startsWith('+1')) digits = digits.slice(1);
  const area = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);
  return area === '555' || exchange === '555' || /^(\d)\1{9}$/.test(digits);
}

/**
 * Scan `text` for personal data.
 *
 * @param {string} text
 * @param {object} options
 * @param {string} options.path                     file path or location label
 * @param {import('./denylist.mjs').DenylistEntry[]} [options.denylist]
 * @param {number} [options.firstLine]              line number of the first line of `text` (default 1)
 * @returns {PiiFinding[]}
 */
export function detectPii(text, options) {
  const source = String(text ?? '');
  const { path, denylist = [], firstLine = 1 } = options;
  const lineStarts = indexLineStarts(source);
  const findings = [];

  for (const entry of denylist) {
    for (const match of matchesOf(entry.regex, source)) {
      findings.push(
        locate(
          {
            rule: 'denylist',
            detail:
              entry.source && entry.source !== 'inline'
                ? `denylist entry ${entry.index} (${entry.source})`
                : `denylist entry ${entry.index}`,
            severity: 'error',
            path,
          },
          match,
          lineStarts,
          firstLine,
        ),
      );
    }
  }

  if (isGenericExemptPath(path)) return findings;

  for (const { detail, regex } of PRIVATE_URL_PATTERNS) {
    for (const match of matchesOf(regex, source)) {
      findings.push(
        locate(
          { rule: 'private-url', detail, severity: 'error', path },
          match,
          lineStarts,
          firstLine,
        ),
      );
    }
  }

  for (const match of matchesOf(EMAIL_REGEX, source)) {
    const candidate = match.groups[0];
    if (!looksLikeAddress(candidate) || isAllowedEmail(candidate)) continue;
    findings.push(
      locate(
        { rule: 'email', detail: 'address outside the allowlist', severity: 'warn', path },
        match,
        lineStarts,
        firstLine,
      ),
    );
  }

  for (const match of matchesOf(PHONE_REGEX, source)) {
    if (isPlaceholderPhone(match.groups[0])) continue;
    findings.push(
      locate(
        { rule: 'phone', detail: 'US phone number', severity: 'warn', path },
        match,
        lineStarts,
        firstLine,
      ),
    );
  }

  return findings;
}

// ── Paths exempt from the generic patterns ───────────────────────────────────
//
// REVIEWED CONSTANT. The gate's own proof-of-firing fixtures and tests must
// contain synthetic URLs, addresses and phone numbers, or they could not prove
// anything. Lock/SBOM files carry package-maintainer addresses (the sweep's
// supply-chain false positives). The DENYLIST still applies on these paths —
// a real client name is never exempt anywhere.

export const GENERIC_EXEMPT_PATHS = Object.freeze([
  /^fixtures\/check-pii\//,
  /^scripts\/__tests__\/pii-[^/]*\.test\.mjs$/,
  /^pnpm-lock\.yaml$/,
  /^docs\/security\/sbom\.json$/,
]);

/**
 * True when `path` skips the generic (non-denylist) patterns.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isGenericExemptPath(path) {
  const normalized = String(path ?? '').replace(/\\/g, '/');
  return GENERIC_EXEMPT_PATHS.some((re) => re.test(normalized));
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Offsets at which each line of `text` starts. */
function indexLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

/** Every non-empty match of a global regex, as { index, length }. */
function* matchesOf(regex, text) {
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    yield { index: m.index, length: m[0].length, groups: m };
  }
}

/** Attach line/column/length to a partial finding. */
function locate(partial, match, lineStarts, firstLine) {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid] <= match.index) lo = mid;
    else hi = mid - 1;
  }
  return {
    ...partial,
    line: firstLine + lo,
    column: match.index - lineStarts[lo] + 1,
    length: match.length,
  };
}
