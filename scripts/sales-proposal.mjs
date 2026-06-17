#!/usr/bin/env node
/**
 * sales-proposal.mjs — turn pasted scope notes into a tiered quote block.
 *
 * Deterministic v1: keyword-routes the scope to Tier 1/2/3 and emits a
 * markdown quote table. Designed for the SkillTile input-shell (kind: 'text')
 * — receives the scope as a single argv string via the skill-runner
 * middleware substitution.
 *
 * Tier definitions from `project_business_vision` memory.
 *
 * Refs: t_30afbd9f / Sales B — sales-proposal
 */

/** Tier catalog. Prices are illustrative starting bands — refine per project. */
export const TIERS = {
  1: {
    label: 'Tier 1 — Digital business card',
    pages: '1',
    price: '$500–$1,000',
    timeline: '1–2 weeks',
    summary: 'Single page: hero, contact form, brand photos, contact info.',
  },
  2: {
    label: 'Tier 2 — Simple business site',
    pages: '3–5',
    price: '$1,500–$3,500',
    timeline: '3–5 weeks',
    summary: 'Multi-page marketing site, light CMS-flavored copy edits, minor customization.',
  },
  3: {
    label: 'Tier 3 — Full web presence',
    pages: '5+',
    price: '$5,000–$12,000',
    timeline: '6–10 weeks',
    summary: 'Full site, CMS, SEO, custom Figma work, ecommerce or platform features.',
  },
  retainer: {
    label: 'Retainer — ongoing updates',
    price: '$500–$1,500/mo',
    summary: 'Adrian-controlled content/updates with a regular check-in cadence.',
  },
};

const SIGNAL_RULES = [
  // Tier 3 signals — checked first because they're the most expensive scope.
  { tier: '3', signals: ['ecommerce', 'shop', 'store', 'cms', 'seo', 'platform', 'figma', 'branding', 'brand system', 'full site', 'multi-tenant'] },
  // Tier 1 signals — explicit single-page scope.
  { tier: '1', signals: ['business card', 'landing page', 'single page', '1 page', 'one page', 'contact form'] },
  // Tier 2 signals — small site, blog, "few pages".
  { tier: '2', signals: ['blog', 'small site', '3 pages', '4 pages', '5 pages', 'few pages', 'about page'] },
];

const RETAINER_SIGNALS = ['ongoing', 'monthly', 'maintenance', 'manage', 'retainer', 'updates after'];

/**
 * Pure: route a scope-notes string to a tier id + detected signals.
 *
 * @param {string} scope
 * @returns {{ recommendedTier: '1' | '2' | '3', includesRetainer: boolean, signals: string[] }}
 */
export function routeToTier(scope) {
  const lc = String(scope || '').toLowerCase();
  const found = [];
  let tier = null;

  for (const rule of SIGNAL_RULES) {
    for (const s of rule.signals) {
      if (lc.includes(s)) {
        found.push(s);
        if (tier === null) tier = rule.tier;
      }
    }
  }

  // No-retainer explicit beats no-retainer fuzzy.
  const noRetainer = /\bno retainer\b/.test(lc);
  const includesRetainer = !noRetainer && RETAINER_SIGNALS.some((s) => lc.includes(s));

  return {
    recommendedTier: tier ?? '2',
    includesRetainer,
    signals: found,
  };
}

/**
 * Format a quote markdown block from a routing result + the original scope.
 *
 * @param {{
 *   scope: string,
 *   recommendedTier: '1' | '2' | '3',
 *   includesRetainer: boolean,
 *   signals: string[],
 * }} input
 */
export function formatQuote(input) {
  const { scope, recommendedTier, includesRetainer, signals } = input;
  const today = new Date().toISOString().slice(0, 10);

  const blockquoteScope = String(scope || '')
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');

  const rowFor = (id) => {
    const t = TIERS[id];
    const cells = [t.label, t.pages ?? '—', t.price, t.timeline ?? '—'];
    return id === recommendedTier
      ? `| **${cells[0]}** | **${cells[1]}** | **${cells[2]}** | **${cells[3]}** |`
      : `| ${cells.join(' | ')} |`;
  };

  const lines = [
    `# Proposal — ${today}`,
    '',
    '## Scope',
    blockquoteScope,
    '',
    `## Recommended: ${TIERS[recommendedTier].label}`,
    '',
    TIERS[recommendedTier].summary,
    '',
    '| Tier | Pages | Price | Timeline |',
    '| --- | --- | --- | --- |',
    rowFor('1'),
    rowFor('2'),
    rowFor('3'),
  ];

  if (includesRetainer) {
    lines.push('', `Retainer option: **${TIERS.retainer.price}** — ${TIERS.retainer.summary}`);
  }

  if (signals.length > 0) {
    lines.push('', '## Detected signals', ...signals.map((s) => `- \`${s}\``));
  }

  return lines.join('\n') + '\n';
}

async function main() {
  const scope = process.argv[2] ?? '';
  const routing = routeToTier(scope);
  process.stdout.write(formatQuote({ scope, ...routing }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`sales-proposal: ${err?.message ?? err}\n`);
    process.exit(1);
  });
}
