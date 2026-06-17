#!/usr/bin/env node
/**
 * scripts/parse-bookmarks.mjs
 *
 * Parses Chrome/Edge bookmark HTML exports into structured markdown
 * files organized by BUILD / GROW / RUN pillar.
 *
 * Usage:
 *   node scripts/parse-bookmarks.mjs                          # uses default paths
 *   node scripts/parse-bookmarks.mjs --file path/to/file.html # single file
 *   node scripts/parse-bookmarks.mjs --dry-run                # print stats, no write
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT  = path.join(ROOT, 'docs/knowledge');

const argv    = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const fileIdx = argv.indexOf('--file');
const SINGLE  = fileIdx !== -1 ? argv[fileIdx + 1] : null;

// ── Pillar classification map ─────────────────────────────────────────────────
// Folder name (lowercase) → pillar. First match wins.

const PILLAR_MAP = {
  // BUILD — what Adrian makes
  build: [
    'design system', 'design system samples', 'xds', 'hirobius', 'folio',
    'illustration', 'ui', '3d', 'motion', 'blender', 'three.js', 'three js',
    'animation libraries', 'vibe coding', 'touch controls', 'shader techniques',
    'avatars', 'component', 'figma', 'storybook', 'hds',
  ],
  // GROW — what makes the business bigger
  grow: [
    'portfolio inspo', 'portfolio inspirations', 'branding', 'marketing', 'seo',
    'funding', 'sales', 'job hunt', 'shops', 'stores', 'launch optimizations',
    'linkedin', 'youtube', 'content', 'social', 'audience', 'email',
  ],
  // RUN — what keeps it working
  run: [
    'systems', 'automations', 'ai refs', 'ai', 'toolbox', 'claude',
    'prompting', 'legal', 'operations', 'analytics', 'research', 'prototypes',
    'tasks', 'ado', 'articulation', 'user research', 'helpful links',
    'tools', 'productivity', 'automation', 'infrastructure', 'devops',
  ],
  // Concrete Creations (sub-bucket of BUILD)
  'build/concrete-creations': [
    'inventory', 'production options', 'fulfillment', 'sustainability',
    'trademark', 'print settings', 'taxes', 'concrete', 'ranch',
  ],
  // Skip — personal / old job / irrelevant
  _skip: [
    'xbox', 'games', 'gifs', 'mgd', 'google interview', 'aem', 'key decks',
    'meeting recordings', 'onboarding', 'steam', 'tab collections',
    'shopping list', 'shopping', 'new folder', 'inspo', 'character refs',
  ],
};

function classifyFolder(folderPath) {
  const lower = folderPath.toLowerCase();
  for (const [pillar, keywords] of Object.entries(PILLAR_MAP)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return pillar;
    }
  }
  return '_unclassified';
}

// ── HTML parser ───────────────────────────────────────────────────────────────

function parseBookmarkHtml(html, source) {
  const bookmarks = [];
  const folderStack = [];

  // Split into lines for simple state-machine parsing
  for (const line of html.split('\n')) {
    // Folder open
    const h3 = line.match(/<H3[^>]*>([^<]+)<\/H3>/i);
    if (h3) { folderStack.push(h3[1].trim()); continue; }

    // Folder close (simplistic — works for standard Netscape bookmark format)
    if (line.includes('</DL>')) { folderStack.pop(); continue; }

    // Bookmark link
    const a = line.match(/<A HREF="([^"]+)"[^>]*>([^<]*)<\/A>/i);
    if (!a) continue;

    const [, url, title] = a;
    if (!url || url.startsWith('javascript:')) continue;

    const folderPath = folderStack.join(' > ');
    const pillar = classifyFolder(folderPath || title);

    bookmarks.push({
      title: title.trim() || url,
      url,
      folder: folderPath,
      pillar,
      source,
    });
  }

  return bookmarks;
}

// ── Markdown writer ───────────────────────────────────────────────────────────

function writeKnowledge(bookmarks) {
  const byPillar = {};
  for (const b of bookmarks) {
    if (b.pillar === '_skip') continue;
    // unclassified lands in run/_unclassified for AI review pass
    if (b.pillar === '_unclassified') b.pillar = '_unclassified';
    (byPillar[b.pillar] ||= []).push(b);
  }

  for (const [pillar, items] of Object.entries(byPillar)) {
    const dir = path.join(OUT, pillar, 'bookmarks');
    if (!DRY_RUN) fs.mkdirSync(dir, { recursive: true });

    // Group by folder within pillar
    const byFolder = {};
    for (const b of items) {
      (byFolder[b.folder || 'Unsorted'] ||= []).push(b);
    }

    const lines = [
      `---`,
      `pillar: ${pillar.split('/')[0]}`,
      `source: bookmarks`,
      `date: ${new Date().toISOString().slice(0, 10)}`,
      `total: ${items.length}`,
      `---`,
      ``,
      `# Bookmarks — ${pillar}`,
      ``,
    ];

    for (const [folder, links] of Object.entries(byFolder)) {
      lines.push(`## ${folder}`, '');
      for (const l of links) {
        lines.push(`- [${l.title}](${l.url})`);
      }
      lines.push('');
    }

    const outFile = path.join(dir, `index.md`);
    if (!DRY_RUN) {
      fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
    }
    console.log(`  ${pillar}: ${items.length} links → ${outFile.replace(ROOT + '/', '')}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const DEFAULT_FILES = [
  { file: '/mnt/c/Users/Adrian/Desktop/bookmarks_5_2_26.html',  source: 'chrome'  },
  { file: '/mnt/c/Users/Adrian/Desktop/favorites_5_2_26.html', source: 'edge'    },
];

const filesToProcess = SINGLE
  ? [{ file: SINGLE, source: path.basename(SINGLE) }]
  : DEFAULT_FILES.filter(f => fs.existsSync(f.file));

if (filesToProcess.length === 0) {
  console.error('No bookmark files found. Use --file <path> or place exports at default paths.');
  process.exit(1);
}

console.log(`[bookmarks] Processing ${filesToProcess.length} file(s)${DRY_RUN ? ' (dry run)' : ''}...`);

let all = [];
for (const { file, source } of filesToProcess) {
  const html = fs.readFileSync(file, 'utf8');
  const parsed = parseBookmarkHtml(html, source);
  console.log(`  ${source}: ${parsed.length} bookmarks found`);
  all = all.concat(parsed);
}

// Deduplicate by URL
const seen = new Set();
all = all.filter(b => { if (seen.has(b.url)) return false; seen.add(b.url); return true; });
console.log(`\n[bookmarks] ${all.length} unique bookmarks after dedup`);

// Stats
const stats = {};
for (const b of all) { stats[b.pillar] = (stats[b.pillar] || 0) + 1; }
console.log('\n[bookmarks] Pillar breakdown:');
for (const [p, n] of Object.entries(stats).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${p}: ${n}`);
}

if (!DRY_RUN) {
  console.log('\n[bookmarks] Writing to docs/knowledge/...');
  writeKnowledge(all);
  console.log('\n[bookmarks] Done.');
}
