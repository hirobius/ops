#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const SOURCE_ROOTS = [
  'src',
  'scripts',
  'validators',
  'pipeline',
];

// Category definitions
const CATEGORIES = {
  ESLINT_DISABLE: 'eslint-disable',
  TS_IGNORE: '@ts-ignore/@ts-expect-error',
  CUSTOM_SENTINELS: 'custom-sentinels (*-ok / hds-bypass)',
};

// Custom sentinel patterns
const CUSTOM_SENTINELS = [
  'audit-ok',
  'font-ok',
  'hds-bypass',
  'spacing-ok',
  'binding-ok',
];

// Results collection
const results = {
  eslintDisable: [],
  tsIgnore: [],
  customSentinels: [],
};

/**
 * Walk a directory recursively and collect all source files.
 */
function walkDir(rootPath, extensions) {
  const files = [];

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath);
        }
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(fullPath);
      }
    }
  }

  walk(rootPath);
  return files;
}

/**
 * Find all suppressions in a file.
 * Returns an array of { line, category, rule, reason, justified }.
 */
function findSuppressions(filePath) {
  let source;
  try {
    source = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const suppressions = [];
  const lines = source.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // eslint-disable-* (must be in a comment)
    const eslintMatch = line.match(/\/\*?\s*eslint-disable([a-z-]*)\s*(.*?)(?:\*\/|$)/);
    if (eslintMatch) {
      const rule = eslintMatch[1] || '*';
      const reason = (eslintMatch[2] || '').trim();
      suppressions.push({
        line: lineNum,
        category: CATEGORIES.ESLINT_DISABLE,
        rule: `eslint-disable${rule}`,
        reason,
        justified: reason.length >= 10,
      });
    }

    // ts-suppress directives (ts-ignore or ts-expect-error, must be in a comment)
    const tsMatch = line.match(/\/\/\s*(@ts-ignore|@ts-expect-error)\s*(.*?)$/);
    if (tsMatch) {
      const rule = tsMatch[1];
      const reason = (tsMatch[2] || '').trim();
      suppressions.push({
        line: lineNum,
        category: CATEGORIES.TS_IGNORE,
        rule,
        reason,
        justified: reason.length >= 10,
      });
    }

    // Custom sentinels (must be in a comment, preceded by // or /*, followed by colon or whitespace)
    // Avoid matching mentions in strings or prose
    for (const sentinel of CUSTOM_SENTINELS) {
      // Match patterns like: "// audit-ok: reason" or "/* hds-bypass: reason */"
      const pattern = new RegExp(`(?://|/\\*)\\s*${sentinel}\\s*(?::)?\\s*(.*)$`);
      const match = line.match(pattern);
      if (match && (line.includes('//') || line.includes('/*'))) {
        // Only count if it's actually in a comment (// or /*)
        const commentStart = Math.min(
          line.indexOf('//') >= 0 ? line.indexOf('//') : Infinity,
          line.indexOf('/*') >= 0 ? line.indexOf('/*') : Infinity
        );
        const sentinelPos = line.indexOf(sentinel);
        // Only count if sentinel appears after a comment marker
        if (sentinelPos >= commentStart) {
          const reason = (match[1] || '').trim();
          suppressions.push({
            line: lineNum,
            category: CATEGORIES.CUSTOM_SENTINELS,
            rule: sentinel,
            reason,
            justified: reason.length >= 10,
          });
        }
      }
    }
  });

  return suppressions;
}

/**
 * Main audit logic.
 */
