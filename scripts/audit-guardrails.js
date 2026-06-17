#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * audit-guardrails.js
 *
 * Scans the repository for the four pillars of a self-healing system:
 * 1. AI Guardrails (CLAUDE.md, .cursorrules)
 * 2. Linter Rules (ESLint, stylelint)
 * 3. Gatekeepers (pre-commit hooks, lint-staged)
 * 4. CI/CD Pipeline (GitHub Actions)
 *
 * Outputs to scripts/guardrails.json for dashboard consumption.
 *
 * Run: node scripts/audit-guardrails.js
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_PATH = join(__dirname, 'guardrails.json');

const AI_KEYWORDS = ['9-style', 'typography', 'px16', 'px24', 'component.padding', 'component.gap', 'forbidden'];
const DEPRECATED_TOKENS = ['label', 'title', 'displayXl', 'body2', 'monoXs', 'labelTechnical'];
const LINTER_KEYWORDS = ['no-restricted-syntax', 'no-restricted-imports', 'deprecated', 'forbidden'];

function fileExists(path) {
  return existsSync(path);
}

function readFile(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function checkAIGuardrails() {
  const claudeMd = join(ROOT, 'CLAUDE.md');
  const cursorRules = join(ROOT, '.cursorrules');
  const status = { status: 'missing', message: '' };

  if (fileExists(claudeMd)) {
    const content = readFile(claudeMd);
    const hasKeywords = AI_KEYWORDS.some(kw => content.includes(kw));
    const hasDeprecated = DEPRECATED_TOKENS.some(token => content.includes(token));

    if (hasKeywords && hasDeprecated) {
      status.status = 'healthy';
      status.message = '✓ CLAUDE.md present with typography ramp and deprecated token warnings';
    } else if (hasKeywords) {
      status.status = 'partial';
      status.message = 'CLAUDE.md has typography rules but missing deprecated token references';
    } else {
      status.status = 'warning';
      status.message = 'CLAUDE.md exists but lacks explicit guardrail keywords';
    }
  }

  if (fileExists(cursorRules)) {
    const content = readFile(cursorRules);
    if (content && content.length > 100) {
      if (status.status === 'missing') {
        status.status = 'partial';
        status.message = '.cursorrules present but CLAUDE.md missing';
      } else if (status.status === 'partial') {
        status.status = 'healthy';
        status.message += ' + .cursorrules backup exists';
      } else {
        status.message += ' + .cursorrules redundancy';
      }
    }
  }

  if (status.status === 'missing') {
    status.message = '✗ No AI guardrail files (CLAUDE.md or .cursorrules) found';
  }

  return status;
}

function checkLinterRules() {
  const eslintConfigs = [
    join(ROOT, 'eslint.config.js'),
    join(ROOT, 'eslint.config.mjs'),
    join(ROOT, '.eslintrc.js'),
    join(ROOT, '.eslintrc.json'),
  ];
  const stylelintConfig = join(ROOT, 'stylelint.config.js');

  const status = { status: 'missing', message: '' };

  for (const cfg of eslintConfigs) {
    if (fileExists(cfg)) {
      const content = readFile(cfg);
      const hasRestrictedRules = LINTER_KEYWORDS.some(kw => content.includes(kw));
      const hasDeprecatedTokens = DEPRECATED_TOKENS.some(token => content.includes(token));

      if (hasRestrictedRules && hasDeprecatedTokens) {
        status.status = 'healthy';
        status.message = `✓ ESLint config found with custom rules targeting deprecated tokens`;
        break;
      } else if (hasRestrictedRules) {
        status.status = 'partial';
        status.message = 'ESLint config present with restriction rules but missing deprecated token checks';
        break;
      } else {
        status.status = 'warning';
        status.message = 'ESLint config found but no custom deprecated-token rules detected';
      }
    }
  }

  if (fileExists(stylelintConfig)) {
    const content = readFile(stylelintConfig);
    if (content && content.includes('no-restricted')) {
      if (status.status === 'missing') {
        status.status = 'partial';
        status.message = '✓ stylelint config with restrictions (ESLint missing)';
      } else {
        status.message += ' + stylelint also configured';
      }
    }
  }

  // Check for custom Node.js linters that replace ESLint
  const customLinters = [
    join(ROOT, 'scripts', 'hds-lint.js'),
    join(ROOT, 'scripts', 'check-legacy-hds-vars.mjs'),
    join(ROOT, 'scripts', 'audit-tokens.mjs'),
  ];

  const customFound = customLinters.filter(l => fileExists(l)).length;
  if (customFound > 0 && status.status === 'missing') {
    status.status = 'partial';
    status.message = `✓ ${customFound} custom Node.js linters found (ESLint/stylelint missing)`;
  } else if (customFound > 0) {
    status.message += ` + ${customFound} custom linters`;
  }

  if (status.status === 'missing') {
    status.message = '✗ No ESLint, stylelint, or custom linter configuration found';
  }

  return status;
}

function checkGatekeepers() {
  const hooksDirs = [
    join(ROOT, '.githooks'),
    join(ROOT, '.husky'),
  ];
  const lintStagedConfig = join(ROOT, 'lint-staged.config.js');
  const packageJson = join(ROOT, 'package.json');

  const status = { status: 'missing', message: '' };

  for (const dir of hooksDirs) {
    if (fileExists(dir)) {
      const entries = readdirSync(dir);
      const preCommit = entries.includes('pre-commit');
      const prePush = entries.includes('pre-push');

      if (preCommit || prePush) {
        status.status = 'healthy';
        const hooks = [];
        if (preCommit) hooks.push('pre-commit');
        if (prePush) hooks.push('pre-push');
        status.message = `✓ Git hooks configured (${hooks.join(', ')})`;

        // Check hook content
        const preCommitPath = join(dir, 'pre-commit');
        if (fileExists(preCommitPath)) {
          const content = readFile(preCommitPath);
          if (content && content.includes('check:fast')) {
            status.message += ' running check:fast';
          }
        }
        break;
      }
    }
  }

  if (fileExists(lintStagedConfig)) {
    const content = readFile(lintStagedConfig);
    if (content && content.length > 50) {
      if (status.status === 'missing') {
        status.status = 'partial';
        status.message = '✓ lint-staged config present (git hooks missing)';
      } else {
        status.message += ' + lint-staged also configured';
      }
    }
  }

  if (fileExists(packageJson)) {
    const content = readFile(packageJson);
    try {
      const pkg = JSON.parse(content);
      if (pkg.scripts && (pkg.scripts['prepare'] || pkg.scripts['husky'])) {
        if (status.status === 'missing') {
          status.status = 'warning';
          status.message = 'package.json has hook setup script but no hook config files found';
        } else {
          status.message += ' + setup automation in package.json';
        }
      }
    } catch {
      // JSON parse failed, skip
    }
  }

  if (status.status === 'missing') {
    status.message = '✗ No pre-commit hooks or lint-staged configuration found';
  }

  return status;
}

function checkCICD() {
  const workflowsDir = join(ROOT, '.github', 'workflows');
  const status = { status: 'missing', message: '' };

  if (!fileExists(workflowsDir)) {
    status.message = '✗ No .github/workflows directory found';
    return status;
  }

  try {
    const files = readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
    if (files.length === 0) {
      status.message = '✗ No GitHub Actions workflows found';
      return status;
    }

    let hasTokenScan = false;
    let hasLint = false;
    let hasMergeGate = false;

    for (const file of files) {
      const content = readFile(join(workflowsDir, file));
      if (!content) continue;

      if (content.includes('token-scan') || content.includes('audit-tokens') || content.includes('forbidden')) {
        hasTokenScan = true;
      }
      if (content.includes('lint') || content.includes('check:') || content.includes('eslint')) {
        hasLint = true;
      }
      if (content.includes('status') && content.includes('failure')) {
        hasMergeGate = true;
      }
    }

    if (hasTokenScan && hasMergeGate) {
      status.status = 'healthy';
      status.message = `✓ CI/CD has token scanning with merge gate (${files.length} workflows)`;
    } else if (hasTokenScan && hasLint) {
      status.status = 'healthy';
      status.message = `✓ CI/CD has token scanning + linting (${files.length} workflows)`;
    } else if (hasTokenScan || hasLint) {
      status.status = 'warning';
      const checks = [];
      if (hasTokenScan) checks.push('token scanning');
      if (hasLint) checks.push('linting');
      status.message = `⚠ CI/CD partial: ${checks.join(' + ')} present but no merge gate`;
      if (!hasMergeGate) {
        status.message += ' (violations do not block merges)';
      }
    } else {
      status.status = 'warning';
      status.message = `⚠ ${files.length} workflows found but no linting/token audit detected`;
    }
  } catch (err) {
    status.status = 'warning';
    status.message = `⚠ Could not scan workflows: ${err.message}`;
  }

  return status;
}

function generateReport() {
  const report = {
    aiGuardrails: checkAIGuardrails(),
    linters: checkLinterRules(),
    gatekeepers: checkGatekeepers(),
    cicd: checkCICD(),
    lastChecked: new Date().toISOString(),
  };

  return report;
}

// Main execution
const report = generateReport();

try {
  const fs = await import('fs');
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + '\n');
  console.log(`✓ Guardrails audit written to ${OUTPUT_PATH}`);
  console.log(JSON.stringify(report, null, 2));
} catch (err) {
  console.error(`✗ Failed to write guardrails report: ${err.message}`);
  process.exit(1);
}
