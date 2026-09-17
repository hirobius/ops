/**
 * scripts/lib/private-bookmark-filter.mjs
 *
 * Links that never belong in the tracked bookmark exports under docs/knowledge/
 * (ops#27): private workspace documents and chats, logged-in admin consoles,
 * an employer's internal source hosting, private design files, links carrying
 * an account or user identifier, and personal profiles of named people.
 * scripts/parse-bookmarks.mjs drops these before writing, so a re-run cannot
 * put them back. Generic patterns only; nothing here names a client.
 */

export const PRIVATE_BOOKMARK_PATTERNS = [
  // Private workspace documents, notebooks and AI chats
  /^https?:\/\/(docs|drive|chat|mail|admin|calendar|sites|keep)\.google\.com\//i,
  /^https?:\/\/aistudio\.google\.com\/prompts\/(?!new_chat)/i,
  /^https?:\/\/notebooklm\.google\.com\/notebook\//i,
  /^https?:\/\/gemini\.google\.com\/(app|gem)\/[0-9a-z]/i,
  /^https?:\/\/stitch\.withgoogle\.com\/projects\//i,
  /^https?:\/\/(www\.)?chatgpt\.com\/(c|g|share)\//i,
  /^https?:\/\/claude\.ai\/(chat|project|share)\//i,
  // Logged-in admin consoles and dashboards
  /^https?:\/\/[^/]+\.squarespace\.com\/config/i,
  /^https?:\/\/merchants\.google\.com\/mc\//i,
  /^https?:\/\/analytics\.google\.com\/analytics\/web\//i,
  /^https?:\/\/search\.google\.com\/search-console/i,
  /^https?:\/\/console\.cloud\.google\.com\//i,
  /^https?:\/\/supabase\.com\/dashboard\/project\//i,
  /^https?:\/\/(www\.)?cargocollective\.com\/[^/]+\/admin/i,
  /^https?:\/\/(editor|manage)\.wix\.com\//i,
  /^https?:\/\/(admin\.microsoft\.com|admin\.exchange\.microsoft\.com|portal\.azure\.com)\//i,
  /^https?:\/\/(outlook\.office(365)?\.com|outlook\.live\.com|outlook\.cloud\.microsoft)\//i,
  /^https?:\/\/(tasks\.office\.com|planner\.cloud\.microsoft)\//i,
  /^https?:\/\/[^/]+\.sharepoint\.com\//i,
  /^https?:\/\/studio\.youtube\.com\//i,
  // An employer's internal source hosting
  /^https?:\/\/[^/]+\.visualstudio\.com\//i,
  /^https?:\/\/dev\.azure\.com\//i,
  // Private design files and hosted prototypes
  /^https?:\/\/(www\.)?figma\.com\/files\/team\//i,
  /^https?:\/\/app\.paper\.design\/file\//i,
  /^https?:\/\/(www\.)?magicpath\.ai\/files\//i,
  /^https?:\/\/cloud\.protopie\.io\/p\//i,
  /^https?:\/\/(www\.)?recraft\.ai\/project\//i,
  // Account or user identifiers in the query string
  /[?&](fuid|account_key|token|access_token|auth_token|sig|signature)=/i,
  // Email-subscriber tracking tokens that identify the recipient
  /[?&](_kx|mc_eid|_hsenc|mkt_tok)=/i,
  // Paid business-record lookups
  /^https?:\/\/(www\.)?referenceusa\.com\//i,
  // Personal profiles of named people
  /^https?:\/\/(www\.)?linkedin\.com\/in\//i,
];

/** True when a bookmark URL must stay out of the tracked exports. */
export function isPrivateBookmarkUrl(url) {
  if (typeof url !== 'string') return false;
  return PRIVATE_BOOKMARK_PATTERNS.some((rx) => rx.test(url));
}
