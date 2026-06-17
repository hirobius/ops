#!/usr/bin/env node
/**
 * check-tenant-tokens.mjs — Tenant overlay validator
 *
 * Validates every tenants/<slug>/tokens.json against HDS structural rules.
 * Runs as a standalone CLI tool and as a pre-commit gate.
 *
 * Rules enforced (per docs/architecture/tenant-token-overlay-format.md):
 *   SC — $schema must reference hirobius.tenant-tokens.schema.json
 *   R1 — No primitive-tier overrides
 *   R5 — Every override path must exist in hirobius.tokens.json
 *   R8 — All alias {ref} values must resolve against the base graph
 *
 * Also validates metadata.json shape:
 *   M1 — slug field must match the directory name
 *   M2 — required fields (slug, displayName, tier, status) must be present
 *   M3 — status must be one of: scaffold, active, archived
 *
 * Exit 0 = all tenants pass. Exit 1 = one or more validation failures.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname }                          from 'path';
import { fileURLToPath }                          from 'url';

import { validateTenantOverlay } from './build-tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const EXPECTED_SCHEMA_REF = 'hirobius.tenant-tokens.schema.json';
const TENANTS_DIR = join(ROOT, 'tenants');

const REQUIRED_METADATA_FIELDS = ['slug', 'displayName', 'tier', 'status'];
const VALID_STATUSES = ['scaffold', 'active', 'archived'];

function validateMetadata(meta, slug) {
  const errors = [];

  // M1 — slug must match directory name
  if (meta.slug !== slug) {
    errors.push(`M1 [${slug}] metadata.slug "${meta.slug}" does not match directory name "${slug}"`);
  }

  // M2 — required fields
  for (const field of REQUIRED_METADATA_FIELDS) {
    if (meta[field] == null) {
      errors.push(`M2 [${slug}] metadata.json missing required field "${field}"`);
    }
  }

  // M3 — valid status
  if (meta.status && !VALID_STATUSES.includes(meta.status)) {
    errors.push(`M3 [${slug}] metadata.status "${meta.status}" must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  return errors;
}

function run() {
  const baseRaw = JSON.parse(readFileSync(join(ROOT, 'hirobius.tokens.json'), 'utf8'));

  let slugDirs;
  try {
    slugDirs = readdirSync(TENANTS_DIR, { withFileTypes: true });
  } catch {
    console.log('No tenants/ directory — nothing to validate.');
    process.exit(0);
  }

  const allErrors = [];
  let tenantsChecked = 0;

  for (const entry of slugDirs) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    if (slug.startsWith('_')) continue; // skip _template etc.

    // Slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      allErrors.push(`[${slug}] invalid slug format — must match [a-z0-9-]+`);
      continue;
    }

    const tenantDir = join(TENANTS_DIR, slug);

    // Validate tokens.json if present
    const overlayPath = join(tenantDir, 'tokens.json');
    if (existsSync(overlayPath)) {
      let overlay;
      try {
        overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
      } catch (e) {
        allErrors.push(`[${slug}] JSON parse error in tokens.json: ${e.message}`);
        continue;
      }
      // SC — $schema must reference hirobius.tenant-tokens.schema.json
      const schemaRef = overlay['$schema'];
      if (!schemaRef) {
        allErrors.push(`SC [${slug}] tokens.json missing $schema field — add: "$schema": "../../${EXPECTED_SCHEMA_REF}"`);
      } else if (!String(schemaRef).endsWith(EXPECTED_SCHEMA_REF)) {
        allErrors.push(`SC [${slug}] $schema must reference "${EXPECTED_SCHEMA_REF}", got: "${schemaRef}"`);
      }

      const overlayErrors = validateTenantOverlay(overlay, baseRaw, slug);
      allErrors.push(...overlayErrors);
    }

    // Validate metadata.json if present
    const metaPath = join(tenantDir, 'metadata.json');
    if (existsSync(metaPath)) {
      let meta;
      try {
        meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      } catch (e) {
        allErrors.push(`[${slug}] JSON parse error in metadata.json: ${e.message}`);
        continue;
      }
      const metaErrors = validateMetadata(meta, slug);
      allErrors.push(...metaErrors);
    }

    tenantsChecked++;
  }

  if (allErrors.length > 0) {
    console.error(`\n✗ Tenant validation failed (${tenantsChecked} tenant(s) checked):\n`);
    allErrors.forEach(e => console.error(`  ${e}`));
    console.error('');
    process.exit(1);
  }

  console.log(`✔ Tenant tokens valid (${tenantsChecked} tenant(s) checked)`);
  process.exit(0);
}

run();
