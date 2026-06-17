/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * validators/manifest-validator.mjs
 * Walks a JSX AST and validates every element against componentSpecs
 * in public/hds-manifest.json.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse } from './parse-jsx.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadManifest() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'public/hds-manifest.json'), 'utf8'));
}

function walkJsx(node, visitor) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'JSXElement') visitor(node);
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach(c => walkJsx(c, visitor));
    else if (child && typeof child === 'object') walkJsx(child, visitor);
  }
}

function getElementName(node) {
  const name = node.openingElement?.name;
  if (!name) return null;
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') return `${name.object.name}.${name.property.name}`;
  return null;
}

function getAttributeName(attr) {
  return attr.name?.type === 'JSXIdentifier' ? attr.name.name : null;
}

function getAttributeStringValue(attr) {
  if (attr.value?.type === 'Literal') return attr.value.value;
  return null;
}

/**
 * @param {string} jsxString
 * @returns {{ ok: boolean, errors: Array<{path, code, message, suggestion}> }}
 */
export default async function validate(jsxString) {
  const parsed = parse(jsxString);
  if (!parsed.ok) return { ok: false, errors: [{ path: '', code: 'PARSE_ERROR', message: parsed.error, suggestion: 'Fix JSX syntax' }] };

  const manifest = loadManifest();
  const specs = manifest.componentSpecs || {};
  const errors = [];

  walkJsx(parsed.ast, (element) => {
    const name = getElementName(element);
    if (!name) return;

    // Skip HTML/native elements (lowercase)
    if (name[0] === name[0].toLowerCase()) return;

    const spec = specs[name];
    if (!spec) {
      errors.push({ path: name, code: 'UNKNOWN_COMPONENT', message: `"${name}" is not in componentSpecs`, suggestion: `Add "${name}" to public/hds-manifest.json or use an existing HDS component` });
      return;
    }

    const knownProps = spec.props || {};
    const constraints = spec.propConstraints || {};
    const attrs = element.openingElement?.attributes || [];

    for (const attr of attrs) {
      if (attr.type === 'JSXSpreadAttribute') continue;
      const attrName = getAttributeName(attr);
      if (!attrName) continue;
      if (attrName.startsWith('aria-') || attrName === 'className' || attrName === 'style' || attrName === 'key' || attrName === 'ref') continue;

      if (!(attrName in knownProps)) {
        errors.push({ path: `${name}.${attrName}`, code: 'UNKNOWN_PROP', message: `"${attrName}" is not a known prop of ${name}`, suggestion: `Valid props: ${Object.keys(knownProps).join(', ')}` });
        continue;
      }

      const constraint = constraints[attrName];
      if (constraint?.type === 'enum' && constraint.values?.length) {
        const val = getAttributeStringValue(attr);
        if (val !== null && !constraint.values.includes(val)) {
          errors.push({ path: `${name}.${attrName}`, code: 'INVALID_PROP_VALUE', message: `"${val}" is not a valid value for ${name}.${attrName}`, suggestion: `Valid values: ${constraint.values.join(', ')}` });
        }
      }
    }
  });

  return { ok: errors.length === 0, errors };
}
