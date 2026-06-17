/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-security-baseline.mjs
 *
 * Local security and dependency hygiene baseline.
 *
 * Checks:
 *   1. No committed runtime env files or npm credentials.
 *   2. No obvious secrets committed to source/docs.
 *   3. No external font/CDN imports in authored app files.
 *   4. No dangerous HTML injection without an explicit exemption.
 *   5. Dependency declarations avoid remote/file protocol sources.
 *   6. pnpm lockfile exists.
 *
 * Usage: pnpm check:security
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join, relative } from 'path';

const ROOT = process.cwd();
const PACKAGE_JSON = join(ROOT, 'package.json');
const LOCKFILE = join(ROOT, 'pnpm-lock.yaml');

const BLOCKED_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.test',
  '.npmrc',
];

const TEXT_EXTENSIONS = new Set([
  '.md',
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.html',
  '.yml',
  '.yaml',
  '.toml',
  '.sh',
]);

const SCAN_ROOTS = [
  join(ROOT, 'src'),
  join(ROOT, 'scripts'),
  join(ROOT, 'public'),
];

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
]);

const SECRET_PATTERNS = [
  { label: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: 'Google API key', pattern: /\bAIza[0-9A-Za-z\-_]{35}\b/ },
  { label: 'Stripe secret key', pattern: /\bsk_(?:live|test)_[0-9A-Za-z]{16,}\b/ },
  { label: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { label: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9\-_]{20,}\b/ },
  { label: 'private key block', pattern: /-----BEGIN (?:RSA|OPENSSH|EC|DSA|PGP) PRIVATE KEY-----/ },
];

const CDN_PATTERNS = [
  /fonts\.googleapis\.com/i,
  /fonts\.gstatic\.com/i,
  /fontshare\.com/i,
  /use\.typekit\.net/i,
];

function extname(file) {
  const idx = file.lastIndexOf('.');
  return idx >= 0 ? file.slice(idx).toLowerCase() : '';
}

function walk(dir, output = []) {
  if (!existsSync(dir)) return output;

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, output);
      continue;
    }

    if (!TEXT_EXTENSIONS.has(extname(entry))) continue;
    output.push(full);
  }

  return output;
}

/** Returns true if the file at `relPath` is tracked by git (i.e. actually committed). */
function isGitTracked(relPath) {
  try {
    const result = execSync(`git ls-files --error-unmatch "${relPath}"`, {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result !== null;
  } catch {
    return false;
  }
}

/** Returns true if the line is a pure CSS or JS comment (not an active declaration). */
function isPureComment(line) {
  const trimmed = line.trimStart();
  // CSS block comment content or opening
  if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//')) return true;
  // Inline // comment at end — only flag if the URL appears before any comment marker
  return false;
}

const violations = [];

for (const blocked of BLOCKED_FILES) {
  const full = join(ROOT, blocked);
  if (existsSync(full) && isGitTracked(blocked)) {
    violations.push(`blocked file committed: ${blocked}`);
  }
}

if (!existsSync(LOCKFILE)) {
  violations.push('pnpm-lock.yaml is missing');
}

for (const filePath of SCAN_ROOTS.flatMap(dir => walk(dir))) {
  const rel = relative(ROOT, filePath).replace(/\\/g, '/');
  if (rel === 'scripts/check-security-baseline.mjs') continue;
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('security-ok')) continue;

    for (const { label, pattern } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        violations.push(`${rel}:${i + 1} potential secret detected (${label})`);
      }
    }

    if (/dangerouslySetInnerHTML/.test(line)) {
      violations.push(`${rel}:${i + 1} uses dangerouslySetInnerHTML without // security-ok`);
    }

    // Skip CDN checks for lines that are pure comments (attribution comments, etc.)
    if (!isPureComment(line)) {
      for (const pattern of CDN_PATTERNS) {
        if (pattern.test(line)) {
          violations.push(`${rel}:${i + 1} references external font/CDN host`);
        }
      }
    }
  }
}

if (!existsSync(PACKAGE_JSON)) {
  violations.push('package.json is missing');
} else {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
  const dependencyGroups = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

  for (const group of dependencyGroups) {
    const deps = pkg[group] ?? {};
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version !== 'string') continue;
      if (/^(?:https?:|git\+|github:|file:|link:)/i.test(version)) {
        violations.push(`${group}.${name} uses a remote or local protocol source (${version})`);
      }
      if (/^(?:latest|\*)$/i.test(version.trim())) {
        violations.push(`${group}.${name} uses an unpinned version (${version})`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error(`\n✗ Security baseline check failed — ${violations.length} issue(s).\n`);
  for (const violation of violations) {
    console.error(`  ${violation}`);
  }
  console.error('\n  Add // security-ok: reason only when the risk is understood and intentional.\n');
  process.exit(1);
}

console.log('\n✓ Security baseline check passed — no committed secrets, blocked env files, unsafe injection, or external font drift detected.\n');
