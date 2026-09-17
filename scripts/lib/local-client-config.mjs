/**
 * scripts/lib/local-client-config.mjs
 *
 * Per-machine client config that never enters git. Real client names, mailbox
 * addresses, Gmail search terms and nicknames live under the gitignored
 * `clients/` folder, not in tracked code (ops#27):
 *
 *   clients/local.json               { "defaultClient": "<slug>",
 *                                      "aliases": { "<slug>": ["nickname", …] },
 *                                      "bookmarkPillarKeywords": { "<pillar>": ["folder keyword", …] } }
 *   clients/<slug>/email-search.json { "queries": ["<gmail query>", …],
 *                                      "keywords": { "actionItems": […], "statusChanges": […], "blockers": […] } }
 *
 * Shapes to copy: the local.json example in clients/_template/README.md and
 * clients/_template/email-search.json.
 */

import fs from 'node:fs';
import path from 'node:path';

export const LOCAL_CONFIG_REL = 'clients/local.json';

const TEMPLATE_EMAIL_SEARCH_REL = 'clients/_template/email-search.json';

const DEFAULT_KEYWORDS = {
  actionItems: ['send', 'follow up', 'need', 'please', 'action'],
  statusChanges: ['done', 'complete', 'sent', 'confirmed'],
  blockers: ['blocked', 'waiting', 'pending'],
};

function readJson(full, rel) {
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    throw new Error(
      `${rel} is not valid JSON (${err.message}). Fix or delete that gitignored file.`,
    );
  }
}

/** Reads clients/local.json. Absent file → {} (every field is optional). */
export function readLocalClientConfig(root) {
  const full = path.join(root, LOCAL_CONFIG_REL);
  if (!fs.existsSync(full)) return {};
  return readJson(full, LOCAL_CONFIG_REL);
}

/** DISCORD_DEFAULT_CLIENT wins, then defaultClient from clients/local.json, else null. */
export function resolveDefaultClient({ env = process.env, config = {} } = {}) {
  return env.DISCORD_DEFAULT_CLIENT || config.defaultClient || null;
}

export function missingDefaultClientMessage() {
  return (
    'No default client is configured. Set DISCORD_DEFAULT_CLIENT in .env.local, or add ' +
    `"defaultClient": "<slug>" to ${LOCAL_CONFIG_REL} (gitignored), or prefix the message with [client-slug].`
  );
}

/**
 * Reads clients/<slug>/email-search.json. Throws an actionable error naming the
 * file when it is missing or has no queries — the real search terms are client
 * PII and must never be hardcoded in tracked code.
 */
export function readEmailSearchConfig(root, slug) {
  const rel = `clients/${slug}/email-search.json`;
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    throw new Error(
      `Missing ${rel}. Copy ${TEMPLATE_EMAIL_SEARCH_REL} there and fill in this client's Gmail ` +
        'queries (mailboxes, subject terms). The file is gitignored — never put real client terms in tracked code.',
    );
  }
  const cfg = readJson(full, rel);
  const queries = Array.isArray(cfg.queries)
    ? cfg.queries.filter((q) => typeof q === 'string' && q.trim())
    : [];
  if (queries.length === 0) {
    throw new Error(`${rel} needs a non-empty "queries" array of Gmail search strings.`);
  }
  if (queries.some((q) => q.includes('<<'))) {
    throw new Error(
      `${rel} still has <<placeholder>> text from the template. Replace it with this client's real terms.`,
    );
  }
  return {
    queries,
    keywords: {
      actionItems: cfg.keywords?.actionItems ?? DEFAULT_KEYWORDS.actionItems,
      statusChanges: cfg.keywords?.statusChanges ?? DEFAULT_KEYWORDS.statusChanges,
      blockers: cfg.keywords?.blockers ?? DEFAULT_KEYWORDS.blockers,
    },
  };
}

/** System-prompt lines that map spoken client nicknames to slugs, from clients/local.json. */
export function clientAliasPromptLines(config = {}) {
  const entries = Object.entries(config.aliases ?? {}).filter(
    ([, names]) => Array.isArray(names) && names.length,
  );
  if (entries.length === 0) {
    return [
      '- If the client is not named by slug, ask which client slug (the folder name under clients/) to use.',
    ];
  }
  return entries.map(
    ([slug, names]) =>
      `- ${names.map((n) => `"${n}"`).join(', ')} → use client_status / sync_client_emails with slug "${slug}"`,
  );
}
