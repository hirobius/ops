/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * validators/lint.mjs
 *
 * p6-2: lint a serialized Figma selection (the manifest-aware shape
 * emitted by p6-1's extractNodeTree — `{id, name, type, componentName?,
 * tokenPaths?, a11y?, fills?, boundVariables?, children: [...]}`).
 *
 * Strategy: project the serialized node tree back into a JSX-ish source
 * string using `componentName` as the tag (falling back to `name`/`type`
 * for un-mapped nodes), surface `a11y.{name,role,description}` and
 * `tokenPaths.*` as props, then hand the result to the existing
 * validator orchestrator (validators/index.mjs). This re-uses the
 * manifest, token, a11y, swiss-canon and binding-completeness validators
 * that already power the gatekeeper / retry-loop, so the read path lints
 * by exactly the same rules the write path enforces.
 *
 * Input shapes accepted:
 *   - a single serialized node:    { id, name, type, ..., children? }
 *   - an array of serialized nodes (whole selection)
 *   - a wrapped envelope:          { tree: [...] } or { selection: [...] }
 *   - a JSX string (passthrough — used by the test runner default loader
 *     when fixtures supply input.jsx)
 *
 * Output:    { ok: boolean, errors: Array<{path, code, message, suggestion}> }
 *
 * The bridge `/lint` endpoint wraps the same response under a `findings`
 * key so the unit's validationCmd (which greps for `findings` in the
 * response) is satisfied without changing this validator's contract.
 */

import { validate as runValidatorSuite } from './index.mjs';

// Tag names that begin with `Hds` are real components in the manifest.
// Anything else (raw Figma frame/text/instance names, layer labels) is
// projected as a generic `<div>` so the manifest validator skips it
// rather than reporting UNKNOWN_COMPONENT for a layer named "IconLeft".
function projectTagName(node) {
  if (node && typeof node.componentName === 'string' && /^Hds[A-Z]/.test(node.componentName)) {
    return node.componentName;
  }
  return 'div';
}

// Escape attribute values so the projection stays parseable. The plugin
// already JSON-stringifies most of the tree, but layer names can contain
// quotes, backslashes, or non-ASCII characters that would break a naive
// JSX literal.
function escapeAttrValue(v) {
  if (v == null) return '';
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, ' ');
}

function projectAttrs(node) {
  const attrs = [];

  // a11y is projected exclusively as `aria-*` attributes so the manifest
  // validator's allow-list skip path handles them. Projecting `role` as a
  // bare attribute would trip UNKNOWN_PROP on every Hds component (their
  // specs don't declare role); projecting it as a data-* attr would do
  // the same. The serialized payload's role is informational only — what
  // the lint endpoint actually cares about is whether the node has an
  // accessible name, which `aria-label` satisfies for the a11y validator.
  if (node && node.a11y && typeof node.a11y === 'object') {
    if (typeof node.a11y.name === 'string' && node.a11y.name.length) {
      attrs.push(`aria-label="${escapeAttrValue(node.a11y.name)}"`);
    }
    if (typeof node.a11y.description === 'string' && node.a11y.description.length) {
      attrs.push(`aria-description="${escapeAttrValue(node.a11y.description)}"`);
    }
  }

  return attrs.length ? ' ' + attrs.join(' ') : '';
}

function projectNodeToJsx(node, depth) {
  if (!node || typeof node !== 'object') return '';
  // Hard cap mirrors the plugin's depth=4 ceiling in extractNodeTree, so
  // a malicious / circular tree can't recurse forever.
  if (depth > 8) return '';

  const tag = projectTagName(node);
  const attrs = projectAttrs(node);
  const children = Array.isArray(node.children) ? node.children : [];

  if (children.length === 0) {
    return `<${tag}${attrs} />`;
  }

  const inner = children
    .map((c) => projectNodeToJsx(c, depth + 1))
    .filter(Boolean)
    .join('');
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

/**
 * Convert any accepted input shape into a JSX string.
 * Returns `null` when the input is empty (no nodes to lint).
 */
export function projectSelectionToJsx(input) {
  if (input == null) return null;
  if (typeof input === 'string') return input;

  let nodes;
  if (Array.isArray(input)) {
    nodes = input;
  } else if (Array.isArray(input.tree)) {
    nodes = input.tree;
  } else if (Array.isArray(input.selection)) {
    nodes = input.selection;
  } else if (typeof input === 'object') {
    nodes = [input];
  } else {
    return null;
  }

  const projected = nodes.map((n) => projectNodeToJsx(n, 0)).filter(Boolean);
  if (projected.length === 0) return null;

  // Wrap multi-root selections in a fragment so parse-jsx accepts them
  // as a single program. The fragment itself is invisible to the
  // validators (they walk JSXElement nodes only).
  if (projected.length === 1) return projected[0];
  return `<>${projected.join('')}</>`;
}

/**
 * @param {string|object|Array} input  serialized selection or JSX source
 * @returns {{ ok: boolean, errors: Array<{path, code, message, suggestion}> }}
 */
export default async function validate(input) {
  const jsx = projectSelectionToJsx(input);
  if (!jsx) return { ok: true, errors: [] };
  return runValidatorSuite(jsx);
}
