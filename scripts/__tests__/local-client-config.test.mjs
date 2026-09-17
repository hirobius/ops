/**
 * Tests for scripts/lib/local-client-config.mjs — the gitignored per-machine
 * client config that keeps real client names, mailboxes and search terms out of
 * tracked code (ops#27). Uses a throwaway temp dir; no network, no git.
 */

import { afterEach, beforeEach, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LOCAL_CONFIG_REL,
  readLocalClientConfig,
  resolveDefaultClient,
  missingDefaultClientMessage,
  readEmailSearchConfig,
  clientAliasPromptLines,
} from '../lib/local-client-config.mjs';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-client-config-'));
  fs.mkdirSync(path.join(root, 'clients'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(rel, body) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof body === 'string' ? body : JSON.stringify(body));
}

// ── readLocalClientConfig ────────────────────────────────────────────────────

test('the local config lives under the gitignored clients/ folder', () => {
  assert.equal(LOCAL_CONFIG_REL, 'clients/local.json');
});

test('readLocalClientConfig returns an empty object when the file is absent', () => {
  assert.deepEqual(readLocalClientConfig(root), {});
});

test('readLocalClientConfig parses the file when present', () => {
  write('clients/local.json', {
    defaultClient: 'acme-agency',
    aliases: { 'acme-agency': ['acme'] },
  });
  assert.deepEqual(readLocalClientConfig(root), {
    defaultClient: 'acme-agency',
    aliases: { 'acme-agency': ['acme'] },
  });
});

test('readLocalClientConfig names the file when the JSON is invalid', () => {
  write('clients/local.json', '{ not json');
  assert.throws(() => readLocalClientConfig(root), /clients\/local\.json/);
});

// ── resolveDefaultClient ─────────────────────────────────────────────────────

test('resolveDefaultClient prefers DISCORD_DEFAULT_CLIENT over the local file', () => {
  const got = resolveDefaultClient({
    env: { DISCORD_DEFAULT_CLIENT: 'from-env' },
    config: { defaultClient: 'from-file' },
  });
  assert.equal(got, 'from-env');
});

test('resolveDefaultClient falls back to defaultClient in the local file', () => {
  assert.equal(
    resolveDefaultClient({ env: {}, config: { defaultClient: 'from-file' } }),
    'from-file',
  );
});

test('resolveDefaultClient returns null when neither is set', () => {
  assert.equal(resolveDefaultClient({ env: {}, config: {} }), null);
});

test('missingDefaultClientMessage names the env var, the file and the prefix escape hatch', () => {
  const msg = missingDefaultClientMessage();
  assert.match(msg, /DISCORD_DEFAULT_CLIENT/);
  assert.match(msg, /clients\/local\.json/);
  assert.match(msg, /\[client-slug\]/);
});

// ── readEmailSearchConfig ────────────────────────────────────────────────────

test('readEmailSearchConfig fails loud, naming the per-client file, when it is missing', () => {
  assert.throws(
    () => readEmailSearchConfig(root, 'acme-agency'),
    (err) =>
      /clients\/acme-agency\/email-search\.json/.test(err.message) &&
      /clients\/_template\/email-search\.json/.test(err.message),
  );
});

test('readEmailSearchConfig rejects a file without a non-empty queries array', () => {
  write('clients/acme-agency/email-search.json', { queries: [] });
  assert.throws(() => readEmailSearchConfig(root, 'acme-agency'), /queries/);
});

test('readEmailSearchConfig refuses a copy that still holds <<template placeholders>>', () => {
  write('clients/acme-agency/email-search.json', { queries: ['subject:<<client-nickname>>'] });
  assert.throws(() => readEmailSearchConfig(root, 'acme-agency'), /placeholder/);
});

test('the tracked template is valid JSON with placeholder-only queries', () => {
  const tpl = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'clients', '_template', 'email-search.json'), 'utf8'),
  );
  assert.ok(tpl.queries.length > 0);
  assert.ok(tpl.queries.every((q) => q.includes('<<')));
});

test('readEmailSearchConfig returns queries and fills default keyword lists', () => {
  write('clients/acme-agency/email-search.json', { queries: ['subject:acme'] });
  const cfg = readEmailSearchConfig(root, 'acme-agency');
  assert.deepEqual(cfg.queries, ['subject:acme']);
  assert.ok(cfg.keywords.actionItems.length > 0);
  assert.ok(cfg.keywords.statusChanges.length > 0);
  assert.ok(cfg.keywords.blockers.length > 0);
});

test('readEmailSearchConfig keeps keyword lists the file provides', () => {
  write('clients/acme-agency/email-search.json', {
    queries: ['subject:acme'],
    keywords: { actionItems: ['login'], statusChanges: ['sent'], blockers: ['waiting'] },
  });
  assert.deepEqual(readEmailSearchConfig(root, 'acme-agency').keywords, {
    actionItems: ['login'],
    statusChanges: ['sent'],
    blockers: ['waiting'],
  });
});

// ── clientAliasPromptLines ───────────────────────────────────────────────────

test('clientAliasPromptLines maps each configured alias set to its slug', () => {
  const lines = clientAliasPromptLines({ aliases: { 'acme-agency': ['acme', 'the agency'] } });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /"acme"/);
  assert.match(lines[0], /"the agency"/);
  assert.match(lines[0], /slug "acme-agency"/);
});

test('clientAliasPromptLines tells the model to ask for a slug when no aliases exist', () => {
  const lines = clientAliasPromptLines({});
  assert.equal(lines.length, 1);
  assert.match(lines[0], /slug/);
});
