/**
 * tests/check-source-canon.spec.ts
 *
 * Fixture tests for scripts/check-source-canon.mjs rule detection.
 * These validate that new rules are correctly wired and will catch violations.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('check-source-canon: DATA_TENANT rule', () => {
  it('should flag [data-tenant=] selectors in component CSS', () => {
    // Create a test fixture with a data-tenant selector
    const fixtureDir = path.join(ROOT, 'src/app/components');
    const fixturePath = path.join(fixtureDir, '__test-data-tenant-fixture.tsx');
    const content = `
import React from 'react';

export function TestComponent() {
  return <div className="test">Test</div>;
}

/* Violating style: [data-tenant=bilingual] .nested { color: red; } */
`;

    fs.writeFileSync(fixturePath, content, 'utf8');

    try {
      // Run the validator
      const output = execSync(`node ${path.join(ROOT, 'scripts/check-source-canon.mjs')}`, {
        encoding: 'utf8',
        stdio: 'pipe',
      }).catch((err: any) => err.stdout + err.stderr);

      // The validator should exit with error and flag the DATA_TENANT violation
      expect(output).toContain('DATA_TENANT');
      expect(output).toContain('data-tenant=');
    } finally {
      // Clean up fixture
      if (fs.existsSync(fixturePath)) {
        fs.unlinkSync(fixturePath);
      }
    }
  });

  it('should NOT flag [data-tenant=] selectors in src/styles/tokens.css', () => {
    // Verify that tokens.css is exempt by checking the validator logic
    // (The file itself should have DATA_TENANT selectors as the source of truth)
    const tokensCssPath = path.join(ROOT, 'src/styles/tokens.css');
    expect(fs.existsSync(tokensCssPath)).toBe(true);

    // The validator should pass because tokens.css is exempted
    const output = execSync(`node ${path.join(ROOT, 'scripts/check-source-canon.mjs')} --verbose`, {
      encoding: 'utf8',
      stdio: 'pipe',
    }).catch((err: any) => {
      // Validator may exit 1 if OTHER violations exist, but check output
      if (err.stdout && err.stdout.includes('DATA_TENANT')) {
        throw new Error('DATA_TENANT rule wrongly flagged in tokens.css');
      }
      return err.stdout || '';
    });

    // If no other violations, should exit cleanly; if there are violations,
    // they should not be DATA_TENANT in tokens.css
    expect(output).not.toContain('src/styles/tokens.css:');
  });
});
