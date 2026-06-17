/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * validators/10f-7-xpath-query-endpoint.mjs
 *
 * 10f-7: Validate that an XPath query result (the payload the plugin
 * returns in response to a //TYPE[@attr~=value] selector) is well-formed
 * and that each node in the result conforms to the p6-1 serialized node
 * shape.
 *
 * Input shapes accepted:
 *   - A query result object: { ok, selector, count, nodes: [...] }
 *   - A wrapped envelope:    { result: {...} }
 *
 * Output: { ok: boolean, errors: Array<{path, code, message}> }
 */

function err(path, code, message) {
  return { path, code, message };
}

function validateSerializedNode(node, path) {
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

// Validate the parsed XPath selector syntax: //TYPE, //TYPE[@attr],
// //TYPE[@attr=value], //TYPE[@attr~=value]. Empty TYPE means any type.
function validateSelector(selector) {
  if (typeof selector !== 'string' || !selector.trim()) {
    return { ok: false, error: 'selector must be a non-empty string' };
  }
  const s = selector.trim();
  if (!s.startsWith('//')) {
    return { ok: false, error: 'selector must start with //' };
  }
  const body = s.slice(2);
  if (!/^[A-Z_]*(\[[^\]]+\])?$/.test(body)) {
    return { ok: false, error: 'unsupported selector syntax' };
  }
  const predMatch = body.match(/\[([^\]]+)\]$/);
  if (predMatch) {
    const pred = predMatch[1];
    if (!/^@[\w]+(~=.+|=.+|)$/.test(pred)) {
      return { ok: false, error: 'unsupported predicate; use @attr, @attr=value, or @attr~=value' };
    }
  }
  return { ok: true };
}

export default function validateXpathQueryResult(input) {
  const errors = [];

  // Unwrap { result: {...} } envelope
  let result = input;
  if (input && typeof input === 'object' && !Array.isArray(input) && input.result) {
    result = input.result;
  }

  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { ok: false, errors: [err('', 'INVALID_INPUT', 'input must be a query result object or { result: QueryResult }')] };
  }

  // ok field
  if (typeof result.ok !== 'boolean')
    errors.push(err('ok', 'MISSING_OK', 'result.ok must be a boolean'));

  // selector — validate syntax when present
  if (result.selector !== undefined) {
    const sv = validateSelector(result.selector);
    if (!sv.ok)
      errors.push(err('selector', 'INVALID_SELECTOR', sv.error));
  }

  // count — must match nodes.length when both are present
  if (result.count !== undefined && typeof result.count !== 'number')
    errors.push(err('count', 'INVALID_COUNT', 'result.count must be a number'));

  // nodes array
  if (!Array.isArray(result.nodes)) {
    errors.push(err('nodes', 'MISSING_NODES', 'result.nodes must be an array'));
  } else {
    if (result.count !== undefined && typeof result.count === 'number' && result.count !== result.nodes.length) {
      errors.push(err('count', 'COUNT_MISMATCH', `result.count (${result.count}) does not match result.nodes.length (${result.nodes.length})`));
    }
    result.nodes.forEach((node, i) => {
      validateSerializedNode(node, `nodes[${i}]`).forEach(e => errors.push(e));
    });
  }

  return { ok: errors.length === 0, errors };
}
