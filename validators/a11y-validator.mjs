/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * validators/a11y-validator.mjs
 * Checks JSX AST for WCAG-grounded accessibility issues.
 * Reads a11yRules from componentSpecs in the manifest.
 */

import { parse } from './parse-jsx.mjs';

const INTERACTIVE_COMPONENTS = new Set(['HdsButton', 'HdsIconButton', 'HdsInput', 'HdsSelect', 'HdsTag']);

function hasAccessibleName(attrs) {
  return attrs.some(attr => {
    if (attr.type === 'JSXSpreadAttribute') return false;
    const name = attr.name?.name;
    return name === 'label' || name === 'aria-label' || name === 'aria-labelledby';
  });
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

/**
 * @param {string} jsxString
 * @returns {{ ok: boolean, errors: Array<{path, code, message, suggestion}> }}
 */
export default async function validate(jsxString) {
  const parsed = parse(jsxString);
  if (!parsed.ok) return { ok: false, errors: [{ path: '', code: 'PARSE_ERROR', message: parsed.error, suggestion: 'Fix JSX syntax' }] };

  const errors = [];

  walkJsx(parsed.ast, (element) => {
    const tagName = element.openingElement?.name?.name;
    if (!tagName) return;
    const attrs = element.openingElement?.attributes || [];

    if (INTERACTIVE_COMPONENTS.has(tagName)) {
      if (!hasAccessibleName(attrs)) {
        errors.push({
          path: tagName,
          code: 'MISSING_ACCESSIBLE_NAME',
          message: `${tagName} must have an accessible name`,
          suggestion: 'Add a label prop (label="...") or aria-label="..."'
        });
      }
    }
  });

  return { ok: errors.length === 0, errors };
}