function auditExceptions() {
  const extensions = ['.ts', '.tsx', '.mjs', '.js'];

  for (const root of SOURCE_ROOTS) {
    const rootPath = join(REPO_ROOT, root);
    if (!existsSync(rootPath)) continue;

    const files = walkDir(rootPath, extensions);

    for (const filePath of files) {
      // Skip the audit script itself to avoid false positives
      if (filePath.includes('audit-exceptions.mjs')) continue;

      const suppressions = findSuppressions(filePath);
      const relPath = filePath.replace(REPO_ROOT + '/', '');

      for (const supp of suppressions) {
        const entry = {
          file: relPath,
          line: supp.line,
          category: supp.category,
          rule: supp.rule,
          reason: supp.reason,
          status: supp.justified ? 'justified' : 'untriaged',
        };

        if (supp.category === CATEGORIES.ESLINT_DISABLE) {
          results.eslintDisable.push(entry);
        } else if (supp.category === CATEGORIES.TS_IGNORE) {
          results.tsIgnore.push(entry);
        } else {
          results.customSentinels.push(entry);
        }
      }
    }
  }
}

/**
 * Generate markdown report.
 */
function generateReport() {
  const allResults = [
    ...results.eslintDisable,
    ...results.tsIgnore,
    ...results.customSentinels,
  ];

  const justified = allResults.filter(r => r.status === 'justified').length;
  const untriaged = allResults.filter(r => r.status === 'untriaged').length;

  let md = '# Exception Audit Report\n\n';
  md += `Generated: ${new Date().toISOString()}\n\n`;

  // Summary counts
  md += '## Summary\n\n';
  md += '| Category | Count | Justified | Untriaged |\n';
  md += '|----------|-------|-----------|----------|\n';

  const byCategory = {
    [CATEGORIES.ESLINT_DISABLE]: results.eslintDisable,
    [CATEGORIES.TS_IGNORE]: results.tsIgnore,
    [CATEGORIES.CUSTOM_SENTINELS]: results.customSentinels,
  };

  for (const [cat, items] of Object.entries(byCategory)) {
    const justi = items.filter(r => r.status === 'justified').length;
    const untri = items.filter(r => r.status === 'untriaged').length;
    md += `| ${cat} | ${items.length} | ${justi} | ${untri} |\n`;
  }

  md += `| **Total** | **${allResults.length}** | **${justified}** | **${untriaged}** |\n\n`;

  // Per-category detail tables
  for (const [cat, items] of Object.entries(byCategory)) {
    if (items.length === 0) continue;

    md += `## ${cat}\n\n`;
    md += '| File | Line | Rule | Reason | Status |\n';
    md += '|------|------|------|--------|--------|\n';

    for (const item of items) {
      const reason = item.reason ? `\`${item.reason}\`` : '(none)';
      md += `| \`${item.file}\` | ${item.line} | \`${item.rule}\` | ${reason} | ${item.status} |\n`;
    }

    md += '\n';
  }

  // Footer
  md += '## Summary Stats\n\n';
  md += `- **Total suppressions:** ${allResults.length}\n`;
  md += `- **Justified (reason >= 10 chars):** ${justified}\n`;
  md += `- **Untriaged (reason < 10 chars or missing):** ${untriaged}\n\n`;

  md += 'Scope reduced to inventory-only — resolution of untriaged suppressions deferred to follow-up units.\n';

  return md;
}

// Main
auditExceptions();
const report = generateReport();

// Ensure output directory exists
const auditDir = join(REPO_ROOT, 'docs', 'audits');
if (!existsSync(auditDir)) {
  mkdirSync(auditDir, { recursive: true });
}

// Write report
const reportPath = join(auditDir, 'exceptions-audit.md');
writeFileSync(reportPath, report, 'utf8');

console.log(`Audit complete. Report written to ${reportPath}`);
console.log(`Total suppressions found: ${results.eslintDisable.length + results.tsIgnore.length + results.customSentinels.length}`);
console.log(`Justified: ${(results.eslintDisable.concat(results.tsIgnore, results.customSentinels).filter(r => r.status === 'justified').length)}`);
console.log(`Untriaged: ${(results.eslintDisable.concat(results.tsIgnore, results.customSentinels).filter(r => r.status === 'untriaged').length)}`);

process.exit(0);
