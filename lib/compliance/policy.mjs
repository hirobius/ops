/**
 * lib/compliance/policy.mjs — renders the public privacy policy (ops#38).
 *
 * The policy text lives in docs/prospecting/privacy-policy.md so it can be
 * reviewed as a document. Everything that might change (entity, address,
 * privacy contact, retention window, effective date) is a {{TOKEN}} filled here
 * from lib/compliance/identity.mjs + retention.mjs, so none of it is restated.
 *
 * Pure: takes the template string, returns the page. No fs, so any surface
 * (the render script today, a web route later via `?raw`) can call it.
 */

import {
  LEGAL_ENTITY_NAME,
  MAILING_ADDRESS,
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_POLICY_URL,
} from './identity.mjs';
import { RETENTION_MONTHS } from './retention.mjs';

const TOKEN_RE = /\{\{([A-Z_]+)\}\}/g;
const BEGIN = '<!-- privacy-policy:begin -->';
const END = '<!-- privacy-policy:end -->';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {string} template  contents of docs/prospecting/privacy-policy.md
 * @param {{ effectiveDate?: string }} opts  effectiveDate as YYYY-MM-DD
 * @returns {string} publishable Markdown — only the text between the markers
 */
export function renderPrivacyPolicy(template, { effectiveDate } = {}) {
  if (!effectiveDate) {
    throw new Error('renderPrivacyPolicy: an effective date is required (YYYY-MM-DD).');
  }
  if (!DATE_RE.test(effectiveDate)) {
    throw new Error(`renderPrivacyPolicy: effective date "${effectiveDate}" must be YYYY-MM-DD.`);
  }

  const start = template.indexOf(BEGIN);
  const end = template.indexOf(END);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `renderPrivacyPolicy: template must wrap the policy in ${BEGIN} … ${END} ` +
        '(docs/prospecting/privacy-policy.md).',
    );
  }
  const body = template.slice(start + BEGIN.length, end).trim();

  const values = {
    LEGAL_ENTITY_NAME,
    MAILING_ADDRESS,
    PRIVACY_CONTACT_EMAIL,
    RETENTION_MONTHS: String(RETENTION_MONTHS),
    EFFECTIVE_DATE: effectiveDate,
  };
  return `${fillTokens(body, values)}\n`;
}

/**
 * The CAN-SPAM footer for cold outreach email (folds into #9). Pasted into the
 * Smartlead sequence template — CAN-SPAM requires, in every commercial email: a
 * valid physical postal address, a clear opt-out, and (for unsolicited mail) a
 * disclosure that the message is an advertisement.
 *
 * The opt-out is reply-based on purpose: Smartlead's unsubscribe-link merge tag
 * is unverified (lib/outreach/smartlead.mjs carries VERIFY markers), and a
 * reply works on any provider. Honoring it is the manual path in
 * docs/prospecting/compliance.md until the outreach webhook route exists.
 *
 * @param {{ policyUrl?: string|null }} [opts] defaults to PRIVACY_POLICY_URL
 * @returns {string} plain text, one line per requirement
 */
export function canSpamFooter({ policyUrl = PRIVACY_POLICY_URL } = {}) {
  const lines = [
    `This email is an advertisement from ${LEGAL_ENTITY_NAME}, ${MAILING_ADDRESS}.`,
    `To stop hearing from us, reply "unsubscribe" and we will not contact you again.`,
    `Questions about your information: ${PRIVACY_CONTACT_EMAIL}`,
  ];
  if (policyUrl) lines.push(`Privacy policy: ${policyUrl}`);
  return lines.join('\n');
}

/** Replace every {{TOKEN}}; an unknown token throws rather than publishing "undefined". */
function fillTokens(text, values) {
  return text.replace(TOKEN_RE, (_match, key) => {
    const value = values[key];
    if (value === undefined || value === null || value === '') {
      throw new Error(
        `privacy policy: no value for {{${key}}} — add it to lib/compliance/identity.mjs ` +
          'and the renderer, or remove it from the template.',
      );
    }
    return value;
  });
}
