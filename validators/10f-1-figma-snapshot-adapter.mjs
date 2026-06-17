/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * validators/10f-1-figma-snapshot-adapter.mjs
 *
 * 10f-1: Validate that a FigmaSnapshot object conforms to the normalized
 * shape defined in protocol/figma-snapshot.schema.json.
 *
 * Input shapes accepted:
 *   - A full FigmaSnapshot: { snapshotAt, pages, variables, styles, ... }
 *   - A wrapped envelope:   { snapshot: <FigmaSnapshot> }
 *
 * Output: { ok: boolean, errors: Array<{path, code, message}> }
 *
 * This validator is intentionally structural (not a full JSON-Schema
 * runner): it checks required top-level fields, that pages is an array
 * of PageSummary objects with the expected shape, that variables is an
 * object of VariableCollection records with required keys, and that styles
 * has the four required groups. It does NOT execute the plugin or bridge.
 */

function err(path, code, message) {
  return { path, code, message };
}

function validateNode(node, path) {
  const errors = [];
  if (!node || typeof node !== 'object') {
    errors.push(err(path, 'INVALID_NODE', 'node must be an object'));
    return errors;
  }
  if (typeof node.id !== 'string' || !node.id)
    errors.push(err(path + '.id', 'MISSING_ID', 'node.id must be a non-empty string'));
  if (typeof node.name !== 'string')
    errors.push(err(path + '.name', 'MISSING_NAME', 'node.name must be a string'));
  if (typeof node.type !== 'string' || !node.type)
    errors.push(err(path + '.type', 'MISSING_TYPE', 'node.type must be a non-empty string'));
  if (node.children !== undefined && !Array.isArray(node.children))
    errors.push(err(path + '.children', 'INVALID_CHILDREN', 'node.children must be an array when present'));
  return errors;
}

function validatePageSummary(page, path) {
  const errors = [];
  if (!page || typeof page !== 'object') {
    errors.push(err(path, 'INVALID_PAGE', 'page must be an object'));
    return errors;
  }
  if (typeof page.id !== 'string' || !page.id)
    errors.push(err(path + '.id', 'MISSING_ID', 'page.id must be a non-empty string'));
  if (typeof page.name !== 'string')
    errors.push(err(path + '.name', 'MISSING_NAME', 'page.name must be a string'));
  if (page.type !== 'PAGE')
    errors.push(err(path + '.type', 'WRONG_TYPE', 'page.type must be "PAGE"'));
  if (page.frames !== undefined) {
    if (!Array.isArray(page.frames)) {
      errors.push(err(path + '.frames', 'INVALID_FRAMES', 'page.frames must be an array when present'));
    } else {
      page.frames.forEach((f, i) => {
        validateNode(f, `${path}.frames[${i}]`).forEach(e => errors.push(e));
      });
    }
  }
  return errors;
}

function validateVariableCollection(coll, path) {
  const errors = [];
  if (!coll || typeof coll !== 'object') {
    errors.push(err(path, 'INVALID_COLLECTION', 'variable collection must be an object'));
    return errors;
  }
  if (typeof coll.id !== 'string' || !coll.id)
    errors.push(err(path + '.id', 'MISSING_ID', 'collection.id must be a non-empty string'));
  if (typeof coll.name !== 'string')
    errors.push(err(path + '.name', 'MISSING_NAME', 'collection.name must be a string'));
  if (!Array.isArray(coll.modes))
    errors.push(err(path + '.modes', 'MISSING_MODES', 'collection.modes must be an array'));
  if (!Array.isArray(coll.variables))
    errors.push(err(path + '.variables', 'MISSING_VARIABLES', 'collection.variables must be an array'));
  else {
    coll.variables.forEach((v, i) => {
      const vp = `${path}.variables[${i}]`;
      if (!v || typeof v !== 'object') {
        errors.push(err(vp, 'INVALID_VARIABLE', 'variable must be an object'));
        return;
      }
      if (typeof v.id !== 'string' || !v.id)
        errors.push(err(vp + '.id', 'MISSING_ID', 'variable.id must be a non-empty string'));
      if (typeof v.name !== 'string')
        errors.push(err(vp + '.name', 'MISSING_NAME', 'variable.name must be a string'));
      if (typeof v.tokenPath !== 'string' || !v.tokenPath)
        errors.push(err(vp + '.tokenPath', 'MISSING_TOKEN_PATH', 'variable.tokenPath must be a non-empty dot-notation string'));
      if (!['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'].includes(v.resolvedType))
        errors.push(err(vp + '.resolvedType', 'INVALID_RESOLVED_TYPE', `variable.resolvedType must be COLOR|FLOAT|STRING|BOOLEAN, got ${JSON.stringify(v.resolvedType)}`));
    });
  }
  return errors;
}

function validateStyles(styles, path) {
  const errors = [];
  if (!styles || typeof styles !== 'object') {
    errors.push(err(path, 'MISSING_STYLES', 'styles must be an object'));
    return errors;
  }
  for (const key of ['paint', 'text', 'effect', 'grid']) {
    if (!Array.isArray(styles[key]))
      errors.push(err(`${path}.${key}`, 'MISSING_STYLE_GROUP', `styles.${key} must be an array`));
  }
  return errors;
}

export default function validateSnapshot(input) {
  const errors = [];

  // Unwrap envelope shape: { snapshot: {...} }
  let snapshot = input;
  if (input && typeof input === 'object' && !Array.isArray(input) && input.snapshot) {
    snapshot = input.snapshot;
  }

  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { ok: false, errors: [err('', 'INVALID_INPUT', 'input must be a FigmaSnapshot object (or { snapshot: FigmaSnapshot })') ] };
  }

  // Required: snapshotAt
  if (typeof snapshot.snapshotAt !== 'string' || !snapshot.snapshotAt)
    errors.push(err('snapshotAt', 'MISSING_SNAPSHOT_AT', 'snapshotAt must be a non-empty ISO-8601 string'));

  // Required: pages
  if (!Array.isArray(snapshot.pages)) {
    errors.push(err('pages', 'MISSING_PAGES', 'pages must be an array'));
  } else {
    snapshot.pages.forEach((p, i) => {
      validatePageSummary(p, `pages[${i}]`).forEach(e => errors.push(e));
    });
  }

  // Required: variables
  if (!snapshot.variables || typeof snapshot.variables !== 'object' || Array.isArray(snapshot.variables)) {
    errors.push(err('variables', 'MISSING_VARIABLES', 'variables must be an object keyed by HDS collection name'));
  } else {
    for (const [key, coll] of Object.entries(snapshot.variables)) {
      validateVariableCollection(coll, `variables['${key}']`).forEach(e => errors.push(e));
    }
  }

  // Required: styles
  validateStyles(snapshot.styles, 'styles').forEach(e => errors.push(e));

  // Optional: components (array when present)
  if (snapshot.components !== undefined && !Array.isArray(snapshot.components))
    errors.push(err('components', 'INVALID_COMPONENTS', 'components must be an array when present'));

  return { ok: errors.length === 0, errors };
}
