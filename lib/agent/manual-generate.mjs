/**
 * lib/agent/manual-generate — generation without a metered API call.
 *
 * WHY THIS EXISTS: `lib/agent/generate.mjs` calls the Anthropic API per lead
 * (enrich → generate → judge, plus regenerations), which bills tokens. Claude
 * Code already runs on the operator's subscription, so a session can author the
 * content JSON itself and there is no API call to pay for.
 *
 * The risk in that swap is silently losing the quality gates, which live in the
 * API path's repair loop. So this module runs the SAME ones, in the same order:
 *
 *   1. GeneratedContentSchema  — the zod contract (hero variant enum, the
 *      sectionOrder permutation rule, the six-hex palette)
 *   2. checkPalette            — lazy-preset + WCAG AA contrast (ops#188)
 *   3. assemble + defineClient — the real ClientConfig contract
 *   4. renderArtifacts         — the paste-ready hand-off
 *
 * No LLM call, no network. The "model" is the session that wrote the content.
 * Nothing here weakens a gate: a config this module rejects is a config the API
 * path would have regenerated.
 *
 * @module agent/manual-generate
 */

import { assemble, PLACEHOLDERS } from './generate.mjs';
import { checkPalette } from './palette.mjs';
import { GeneratedContentSchema } from './types.mjs';
import { defineClient } from '../schema/index.mjs';
import { renderArtifacts } from '../render/index.mjs';

/**
 * Turn session-authored content into a validated config + render artifacts.
 *
 * Never throws: every failure comes back as a readable note, so the caller (a
 * CLI, or a session reading the output) can fix and re-run — the same loop the
 * API path runs automatically.
 *
 * @param {object} lead the lead row (snake_case DB shape is fine; see assemble)
 * @param {object} content the content a session authored, matching GeneratedContentSchema
 * @returns {{ ok: boolean, notes: string[], config?: object, artifacts?: object }}
 */
export function buildFromContent(lead, content) {
  const notes = [];

  // 1. The same zod contract the API path parses the model's output against.
  const parsed = GeneratedContentSchema.safeParse(content);
  if (!parsed.success) {
    return {
      ok: false,
      notes: parsed.error.issues.map((i) => `- ${i.path.join('.') || 'content'}: ${i.message}`),
    };
  }

  // 2. The ops#188 palette gate — identical call the repair loop makes.
  const palette = checkPalette(parsed.data.palette);
  if (!palette.ok) return { ok: false, notes: palette.note.split('\n') };

  // 3. The real ClientConfig contract.
  let config;
  try {
    config = defineClient(assemble(lead, parsed.data));
  } catch (err) {
    return { ok: false, notes: [err instanceof Error ? err.message : String(err)] };
  }

  // 4. The hand-off. Photos drive the download block; absent is fine.
  const artifacts = renderArtifacts(config, {
    photos: Array.isArray(lead.photos) ? lead.photos : [],
  });

  // Advisory, not fatal: the fabrication ban means a missing phone or email
  // stays a placeholder rather than being invented, but shipping that to a
  // client is a mistake — so say so loudly while still returning the config.
  for (const [field, placeholder] of Object.entries(PLACEHOLDERS)) {
    if (config.business[field] === placeholder) {
      notes.push(
        `- business.${field} is the placeholder ${placeholder} — the lead had none. ` +
          `Fill it before the site goes to prod (nothing was invented, per the fabrication ban).`,
      );
    }
  }

  return { ok: true, notes, config, artifacts };
}
