#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'public', 'hds-manifest.json');
const BRIDGE_URL = process.env.HDS_FIGMA_BRIDGE_URL || 'http://localhost:3005/plugin-message';
const DELAY_MS = 1500;

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function truncate(value, maxLength = 180) {
  if (!value) return '';
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function normalizeComponentName(entry) {
  if (typeof entry === 'string' && entry.trim()) {
    return entry.trim();
  }

  if (!entry || typeof entry !== 'object') {
    return null;
  }

  if (typeof entry.name === 'string' && entry.name.trim()) {
    return entry.name.trim();
  }

  if (typeof entry.component === 'string' && entry.component.trim()) {
    return entry.component.trim();
  }

  return null;
}

async function readComponentInventory() {
  const source = await readFile(MANIFEST_PATH, 'utf8');
  const manifest = JSON.parse(source);

  if (!Array.isArray(manifest.componentInventory)) {
    throw new Error('Manifest is missing a valid componentInventory array.');
  }

  return manifest.componentInventory;
}

async function postDrawComponent(component) {
  const payload = {
    type: 'draw-component',
    component,
  };

  const response = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text().catch(() => '');
  if (!response.ok) {
    const detail = responseText ? ` ${truncate(responseText)}` : '';
    throw new Error(`HTTP ${response.status} ${response.statusText}.${detail}`.trim());
  }
}

async function main() {
  console.log('🎨 HDS Figma canvas setup');
  console.log(`🌉 Bridge: ${BRIDGE_URL}`);
  console.log(`📄 Manifest: ${MANIFEST_PATH}`);

  const rawInventory = await readComponentInventory();
  const components = rawInventory
    .map(normalizeComponentName)
    .filter(Boolean);

  const skipped = rawInventory.length - components.length;
  if (components.length === 0) {
    throw new Error('No valid component names were found in componentInventory.');
  }

  if (skipped > 0) {
    console.warn(`⚠️  Skipping ${skipped} manifest entr${skipped === 1 ? 'y' : 'ies'} without a usable component name.`);
  }

  console.log(`🧩 Components queued: ${components.length}`);
  console.log(`⏱️  Delay between requests: ${DELAY_MS}ms`);
  console.log('');

  let successCount = 0;
  let failureCount = 0;

  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const label = `[${index + 1}/${components.length}] ${component}`;

    console.log(`⏳ Drawing ${label}...`);

    try {
      await postDrawComponent(component);
      successCount += 1;
      console.log(`✅ ${component} drawn`);
    } catch (error) {
      failureCount += 1;
      console.error(`❌ Failed to draw ${component}: ${error.message}`);
    }

    if (index < components.length - 1) {
      await delay(DELAY_MS);
    }
  }

  console.log('');
  console.log(`🏁 Canvas setup complete. Success: ${successCount} · Failed: ${failureCount}`);

  if (failureCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`❌ setup-figma-canvas failed: ${error.message}`);
  process.exitCode = 1;
});
