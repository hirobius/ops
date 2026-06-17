#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
// Zero-dependency HTML / HDS JSX → ADD_NODE compiler.
// Called by generate-to-figma.mjs when the LLM emits markup instead of JSON.
//
// Accepted input formats:
//   HDS JSX:  <HdsFrame fill="semantic.color.surface.raised" layout="VERTICAL" padding="24" gap="16">
//   Standard HTML: <div class="card"><h3>Title</h3><p>Body</p></div>
//   Mixed with prose (markdown fences, explanations) — non-tag content is discarded.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Manifest lazy-loader (zero-IO until first INSTANCE) ───────────────────────
// Compiler needs componentSpecs to translate React prop names into Figma variant
// property names (p4-3) and to look up component descriptions (p4-4). Cached at
// module scope; reloaded only when the module is re-imported.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, '..', 'public', 'hds-manifest.json');
let _manifestSpecs = null;
function getComponentSpec(componentName) {
  if (_manifestSpecs === null) {
    try {
      _manifestSpecs = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')).componentSpecs || {};
    } catch { _manifestSpecs = {}; }
  }
  return _manifestSpecs[componentName] || null;
}

// ── var: shorthand resolver ───────────────────────────────────────────────────
// <HdsFrame fill="var:color.surface.raised"> expands to the full token path
// semantic.color.surface.raised. If already fully-qualified, passes through.
function resolveVar(val) {
  if (typeof val !== 'string' || val.slice(0, 4) !== 'var:') return val;
  const short = val.slice(4).trim();
  if (/^(semantic|primitive|component)\./.test(short)) return short;
  return 'semantic.' + short;
}

