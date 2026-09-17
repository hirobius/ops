/**
 * lib/compliance/identity.mjs — THE one place the business identity lives
 * (ops#38, facts supplied by Adrian 2026-09-16).
 *
 * Every privacy/outreach surface reads these constants rather than restating
 * them: the public privacy policy (docs/prospecting/privacy-policy.md, rendered
 * by lib/compliance/policy.mjs), the CAN-SPAM outreach footer, and the
 * privacy-request tool (scripts/privacy-request.mjs).
 *
 * To change the privacy contact (planned: a dedicated privacy inbox), edit
 * PRIVACY_CONTACT_EMAIL below and re-render the page and footer:
 *   node scripts/render-privacy-policy.mjs --effective-date <YYYY-MM-DD>
 *   node scripts/render-privacy-policy.mjs --footer
 * scripts/__tests__/privacy-policy.test.mjs fails if any of those surfaces
 * hardcodes an address instead.
 */

/** Legal entity name. CAN-SPAM requires the sender to be identifiable. */
export const LEGAL_ENTITY_NAME = 'Hirobius LLC';

/** Physical postal address. CAN-SPAM requires one in every commercial email. */
export const MAILING_ADDRESS = '44 W 29th Ave, Spokane, WA 99203';

/** Where privacy requests (know / delete / correct / opt out) go. Monitored by a human. */
export const PRIVACY_CONTACT_EMAIL = 'adrian@hirobius.com';

/**
 * Public URL of the published privacy policy, or null until it is hosted.
 * hirobius.com is a Squarespace site that is currently set to Private, so there
 * is no public home yet. See ops#38.
 */
export const PRIVACY_POLICY_URL = null;
