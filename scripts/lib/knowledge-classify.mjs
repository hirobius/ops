/**
 * scripts/lib/knowledge-classify.mjs
 *
 * Rule-based classifier for AI-conversation ingestion (ChatGPT, Gemini, etc).
 * Returns { pillar, score, client, tags } for a normalized conversation.
 *
 * Pillars (from docs/knowledge/README.md):
 *   build = HDS, client deliverables, Concrete Creations product
 *   grow  = agency pipeline, brand, marketing, content, sales, LinkedIn, YouTube
 *   run   = AI infra, tools, research, processes, automation (this repo)
 *
 * Client detection runs first. Any unambiguous client mention quarantines the
 * conversation under build/clients/<slug>/ regardless of pillar score.
 *
 * Stub-quality: keyword weights, no LLM. Easy to swap for a Hermes pass later.
 */

const PILLAR_TERMS = {
  build: [
    ['hirobius', 5], ['\\bhds\\b', 5], ['design system', 4], ['design tokens', 4],
    ['component library', 3], ['shadcn', 3], ['radix', 2], ['storybook', 2],
    ['figma plugin', 4], ['figma variables', 3], ['code connect', 3],
    ['concrete creations', 5], ['resin', 1], ['mold', 1],
    ['react component', 2], ['tailwind', 2],
  ],
  grow: [
    ['linkedin', 3], ['youtube channel', 2], ['brand', 2], ['marketing', 2],
    ['copywriting', 3], ['headline', 2], ['landing page copy', 3],
    ['pitch deck', 3], ['sales', 2], ['agency', 3], ['client pipeline', 3],
    ['portfolio', 1], ['positioning', 2], ['content strategy', 3],
    ['social media', 2], ['newsletter', 2],
  ],
  run: [
    ['claude code', 4], ['anthropic', 3], ['ollama', 4], ['hermes', 3],
    ['mcp server', 4], ['model context protocol', 4],
    ['ingestion pipeline', 4], ['orchestration', 3], ['automation script', 3],
    ['cron', 1], ['n8n', 2], ['zapier', 2],
    ['vector db', 2], ['embeddings', 2], ['rag', 2],
    ['claude api', 3], ['openai api', 2], ['llm pipeline', 3],
  ],
};

// Client detection — case-insensitive, word-boundary where ambiguous
const CLIENT_RULES = [
  {
    slug: 'lilac-insure',
    // "lilac" alone is too generic (color word) — require "insure/insurance"
    // OR co-occurrence with conrad
    test: (t) =>
      /\blilac\s+insure\b/i.test(t) ||
      (/\blilac\b/i.test(t) && /\binsurance\b/i.test(t)) ||
      /\bconrad\s+milsap\b/i.test(t),
  },
  {
    slug: 'the-ranch-foundation',
    test: (t) => /\b(the\s+)?ranch\s+foundation\b/i.test(t),
  },
  {
    slug: 'concrete-creations',
    // Treat as a product namespace — isolated even though it's not a client
    test: (t) => /\bconcrete\s+creations\b/i.test(t),
  },
  {
    slug: 'reno-perry',
    test: (t) => /\breno\s+perry\b/i.test(t),
  },
];

/**
 * Classify normalized conversation text.
 *
 * @param {object} input
 * @param {string} input.title - conversation title
 * @param {string} input.text  - full concatenated message text (lowercased recommended)
 * @returns {{ pillar: 'build'|'grow'|'run'|'_unclassified', score: object, client: string|null, tags: string[] }}
 */
export function classify({ title = '', text = '' }) {
  const haystack = `${title}\n${text}`.toLowerCase();

  const client = CLIENT_RULES.find((r) => r.test(haystack))?.slug ?? null;

  const score = { build: 0, grow: 0, run: 0 };
  for (const [pillar, terms] of Object.entries(PILLAR_TERMS)) {
    for (const [pattern, weight] of terms) {
      const re = new RegExp(pattern, 'gi');
      const hits = haystack.match(re);
      if (hits) score[pillar] += weight * hits.length;
    }
  }

  const top = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  const pillar = top[1] >= 2 ? top[0] : '_unclassified';

  const tags = [];
  if (client) tags.push(`client:${client}`);
  // Extract a couple of broad tags from term hits for downstream search
  if (/\bfigma\b/i.test(haystack)) tags.push('figma');
  if (/\b(midjourney|dall.?e|stable diffusion|whisk|imagen)\b/i.test(haystack)) tags.push('image-gen');
  if (/\bthree\.?js\b/i.test(haystack)) tags.push('threejs');

  return { pillar, score, client, tags };
}

/** Deterministic short ID for filenames — last 6 chars of conv_id. */
export function shortId(convId) {
  return (convId || '').replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase() || 'noid';
}

/** kebab-case slug, max 60 chars. */
export function slugify(s, max = 60) {
  return (s || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'untitled';
}
