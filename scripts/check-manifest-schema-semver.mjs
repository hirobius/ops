#!/usr/bin/env node

/**
 * check-manifest-schema-semver.mjs
 *
 * Compares the current manifest/schema.json against manifest/schema.lock.json
 * and flags breaking changes (property removals, type tightenings) as semver violations.
 *
 * Breaking changes: property removals, type changes that reduce acceptable values
 * Minor changes: new properties, enum expansions, relaxations
 *
 * Exit codes:
 *   0 - No breaking changes
 *   1 - Breaking changes detected
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const lockPath = path.join(projectRoot, 'manifest', 'schema.lock.json');
const currentPath = path.join(projectRoot, 'manifest', 'schema.json');

// ──────────────────────────────────────────────────────────────────────────────

function loadSchema(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function getPropertyType(schema) {
  if (schema.type) return schema.type;
  if (schema.$ref) return schema.$ref;
  if (schema.enum) return `enum: [${schema.enum.join(', ')}]`;
  if (schema.oneOf) return 'oneOf';
  if (schema.anyOf) return 'anyOf';
  return 'unknown';
}

/**
 * Compare two schema objects and detect breaking changes.
 * Returns an object with arrays of breaking and minor changes.
 */
function compareSchemas(oldSchema, newSchema, path = '') {
  const breaking = [];
  const minor = [];

  // Check for property removals (breaking)
  if (oldSchema.properties && newSchema.properties) {
    for (const prop of Object.keys(oldSchema.properties)) {
      if (!(prop in newSchema.properties)) {
        breaking.push(
          `Property removed: ${path ? path + '.' : ''}${prop}`
        );
      }
    }
  }

  // Check for required field removals (breaking)
  if (oldSchema.required && newSchema.required) {
    for (const field of oldSchema.required) {
      if (!newSchema.required.includes(field)) {
        breaking.push(
          `Required field removed: ${path ? path + '.' : ''}${field}`
        );
      }
    }
  }

  // Check for new required fields (breaking for consumers)
  if (oldSchema.required && newSchema.required) {
    for (const field of newSchema.required) {
      if (!oldSchema.required.includes(field)) {
        breaking.push(
          `New required field: ${path ? path + '.' : ''}${field}`
        );
      }
    }
  }

  // Check for new properties (minor, non-breaking)
  if (newSchema.properties && oldSchema.properties) {
    for (const prop of Object.keys(newSchema.properties)) {
      if (!(prop in oldSchema.properties)) {
        minor.push(
          `Property added: ${path ? path + '.' : ''}${prop}`
        );
      }
    }
  }

  // Check for type changes in existing properties
  if (oldSchema.properties && newSchema.properties) {
    for (const prop of Object.keys(oldSchema.properties)) {
      if (prop in newSchema.properties) {
        const oldProp = oldSchema.properties[prop];
        const newProp = newSchema.properties[prop];

        // Check if type changed
        const oldType = getPropertyType(oldProp);
        const newType = getPropertyType(newProp);

        if (oldType !== newType) {
          // A type change is generally breaking unless it's a widening (e.g. string -> string|number)
          breaking.push(
            `Type changed: ${path ? path + '.' : ''}${prop} (was ${oldType}, now ${newType})`
          );
        }

        // Recursively check nested objects
        if (oldProp.type === 'object' && newProp.type === 'object') {
          const nested = compareSchemas(oldProp, newProp, `${path ? path + '.' : ''}${prop}`);
          breaking.push(...nested.breaking);
          minor.push(...nested.minor);
        }
      }
    }
  }

  return { breaking, minor };
}

// ──────────────────────────────────────────────────────────────────────────────

try {
  const oldSchema = loadSchema(lockPath);
  const newSchema = loadSchema(currentPath);

  const { breaking, minor } = compareSchemas(oldSchema, newSchema);

  // Report minor changes (non-blocking)
  if (minor.length > 0) {
    console.log('Minor changes (non-breaking):');
    minor.forEach(msg => console.log(`  + ${msg}`));
    console.log();
  }

  // Report and fail on breaking changes
  if (breaking.length > 0) {
    console.error('Breaking changes detected:');
    breaking.forEach(msg => console.error(`  - ${msg}`));
    console.error();
    console.error('To approve breaking changes:');
    console.error('  1. Update manifest/schema.lock.json to match manifest/schema.json');
    console.error('  2. Bump the manifest schema version field');
    console.error('  3. Document the breaking change in CHANGELOG.md');
    process.exit(1);
  } else {
    console.log('Schema check passed — no breaking changes detected.');
    process.exit(0);
  }
} catch (err) {
  console.error('Error during schema comparison:', err.message);
  process.exit(1);
}