// For dimension props: expand var: aliases or coerce plain "16" → 16 so
// streamResolveDimensionSync receives either a token-path string or a number.
function resolveDim(val) {
  const v = resolveVar(val);
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

// ── Expression-container resolver ─────────────────────────────────────────────
// Resolves `{value}` from a JSX attribute position. Literals are unwrapped to
// their JS value (boolean/number/string/null/undefined). `tokens.X.Y` references
// normalize to the canonical token-path string (semantic. prefix injected unless
// already qualified). Anything else passes through as { __expr: source } so
// downstream consumers can preserve or surface it without losing intent.
function resolveExpression(expr) {
  const t = expr.trim();
  if (t === '') return undefined;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (t === 'undefined') return undefined;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  const dq = t.match(/^"([^"]*)"$/);
  if (dq) return dq[1];
  const sq = t.match(/^'([^']*)'$/);
  if (sq) return sq[1];
  const bt = t.match(/^`([^`]*)`$/);
  if (bt) return bt[1];
  const tokRef = t.match(/^tokens\.([A-Za-z0-9._-]+)$/);
  if (tokRef) {
    const path = tokRef[1];
    if (/^(semantic|primitive|component)\./.test(path)) return path;
    return 'semantic.' + path;
  }
  return { __expr: t };
}

// ── Attribute parser ──────────────────────────────────────────────────────────
function parseAttrs(rawAttrs) {
  const attrs = {};
  const re = /([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\}|([^\s>/"]+)))?/g;
  let m;
  while ((m = re.exec(rawAttrs)) !== null) {
    if (m[4] !== undefined) {
      attrs[m[1]] = resolveExpression(m[4]);
    } else {
      attrs[m[1]] = m[2] ?? m[3] ?? m[5] ?? true;
    }
  }
  return attrs;
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────
const SKIP_RE = /^(script|style|meta|link|head|html|body|!--)$/i;

// Pre-process JSX expression children at text positions (between > and <).
// `{cond && <Tag .../>}` → `<Tag ... data-hds-conditional="true" />`
//   (emit the tag unconditionally; downstream marks the command conditional)
// `{anything else}` (ternary, complex expr, plain identifier) → discarded
// JSX attribute expressions inside tag bodies (between < and >) are left alone
// so parseAttrs can resolve them via resolveExpression(). Limited scope: only
// single self-closing tag with `&&` operator is recognized; nested or
// non-self-closing conditionals fall through and are dropped.
function preprocessChildExpressions(src) {
  let out = '';
  let i = 0;
  let inTag = false;
  while (i < src.length) {
    const c = src[i];
    if (!inTag && c === '<') { inTag = true; out += c; i++; continue; }
    if (inTag && c === '>') { inTag = false; out += c; i++; continue; }
    if (!inTag && c === '{') {
      const close = src.indexOf('}', i + 1);
      if (close === -1) { out += c; i++; continue; }
      const expr = src.slice(i + 1, close);
      const cond = expr.match(/^[^&]*&&\s*(<[A-Za-z][^>]*\/>)\s*$/);
      if (cond) {
        out += cond[1].replace(/\s*\/>$/, ' data-hds-conditional="true" />');
      }
      i = close + 1;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function tokenize(input) {
  const stripped = input.replace(/```[\w]*\n?/g, '').replace(/```/g, '');
  const src = preprocessChildExpressions(stripped);
  const tokens = [];
  // Allow empty tag name to support fragment shorthand `<>` and `</>`.
  const TAG_RE = /<(\/?)([A-Za-z][A-Za-z0-9._:-]*)?([^>]*?)(\/?)>/g;
  let last = 0;
  let m;

  while ((m = TAG_RE.exec(src)) !== null) {
    const text = src.slice(last, m.index).trim();
    if (text) tokens.push({ kind: 'text', value: text });
    last = TAG_RE.lastIndex;

    const [, close, name, rawAttrs, selfSlash] = m;

    // Fragment shorthand: only exact <> and </> are recognized; any other
    // empty-name match (e.g. `< 5>`) is dropped silently.
    if (!name) {
      if (rawAttrs === '' && !selfSlash) {
        tokens.push({ kind: close ? 'fragment-close' : 'fragment-open' });
      }
      continue;
    }

    if (SKIP_RE.test(name)) continue;

    if (close) {
      tokens.push({ kind: 'close', name });
    } else if (selfSlash || rawAttrs.trimEnd().endsWith('/')) {
      tokens.push({ kind: 'self', name, attrs: parseAttrs(rawAttrs.replace(/\/$/, '')) });
    } else {
      tokens.push({ kind: 'open', name, attrs: parseAttrs(rawAttrs) });
    }
  }

  const trailing = src.slice(last).trim();
  if (trailing) tokens.push({ kind: 'text', value: trailing });
  return tokens;
}

// ── Tree builder ──────────────────────────────────────────────────────────────
function buildTree(tokens) {
  const root = { name: '__root__', attrs: {}, children: [] };
  const stack = [root];

  for (const tok of tokens) {
    const parent = stack[stack.length - 1];
    if (tok.kind === 'open') {
      const node = { name: tok.name, attrs: tok.attrs, children: [] };
      parent.children.push(node);
      stack.push(node);
    } else if (tok.kind === 'close') {
      while (stack.length > 1 && stack[stack.length - 1].name !== tok.name) stack.pop();
      if (stack.length > 1) stack.pop();
    } else if (tok.kind === 'self') {
      parent.children.push({ name: tok.name, attrs: tok.attrs, children: [] });
    } else if (tok.kind === 'text') {
      parent.children.push({ name: '__text__', text: tok.value, children: [] });
    } else if (tok.kind === 'fragment-open') {
      // Fragments are transparent: their children attach to the current parent
      // when treeToCommands flattens them. The marker stays in the tree only
      // for stack discipline during build.
      const node = { name: '__fragment__', attrs: {}, children: [] };
      parent.children.push(node);
      stack.push(node);
    } else if (tok.kind === 'fragment-close') {
      while (stack.length > 1 && stack[stack.length - 1].name !== '__fragment__') stack.pop();
      if (stack.length > 1) stack.pop();
    }
  }

  return root.children;
}

// ── Node type inference ───────────────────────────────────────────────────────
const ICON_TAGS = new Set(['Icon', 'HdsPhosphor', 'PhosphorIcon', 'Icon']);

const FRAME_TAGS = new Set([
  'HdsFrame', 'Card', 'Container', 'Grid', 'Stack',
  'div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside',
  'form', 'ul', 'ol', 'figure', 'fieldset',
]);
const TEXT_TAGS = new Set([
  'Text', 'HdsHeading', 'HdsLabel', 'HdsCaption',
  'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'label', 'li', 'dt', 'dd', 'blockquote', 'figcaption', 'small', 'strong', 'em',
]);
const INSTANCE_TAGS = new Set([
  'Button', 'Input', 'Badge', 'Tag', 'Icon',
  'button', 'input', 'select', 'textarea',
]);

function inferNodeType(name) {
  if (ICON_TAGS.has(name)) return 'ICON';
  if (FRAME_TAGS.has(name)) return 'FRAME';
  if (TEXT_TAGS.has(name)) return 'TEXT';
  if (INSTANCE_TAGS.has(name)) return 'INSTANCE';
  if (/^Hds[A-Z]/.test(name)) return 'INSTANCE';
  return 'FRAME';
}

function typographyForTag(name) {
  // Existing contract: <h1> → display (hero / page-title intent), all other
  // headings to their matching ramp slot. Fixtures lock this behavior.
  if (name === 'h1') return 'semantic.typography.display';
  if (name === 'h2') return 'semantic.typography.h2';
  if (name === 'h3') return 'semantic.typography.h3';
  if (name === 'h4' || name === 'h5' || name === 'h6') return 'semantic.typography.small';
  return 'semantic.typography.body';
}

// ── Attribute → props ─────────────────────────────────────────────────────────
function attrsToProps(tagName, attrs, textContent) {
  const p = {};

  // HDS JSX direct attribute pass-through.
  // resolveVar() expands var:X → semantic.X so authors can write short aliases.
  if (attrs.fill || attrs.background)  p.fill       = resolveVar(attrs.fill || attrs.background);
  if (attrs.stroke || attrs.border)    p.stroke     = resolveVar(attrs.stroke || attrs.border);
  if (attrs.layout)    p.layoutMode  = String(attrs.layout).toUpperCase();
  if (attrs.layoutMode) p.layoutMode = String(attrs.layoutMode).toUpperCase();
  if (attrs.gap        != null) p.itemSpacing = resolveDim(attrs.gap);
  if (attrs.itemSpacing != null) p.itemSpacing = resolveDim(attrs.itemSpacing);
  if (attrs.padding    != null) p.padding     = resolveDim(attrs.padding);
  if (attrs.paddingX   != null) p.paddingX    = resolveDim(attrs.paddingX);
  if (attrs.paddingY   != null) p.paddingY    = resolveDim(attrs.paddingY);
  if (attrs.radius     != null) p.radius      = resolveDim(attrs.radius);
  if (attrs.width      != null && attrs.width !== 'fill') p.width  = Number(attrs.width)  || undefined;
  if (attrs.height     != null && attrs.height !== 'fill') p.height = Number(attrs.height) || undefined;
  if (attrs.typography) p.typography = resolveVar(attrs.typography);
  if (attrs.variant)    p.variant    = attrs.variant;
  if (attrs.size)       p.size       = attrs.size;
  if (attrs.label)      p.label      = attrs.label;
  if (attrs.placeholder) p.placeholder = attrs.placeholder;
  if (attrs.component)  p.component  = attrs.component;
  if (attrs.name)       p.name       = attrs.name;
  if (attrs.text)       p.text       = attrs.text;

  // ICON: emit the Iconify reference and size; fill is optional for tinting.
  if (inferNodeType(tagName) === 'ICON') {
    const iconRef = attrs.icon || attrs.name || attrs.src || '';
    // Normalize: 'gear-bold' → 'ph:gear-bold', 'ph:gear' → 'ph:gear-bold' (auto-bold for Phosphor)
    let qualified = iconRef;
    if (iconRef && !iconRef.includes(':')) qualified = 'ph:' + iconRef;
    if (qualified.startsWith('ph:') && !qualified.endsWith('-bold') && !qualified.endsWith('-fill') && !qualified.endsWith('-light') && !qualified.endsWith('-thin') && !qualified.endsWith('-duotone')) {
      qualified = qualified + '-bold';
    }
    p.icon = qualified || 'ph:question-bold';
    p.size = Number(attrs.size) || 24;
    if (attrs.color || attrs.fill) p.fill = resolveVar(attrs.color || attrs.fill);
    return p;
  }

  // HTML class → semantic token heuristics
  const cls = String(attrs.class || attrs.className || '');
  if (cls) {
    if (!p.fill) {
      if (/\bcard\b|\bsurface\b|\braised\b/.test(cls))         p.fill = 'semantic.color.surface.raised';
      else if (/\bpage\b|\bbackground\b/.test(cls))            p.fill = 'semantic.color.surface.page';
      else if (/\baction\b|\bbtn\b|\bbutton\b/.test(cls))      p.fill = 'semantic.color.surface.action';
    }
    // Card containers: emit token paths so Figma variable binding fires.
    // The LLM puts padding/radius in CSS (stripped by compiler), so we inject
    // the canonical HDS tokens here instead of raw numbers.
    if (/\bcard\b/.test(cls)) {
      if (p.padding == null) p.padding = 'semantic.space.component.padding';
      if (p.radius  == null) p.radius  = 'semantic.radius.action';
    }
    if (!p.stroke && /\bborder\b/.test(cls)) p.stroke = 'semantic.color.border.default';
    if (!p.layoutMode) {
      if (/\brow\b|\bflex-row\b|\bhorizontal\b/.test(cls))     p.layoutMode = 'HORIZONTAL';
      else if (/\bcol\b|\bstack\b|\bvertical\b/.test(cls))     p.layoutMode = 'VERTICAL';
    }
    if (!p.radius && /\brounded\b/.test(cls)) p.radius = 8;
    if (!p.padding && /\bp-\d|\bpadding\b/.test(cls)) p.padding = 24;
    if (/\bheading\b|\bheader\b|\btitle\b/.test(cls) && !p.fill) p.fill = 'semantic.color.content.primary';
    if (/\bbody\b|\bdescription\b|\btext\b/.test(cls) && !p.fill) p.fill = 'semantic.color.content.secondary';
  }

  // HTML heading → typography + primary content fill
  if (/^h[1-6]$/.test(tagName)) {
    if (!p.typography) p.typography = typographyForTag(tagName);
    if (!p.fill) p.fill = 'semantic.color.content.primary';
  }

  // p / span → body typography + secondary fill
  if ((tagName === 'p' || tagName === 'span') && !p.typography) {
    p.typography = 'semantic.typography.body';
    if (!p.fill) p.fill = 'semantic.color.content.secondary';
  }

  // Inline text content from child __text__ nodes
  if (textContent && !p.text) p.text = textContent;

  // Structural defaults per node type
  const nodeType = inferNodeType(tagName);
  if (nodeType === 'FRAME') {
    if (!p.layoutMode) p.layoutMode = 'VERTICAL';
    if (!p.fill) p.fill = 'semantic.color.surface.page';
    // Use a token path so itemSpacing gets a Figma variable binding.
    if (p.itemSpacing == null) p.itemSpacing = 'semantic.space.layout.tight';
    // Always opt-in to auto-layout sizing so frames hug their children rather
    // than staying at Figma's default 100×100. Explicit width/height props
    // override this in streamApplyGeometry (resize() is called when they exist).
    p.primaryAxisSizingMode = 'AUTO';
    p.counterAxisSizingMode = 'AUTO';
  }
  if (nodeType === 'INSTANCE' && !p.component) {
    p.component = tagName.startsWith('Hds')
      ? tagName
      : 'Hds' + tagName.charAt(0).toUpperCase() + tagName.slice(1);
  }

  return p;
}

// ── A11y metadata extractor (p4-4) ────────────────────────────────────────────
// Derives a small {name?, role?, description?} object from JSX attrs. `name`
// comes from aria-label, `role` from the role prop, and `description` from an
// explicit description attr. Returns null when nothing applies — no `a11y`
// field is attached to the command in that case. Manifest description fallback
// for INSTANCE is intentionally NOT auto-injected (kept as a future additive
// extension once the selection serializer in p6-1 actually consumes it).
function extractA11yMetadata(attrs) {
  if (!attrs) return null;
  const out = {};
  if (attrs['aria-label']) out.name = String(attrs['aria-label']);
  if (attrs.role) out.role = String(attrs.role);
  if (attrs.description) out.description = String(attrs.description);
  return Object.keys(out).length ? out : null;
}

// ── Tree → ADD_NODE commands ──────────────────────────────────────────────────
let _counter = 0;
function nextId(tagName) {
  return `jsx-${tagName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}-${++_counter}`;
}

// Derive a normalized HDS component name from a JSX tag name.
// Post-rename (5bc184ea): kebab files export non-prefixed PascalCase names
// ("Button", "Card", "Text"). Pass-through; component attr still wins.
function normalizeComponentName(tagName, attrs) {
  if (attrs && attrs.component) return String(attrs.component);
  return tagName;
}

// Attrs that map to Figma component properties rather than frame geometry.
// These are emitted in the `attributes` bag on INSTANCE commands so the plugin
// can forward them to setProperties() without conflating them with layout props.
const INSTANCE_PROP_KEYS = ['variant', 'size', 'type', 'state', 'disabled', 'checked', 'icon', 'color', 'placeholder', 'label'];

// Manifest-aware attrs that, when present on a component's spec, should also
// be preserved through to figmaProperties even if they aren't in the static
// INSTANCE_PROP_KEYS list. Reads sourceProp values from componentProperties[]
// and keys from figmaPropertyMapping.
function manifestPropKeys(spec) {
  if (!spec) return [];
  const out = new Set();
  if (Array.isArray(spec.componentProperties)) {
    for (const cp of spec.componentProperties) {
      if (cp && cp.sourceProp) out.add(cp.sourceProp);
    }
  }
  if (spec.figmaPropertyMapping && typeof spec.figmaPropertyMapping === 'object') {
    for (const k of Object.keys(spec.figmaPropertyMapping)) out.add(k);
  }
  return [...out];
}

// Translate a React-shaped attribute bag to its Figma-shaped equivalent using
// the manifest's componentProperties (with optional invert) and
// figmaPropertyMapping. Returns null when the spec has no mapping data — in
// that case, no figmaProperties field should be attached to the command.
function mapInstanceAttrsToFigma(componentName, attrs) {
  const spec = getComponentSpec(componentName);
  if (!spec) return null;
  const mapping = spec.figmaPropertyMapping || null;
  const componentProps = Array.isArray(spec.componentProperties) ? spec.componentProperties : [];
  if (!mapping && componentProps.length === 0) return null;

  // Index componentProperties by sourceProp for invert + alternate-name handling.
  const bySourceProp = {};
  for (const cp of componentProps) {
    if (cp && cp.sourceProp) bySourceProp[cp.sourceProp] = cp;
  }

  const out = {};
  let translated = 0;
  for (const [key, value] of Object.entries(attrs || {})) {
    const cp = bySourceProp[key];
    if (cp) {
      const figmaKey = cp.name || (mapping && mapping[key]) || key;
      const figmaValue = (cp.invert && typeof value === 'boolean') ? !value : value;
      out[figmaKey] = figmaValue;
      translated++;
      continue;
    }
    if (mapping && mapping[key]) {
      out[mapping[key]] = value;
      translated++;
      continue;
    }
    out[key] = value;
  }
  return translated > 0 ? out : null;
}

function treeToCommands(nodes, parentId = 'root', out = []) {
  for (const node of nodes) {
    if (node.name === '__text__') continue;

    // Fragments are transparent: emit no command, attach their element
    // children to the current parentId.
    if (node.name === '__fragment__') {
      const fragKids = node.children.filter(c => c.name !== '__text__');
      if (fragKids.length > 0) treeToCommands(fragKids, parentId, out);
      continue;
    }

    const textContent = node.children
      .filter(c => c.name === '__text__')
      .map(c => c.text)
      .join(' ')
      .trim();

    const nodeType = inferNodeType(node.name);
    const id = nextId(node.name);
    const isConditional = !!(node.attrs && node.attrs['data-hds-conditional']);

    if (nodeType === 'INSTANCE') {
      // New command schema: componentName + characters + attributes at the top
      // level so the plugin can resolve via the HDS registry without diving
      // into props. Geometry/fill attrs are intentionally omitted here — the
      // registry-created instance inherits its own design tokens.
      const componentName = normalizeComponentName(node.name, node.attrs);
      const spec = getComponentSpec(componentName);
      const propKeys = [...new Set([...INSTANCE_PROP_KEYS, ...manifestPropKeys(spec)])];
      const attributes = {};
      for (const k of propKeys) {
        if ((node.attrs || {})[k] != null) attributes[k] = node.attrs[k];
      }
      const cmd = { action: 'ADD_NODE', id, parentId, type: 'INSTANCE', componentName };
      if (Object.keys(attributes).length) cmd.attributes = attributes;
      const figmaProps = mapInstanceAttrsToFigma(componentName, attributes);
      if (figmaProps && Object.keys(figmaProps).length) cmd.figmaProperties = figmaProps;
      if (textContent) cmd.characters = textContent;
      const a11y = extractA11yMetadata(node.attrs);
      if (a11y) cmd.a11y = a11y;
      if (isConditional) cmd.conditional = true;
      out.push(cmd);
    } else {
      const props = attrsToProps(node.name, node.attrs || {}, textContent);
      const cmd = { action: 'ADD_NODE', id, parentId, type: nodeType, props };
      const a11y = extractA11yMetadata(node.attrs);
      if (a11y) cmd.a11y = a11y;
      if (isConditional) cmd.conditional = true;
      out.push(cmd);
    }

    const elementKids = node.children.filter(c => c.name !== '__text__');
    if (elementKids.length > 0) treeToCommands(elementKids, id, out);
  }
  return out;
}

// ── Public API ────────────────────────────────────────────────────────────────
export function compile(rawText) {
  _counter = 0;
  const tokens = tokenize(rawText);
  if (tokens.length === 0) return [];
  const tree = buildTree(tokens);
  return treeToCommands(tree);
}
