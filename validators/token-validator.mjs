/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * validators/token-validator.mjs
 * Walks a JSX AST and flags raw color/dimension literals in attribute values.
 * All visual values must be token paths or var: shorthands.
 */

import { parse } from './parse-jsx.mjs';

const RAW_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\(|lab\()/;
const RAW_DIMENSION_RE = /^\d+(\.\d+)?(px|rem|em|ch|vh|vw)$/;
const RAW_FONT_RE = /^\d+(\.\d+)?(px|pt|em|rem)$/;

const VISUAL_PROPS = new Set([
  'fill', 'color', 'background', 'backgroundColor', 'borderColor',
  'stroke', 'padding', 'margin', 'gap', 'fontSize', 'borderRadius',
  'width', 'height', 'paddingX', 'paddingY', 'paddingTop', 'paddingBottom',
  'paddingLeft', 'paddingRight', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
]);

function isRawValue(value, attrName) {
  if (typeof value !== 'string') return false;
  if (RAW_COLOR_RE.test(value)) return { code: 'RAW_COLOR', message: `Raw color "${value}" — use a semantic token path` };
  if (attrName === 'fontSize' && RAW_FONT_RE.test(value)) return { code: 'RAW_FONT', message: `Raw font value "${value}" — use a typography token` };
  if (RAW_DIMENSION_RE.test(value)) return { code: 'RAW_DIMENSION', message: `Raw dimension "${value}" — use a token path` };
  return false;
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
    const tagName = element.openingElement?.name?.name || 'unknown';
    const attrs = element.openingElement?.attributes || [];

    for (const attr of attrs) {
      if (attr.type === 'JSXSpreadAttribute') continue;
      const attrName = attr.name?.name;
      if (!attrName || !VISUAL_PROPS.has(attrName)) continue;

      const val = attr.value?.type === 'Literal' ? attr.value.value : null;
      if (val === null) continue;

      const issue = isRawValue(val, attrName);
      if (issue) {
        errors.push({
          path: `${tagName}.${attrName}`,
          code: issue.code,
          message: issue.message,
          suggestion: 'Replace with a semantic token path like "semantic.color.surface.raised" or var: shorthand'
        });
      }
    }
  });

  return { ok: errors.length === 0, errors };
}
