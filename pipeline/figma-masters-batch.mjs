import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// backlog-2: expanded from 13 → 26 primitives. Patterns are NOT included; they
// compose primitives at JSX level via buildSystemPrompt's COMPLETE EXAMPLE
// blocks, so the gatekeeper does not need master variants for them.
//
// Excluded primitives (intentional):
//   - ComponentInstanceMatrix    — doc-system internal (docExempt)
//   - SpecimenBlock              — doc-system internal (docExempt)
//   - Token                      — doc-display chip, not a generative prim
export const GENERATIVE_SUBSET = [
  'Button',
  'Alert',
  'Stack',
  'Input',
  'Card',
  'Badge',
  'Surface',
  'Grid',
  'Icon',
  'Tag',
  'Divider',
  'HeadingStack',
  'TextLockup',
  // backlog-2 expansion ──────────────────────────────────────────────────────
  'AssetImg',
  'CinematicLink',
  'CodeBlock',
  'Container',
  'Dialog',
  'DocLinkCard',
  'HistoryCard',
  'InlineCode',
  'InlineLink',
  'NavItem',
  'SegmentedControl',
  'Table',
  'Text',
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const MANIFEST_PATH = new URL('../public/hds-manifest.json', import.meta.url);

// Approximate palette for first-pass masters. When the plugin has already run
// token sync, these fills can be rebound to Figma Variables via _hdsTokenBinding.
const C = {
  brand: { r: 0.05, g: 0.43, b: 0.99 },
  brandHover: { r: 0.04, g: 0.37, b: 0.87 },
  brandActive: { r: 0.04, g: 0.31, b: 0.73 },
  focusRing: { r: 0.58, g: 0.76, b: 1.0 },
  surface: { r: 0.97, g: 0.97, b: 0.97 },
  surfaceRaised: { r: 0.95, g: 0.95, b: 0.96 },
  surfacePage: { r: 1.0, g: 1.0, b: 1.0 },
  text: { r: 0.09, g: 0.09, b: 0.09 },
  muted: { r: 0.45, g: 0.45, b: 0.48 },
  disabled: { r: 0.78, g: 0.79, b: 0.81 },
  border: { r: 0.86, g: 0.87, b: 0.89 },
  white: { r: 1.0, g: 1.0, b: 1.0 },
  error: { r: 0.78, g: 0.12, b: 0.12 },
  errorBg: { r: 1.0, g: 0.94, b: 0.94 },
  infoBg: { r: 0.93, g: 0.97, b: 1.0 },
};

// ── Tenant token overlay ──────────────────────────────────────────────────────

/**
 * Convert a CSS hex color string (#RRGGBB or #RGB) to a Figma RGB object
 * { r, g, b } with values in [0, 1].
 * Returns null if the string is not a recognisable hex color so callers can
 * skip non-hex values (e.g. oklch()) gracefully.
 */
function hexToFigmaRgb(hex) {
  if (typeof hex !== 'string') return null;
  const s = hex.trim().replace(/^#/, '');
  if (s.length === 3) {
    const [rr, gg, bb] = s.split('').map((c) => parseInt(c + c, 16));
    return { r: rr / 255, g: gg / 255, b: bb / 255 };
  }
  if (s.length === 6) {
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    return { r: r / 255, g: g / 255, b: b / 255 };
  }
  return null;
}

/**
 * Recursively walk a W3C DTCG token tree and collect leaf token paths + $value.
 * path is an array of string segments (dot-joined = token path).
 */
function* walkTokenLeaves(node, segments = []) {
  if (!node || typeof node !== 'object') return;
  if ('$value' in node) {
    yield { path: segments.join('.'), value: node.$value };
    return;
  }
  for (const key of Object.keys(node)) {
    if (key.startsWith('$') || key.startsWith('_')) continue;
    yield* walkTokenLeaves(node[key], [...segments, key]);
  }
}

/**
 * Load tenants/<slug>/tokens.json and return a flat map of token path → hex
 * value.  Only includes entries where the $value is a plain hex string so
 * that alias-only overrides (W3C {ref}) are skipped — they carry no useful
 * information for the C palette patch.
 *
 * Returns an empty object when the tenant has no token file (graceful
 * degradation for scaffold/template tenants whose tokens.json has no active
 * semantic block).
 */
function loadTenantTokens(slug) {
  if (!slug || slug === '_template') {
    // _template's tokens.json intentionally has all keys prefixed with '_' to
    // prevent accidental activation.  Treat it as "no overrides".
    return {};
  }
  const tokenPath = path.join(REPO_ROOT, 'tenants', slug, 'tokens.json');
  if (!fs.existsSync(tokenPath)) return {};
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  } catch (err) {
    console.warn(`[tenant] WARNING: could not parse ${tokenPath}: ${err.message}`);
    return {};
  }
  const result = {};
  for (const { path: p, value } of walkTokenLeaves(raw)) {
    if (typeof value === 'string' && value.startsWith('#')) {
      result[p] = value;
    }
  }
  return result;
}

/**
 * Apply tenant token overrides to the shared C palette.  Recognises the
 * canonical semantic paths and maps them to their C keys:
 *
 *   semantic.accent.rest      → C.brand
 *   semantic.accent.hover     → C.brandHover
 *   semantic.accent.pressed   → C.brandActive
 *   semantic.color.surface.accent     → C.brand  (alias — prefer accent.rest)
 *   semantic.color.border.accent      → C.focusRing (lighter tint applied)
 *   semantic.color.surface.accentSubtle → C.infoBg
 *
 * Only hex-parseable values are applied; unknown paths are silently ignored.
 * Returns the overridden C object (mutated in-place) so callers can pass it
 * through to buildMastersBatch.
 */
function patchPaletteForTenant(tenantTokens) {
  const apply = (key, hex) => {
    const rgb = hexToFigmaRgb(hex);
    if (rgb) C[key] = rgb;
  };

  if (tenantTokens['semantic.accent.rest'])          apply('brand', tenantTokens['semantic.accent.rest']);
  if (tenantTokens['semantic.accent.hover'])         apply('brandHover', tenantTokens['semantic.accent.hover']);
  if (tenantTokens['semantic.accent.pressed'])       apply('brandActive', tenantTokens['semantic.accent.pressed']);

  // surface.accent is a secondary path for the same brand color; only apply if
  // accent.rest was not already set (more specific path wins).
  if (!tenantTokens['semantic.accent.rest'] && tenantTokens['semantic.color.surface.accent']) {
    apply('brand', tenantTokens['semantic.color.surface.accent']);
  }

  if (tenantTokens['semantic.color.surface.accentSubtle']) apply('infoBg', tenantTokens['semantic.color.surface.accentSubtle']);

  // Focus ring: use a lightened version of the brand color if border.accent is
  // not explicitly provided.
  if (tenantTokens['semantic.color.border.accent']) {
    apply('focusRing', tenantTokens['semantic.color.border.accent']);
  } else if (tenantTokens['semantic.accent.rest']) {
    // Derive focus ring: blend brand 40% with white so it reads as a halo.
    const brand = hexToFigmaRgb(tenantTokens['semantic.accent.rest']);
    if (brand) {
      C.focusRing = {
        r: brand.r * 0.4 + 0.6,
        g: brand.g * 0.4 + 0.6,
        b: brand.b * 0.4 + 0.6,
      };
    }
  }
}

/**
 * Load the tenant metadata file (tenants/<slug>/metadata.json) if it exists.
 * Returns a partial metadata object with at least { slug }.
 */
function loadTenantMetadata(slug) {
  const metaPath = path.join(REPO_ROOT, 'tenants', slug, 'metadata.json');
  if (!fs.existsSync(metaPath)) return { slug };
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch {
    return { slug };
  }
}

function solid(color, opacity = 1) {
  return { type: 'SOLID', color, opacity };
}

function txt(characters, options = {}) {
  const {
    name,
    visible,
    color = C.text,
    fontFamily = 'Inter',
    fontSize = 14,
    fontWeight = 400,
    lineHeight,
    textAlignHorizontal,
    _hdsTokenBinding,
  } = options;

  return {
    type: 'TEXT',
    // name defaults to a slice of characters when not explicitly provided so
    // existing call sites keep their old behaviour. Callers wanting Figma
    // component-property targets (Label, Title, Body, etc.) MUST pass an
    // explicit name option.
    name: name || characters.slice(0, 24),
    characters,
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight,
    textAlignHorizontal,
    fills: [solid(color)],
    visible,
    _hdsTokenBinding,
  };
}

function rect(name, width, height, color, options = {}) {
  return {
    type: 'RECTANGLE',
    name,
    width,
    height,
    fills: [solid(color)],
    visible: options.visible,
    _hdsTokenBinding: options._hdsTokenBinding,
    ...options,
  };
}

function baseFrame(options = {}) {
  return {
    type: 'FRAME',
    name: options.name,
    visible: options.visible,
    layoutMode: options.layoutMode || 'HORIZONTAL',
    primaryAxisSizingMode: options.primaryAxisSizingMode || 'AUTO',
    counterAxisSizingMode: options.counterAxisSizingMode || 'AUTO',
    primaryAxisAlignItems: options.primaryAxisAlignItems || 'CENTER',
    counterAxisAlignItems: options.counterAxisAlignItems || 'CENTER',
    paddingLeft: options.paddingLeft ?? 0,
    paddingRight: options.paddingRight ?? 0,
    paddingTop: options.paddingTop ?? 0,
    paddingBottom: options.paddingBottom ?? 0,
    itemSpacing: options.itemSpacing ?? 0,
    width: options.width,
    height: options.height,
    fills: options.fills ?? [],
    strokes: options.strokes ?? [],
    strokeWeight: options.strokeWeight,
    cornerRadius: options.cornerRadius,
    effects: options.effects,
    opacity: options.opacity,
    clipsContent: options.clipsContent,
    _hdsTokenBinding: options._hdsTokenBinding,
    children: options.children || [],
  };
}

function loadManifestSpecs() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  // Merge utilities into specs — hidden/utility components share the same shape
  // and may appear in GENERATIVE_SUBSET (e.g. HistoryCard is utility-categorised).
  const specs = { ...(manifest.componentSpecs || {}), ...(manifest.utilities || {}) };

  return GENERATIVE_SUBSET.map((name) => {
    const spec = specs[name];
    if (!spec) {
      throw new Error(`Missing component spec for ${name} in public/hds-manifest.json`);
    }

    const states = Array.isArray(spec.states) && spec.states.length ? spec.states : ['default'];
    return { name, spec, states };
  });
}

function compactBindings(bindings) {
  const entries = Object.entries(bindings || {}).filter(([, value]) => Boolean(value));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

// 8v-3: project a slot's tokenBinding from the manifest, with optional
// per-state overlay. Pipeline state-branching logic (variant×state) lives
// in the caller and passes computed token paths via overlay; non-state
// bindings (padding/cornerRadius/etc.) come from the slot defaults.
//
// Overlay convention: undefined keeps the slot default; null explicitly
// removes a binding (for variants that have no fill/stroke at rest); any
// string value overrides.
function slotBinding(spec, slotName, overlay = null) {
  const slot = (spec && Array.isArray(spec.slots) ? spec.slots : []).find((s) => s && s.name === slotName);
  const base = slot && slot.tokenBinding ? { ...slot.tokenBinding } : {};
  if (overlay) {
    for (const key of Object.keys(overlay)) {
      const v = overlay[key];
      if (v === null) {
        delete base[key];
      } else if (v !== undefined) {
        base[key] = v;
      }
    }
  }
  return compactBindings(base);
}

function specToken(spec, ...keys) {
  const tokens = spec?.tokens || {};
  const tokenMapping = spec?.tokenMapping || {};
  for (const key of keys) {
    if (tokens[key]) return tokens[key];
    if (tokenMapping[key]) return tokenMapping[key];
  }
  return undefined;
}

// Phase A6: buttonStateTree now branches on all three tuple axes.
function buttonStateTree(spec, tuple) {
  const variant = tuple.variant || 'primary';
  const size = tuple.size || 'md';
  const state = tuple.state || 'default';

  // ── Size dimensions ─────────────────────────────────────────────────────────
  const SIZES = {
    sm: { paddingX: 8,  paddingY: 4,  fontSize: 13, iconSize: 12, height: 28, width: 90,  itemSpacing: 4 },
    md: { paddingX: 16, paddingY: 12, fontSize: 15, iconSize: 16, height: 40, width: 112, itemSpacing: 8 },
    lg: { paddingX: 24, paddingY: 16, fontSize: 17, iconSize: 20, height: 48, width: 144, itemSpacing: 8 },
  };
  const sz = SIZES[size] || SIZES.md;
  const sizeTok = `component.button.size.${size in SIZES ? size : 'md'}`;

  // ── Variant visual config ────────────────────────────────────────────────────
  const isDisabled = state === 'disabled';
  const hasFocusRing = state === 'focus';

  let fillColor, textColor, strokeColor, strokeWeight;
  let bgToken, borderToken, textToken;

  if (isDisabled) {
    // All variants collapse to a muted disabled appearance
    textColor = C.muted;
    textToken = specToken(spec, 'primaryTextDisabled', 'disabledText');
    switch (variant) {
      case 'secondary':
        fillColor = C.surfacePage;
        strokeColor = C.border;
        strokeWeight = 1;
        bgToken = 'component.button.secondary.bg.rest';
        borderToken = 'component.button.secondary.border.disabled';
        break;
      case 'tertiary':
        fillColor = undefined;
        strokeColor = undefined;
        bgToken = undefined;
        borderToken = undefined;
        break;
      default: // primary
        fillColor = C.disabled;
        bgToken = specToken(spec, 'primaryBackgroundDisabled');
        break;
    }
  } else {
    switch (variant) {
      case 'secondary':
        fillColor = state === 'hover' ? C.surfaceRaised
          : state === 'active' ? C.surfaceRaised
          : C.surfacePage;
        textColor = C.text;
        strokeColor = C.border;
        strokeWeight = 1;
        bgToken = state === 'active' ? 'component.button.secondary.bg.pressed'
          : state === 'hover' ? 'component.button.secondary.bg.hover'
          : 'component.button.secondary.bg.rest';
        borderToken = state === 'active' ? 'component.button.secondary.border.pressed'
          : state === 'hover' ? 'component.button.secondary.border.hover'
          : 'component.button.secondary.border.rest';
        textToken = 'component.button.secondary.text';
        break;
      case 'tertiary':
        fillColor = state === 'hover' ? C.surface : undefined;
        textColor = C.brand;
        strokeColor = undefined;
        // Tertiary reuses the primary brand color token for text
        bgToken = state === 'hover' ? 'semantic.color.surface.raised' : undefined;
        borderToken = undefined;
        textToken = 'component.button.bg';
        break;
      default: // primary
        fillColor = state === 'hover' ? C.brandHover
          : state === 'active' ? C.brandActive
          : C.brand;
        textColor = C.white;
        bgToken = state === 'active'
          ? specToken(spec, 'backgroundActive') || 'semantic.accent.pressed'
          : state === 'hover'
            ? specToken(spec, 'backgroundHover', 'Fill hover') || 'semantic.accent.hover'
            : specToken(spec, 'background', 'Fill') || 'semantic.accent.rest';
        textToken = specToken(spec, 'text', 'Label') || 'component.button.text';
        break;
    }
  }

  // Focus ring overrides stroke for all variants
  const strokes = hasFocusRing ? [solid(C.focusRing)]
    : strokeColor ? [solid(strokeColor)]
    : [];
  const effectiveStrokeWeight = hasFocusRing ? 2 : strokeWeight;

  // ── Children (icon slots + label) ───────────────────────────────────────────
  // Each text-bearing slot's fill is state-overlaid from textToken; slot defaults
  // come from manifest componentSpecs.HdsButton.slots[*].tokenBinding.
  const iconOverlay = { fill: textToken };
  const children = [];
  children.push(rect('IconLeft', sz.iconSize, sz.iconSize, isDisabled ? C.muted : textColor, {
    visible: false,
    cornerRadius: 2,
    _hdsTokenBinding: slotBinding(spec, 'icon-start', iconOverlay),
  }));
  if (state === 'loading') {
    const spinnerColor = variant === 'primary' ? C.white : C.brand;
    children.push(rect('Spinner', sz.iconSize - 4, sz.iconSize - 4, spinnerColor, { cornerRadius: 999 }));
  }
  children.push(txt(state === 'loading' ? 'Loading' : 'Button', {
    name: 'Label',
    color: isDisabled ? C.muted : textColor,
    fontSize: sz.fontSize,
    fontWeight: 500,
    _hdsTokenBinding: slotBinding(spec, 'label', iconOverlay),
  }));
  children.push(rect('IconRight', sz.iconSize, sz.iconSize, isDisabled ? C.muted : textColor, {
    visible: false,
    cornerRadius: 2,
    _hdsTokenBinding: slotBinding(spec, 'icon-end', iconOverlay),
  }));

  // Background slot overlay: variants may set fill/stroke to undefined when
  // they have no rest binding (e.g. tertiary). Coerce undefined → null so the
  // slot default is suppressed rather than re-applied.
  const sizeKey = size in SIZES ? size : 'md';
  const bgOverlay = {
    fill:          bgToken     == null ? null : bgToken,
    stroke:        hasFocusRing
      ? specToken(spec, 'focusRing')
      : (borderToken == null ? null : borderToken),
    paddingLeft:   `component.button.size.${sizeKey}.paddingX`,
    paddingRight:  `component.button.size.${sizeKey}.paddingX`,
    paddingTop:    `component.button.size.${sizeKey}.paddingY`,
    paddingBottom: `component.button.size.${sizeKey}.paddingY`,
  };

  return baseFrame({
    width: sz.width,
    height: sz.height,
    paddingLeft: sz.paddingX,
    paddingRight: sz.paddingX,
    paddingTop: sz.paddingY,
    paddingBottom: sz.paddingY,
    itemSpacing: sz.itemSpacing,
    cornerRadius: 4,
    fills: fillColor ? [solid(fillColor)] : [],
    strokes,
    strokeWeight: effectiveStrokeWeight,
    opacity: isDisabled ? 0.72 : undefined,
    _hdsTokenBinding: slotBinding(spec, 'background', bgOverlay),
    children,
  });
}

// Phase A6: refactored to vertical auto-layout with Label / Placeholder / Helper / Error slots
// so all four TEXT component properties have named target nodes to bind to.
function inputStateTree(spec, state) {
  const stroke = {
    default: solid(C.border),
    focus: solid(C.brand),
    error: solid(C.error),
    disabled: solid(C.border),
  }[state] || solid(C.border);

  const shellFill = state === 'disabled' ? C.surface : state === 'error' ? C.errorBg : C.surfacePage;
  const placeholderText = {
    default: 'Placeholder',
    focus: 'Focused value',
    error: 'Invalid value',
    disabled: 'Disabled',
  }[state] || 'Placeholder';

  // State-specific binding overlays read manifest spec.tokens via specToken;
  // slot defaults from spec.slots[*].tokenBinding provide the rest-state baseline.
  const shellFillOverlay =
    state === 'disabled'
      ? specToken(spec, 'disabledBackground') || 'semantic.color.surface.raised'
      : undefined; // undefined → slot default ('component.input.bg')
  const shellStrokeOverlay =
    state === 'error'
      ? specToken(spec, 'borderError')
      : state === 'focus'
        ? specToken(spec, 'focusRing') || 'semantic.color.border.accent'
        : undefined; // undefined → slot default ('component.input.border')
  const placeholderFillOverlay =
    state === 'disabled'
      ? specToken(spec, 'disabledText') || 'semantic.color.content.disabled'
      : undefined; // undefined → slot default ('component.input.text')
  const labelFillOverlay =
    state === 'disabled'
      ? 'semantic.color.content.disabled'
      : undefined; // undefined → slot default ('semantic.color.content.primary')

  const inputShell = baseFrame({
    name: 'InputShell',
    width: 280,
    height: 32,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 0,
    paddingBottom: 0,
    cornerRadius: 4,
    fills: [solid(shellFill)],
    strokes: [stroke],
    strokeWeight: state === 'focus' || state === 'error' ? 2 : 1,
    opacity: state === 'disabled' ? 0.72 : undefined,
    _hdsTokenBinding: slotBinding(spec, 'background', {
      fill: shellFillOverlay,
      stroke: shellStrokeOverlay,
    }),
    children: [
      txt(placeholderText, {
        name: 'Placeholder',
        color: state === 'default' || state === 'disabled' ? C.muted : C.text,
        _hdsTokenBinding: slotBinding(spec, 'placeholder', { fill: placeholderFillOverlay }),
      }),
    ],
  });

  return baseFrame({
    layoutMode: 'VERTICAL',
    width: 280,
    paddingLeft: 0,
    paddingRight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    itemSpacing: 4,
    fills: [],
    primaryAxisAlignItems: 'MIN',
    counterAxisAlignItems: 'MIN',
    _hdsTokenBinding: slotBinding(spec, 'root'),
    children: [
      // Label — bound to the "Label" TEXT component property
      txt('Label', {
        name: 'Label',
        fontSize: 13,
        fontWeight: 500,
        color: state === 'disabled' ? C.muted : C.text,
        _hdsTokenBinding: slotBinding(spec, 'label', { fill: labelFillOverlay }),
      }),
      inputShell,
      // Helper — bound to "Helper text" TEXT property; hidden when error
      txt('Helper text', {
        name: 'Helper',
        fontSize: 12,
        color: C.muted,
        visible: state !== 'error',
        _hdsTokenBinding: slotBinding(spec, 'helper-text'),
      }),
      // Error — bound to "Error message" TEXT property; shown only when error
      txt('Error message', {
        name: 'Error',
        fontSize: 12,
        color: C.error,
        visible: state === 'error',
        _hdsTokenBinding: slotBinding(spec, 'error-text'),
      }),
    ],
  });
}

function defaultTreeFor(name, spec) {
  switch (name) {
    case 'Alert':
      return baseFrame({
        width: 360,
        layoutMode: 'VERTICAL',
        primaryAxisAlignItems: 'MIN',
        counterAxisAlignItems: 'MIN',
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 12,
        paddingBottom: 12,
        itemSpacing: 4,
        cornerRadius: 8,
        fills: [solid(C.infoBg)],
        _hdsTokenBinding: slotBinding(spec, 'background'),
        children: [
          txt('Alert title', { name: 'Title', fontWeight: 600,
            _hdsTokenBinding: slotBinding(spec, 'title') }),
          txt('Alert message', { name: 'Body', fontWeight: 400,
            _hdsTokenBinding: slotBinding(spec, 'body') }),
        ],
      });
    case 'Stack':
      return baseFrame({
        layoutMode: 'VERTICAL',
        width: 320,
        itemSpacing: 16,
        fills: [],
        primaryAxisAlignItems: 'MIN',
        counterAxisAlignItems: 'MIN',
        _hdsTokenBinding: slotBinding(spec, 'root'),
        children: [
          rect('Item A', 320, 48, C.surface, { cornerRadius: 6,
            strokes: [solid(C.border)], strokeWeight: 1,
            _hdsTokenBinding: slotBinding(spec, 'item') }),
          rect('Item B', 320, 48, C.surface, { cornerRadius: 6,
            strokes: [solid(C.border)], strokeWeight: 1,
            _hdsTokenBinding: slotBinding(spec, 'item') }),
        ],
      });
    case 'Card':
      return baseFrame({
        layoutMode: 'VERTICAL',
        width: 320,
        height: 192,
        paddingLeft: 24,
        paddingRight: 24,
        paddingTop: 24,
        paddingBottom: 24,
        itemSpacing: 12,
        cornerRadius: 12,
        fills: [solid(C.surfaceRaised)],
        primaryAxisAlignItems: 'MIN',
        counterAxisAlignItems: 'MIN',
        _hdsTokenBinding: slotBinding(spec, 'background'),
        children: [
          txt('Card title', { fontWeight: 700, fontSize: 18,
            _hdsTokenBinding: slotBinding(spec, 'title') }),
          txt('Card content', { color: C.muted,
            _hdsTokenBinding: slotBinding(spec, 'body') }),
        ],
      });
    case 'Badge':
      return baseFrame({
        width: 72,
        height: 24,
        paddingLeft: 6,
        paddingRight: 6,
        paddingTop: 4,
        paddingBottom: 4,
        cornerRadius: 4,
        fills: [solid(C.infoBg)],
        _hdsTokenBinding: slotBinding(spec, 'background'),
        children: [
          txt('Badge', { name: 'Label', fontSize: 11, fontWeight: 500,
            _hdsTokenBinding: slotBinding(spec, 'label') }),
        ],
      });
    case 'Surface':
      return baseFrame({
        layoutMode: 'VERTICAL',
        width: 360,
        height: 160,
        paddingLeft: 24,
        paddingRight: 24,
        paddingTop: 24,
        paddingBottom: 24,
        cornerRadius: 8,
        fills: [solid(C.surfaceRaised)],
        primaryAxisAlignItems: 'MIN',
        counterAxisAlignItems: 'MIN',
        _hdsTokenBinding: slotBinding(spec, 'background'),
        children: [
          txt('Surface', { color: C.muted, fontSize: 12, fontWeight: 600,
            _hdsTokenBinding: slotBinding(spec, 'label') }),
        ],
      });
    case 'Grid':
      return baseFrame({
        width: 320,
        height: 120,
        itemSpacing: 16,
        fills: [],
        primaryAxisAlignItems: 'MIN',
        counterAxisAlignItems: 'MIN',
        _hdsTokenBinding: slotBinding(spec, 'root'),
        children: [
          rect('Col A', 96, 120, C.surface, { cornerRadius: 4,
            _hdsTokenBinding: slotBinding(spec, 'cell') }),
          rect('Col B', 96, 120, C.surface, { cornerRadius: 4,
            _hdsTokenBinding: slotBinding(spec, 'cell') }),
          rect('Col C', 96, 120, C.surface, { cornerRadius: 4,
            _hdsTokenBinding: slotBinding(spec, 'cell') }),
        ],
      });
    case 'Icon':
      return baseFrame({
        width: 24,
        height: 24,
        paddingLeft: 2,
        paddingRight: 2,
        paddingTop: 2,
        paddingBottom: 2,
        fills: [],
        _hdsTokenBinding: slotBinding(spec, 'root'),
        children: [
          rect('Glyph', 20, 20, C.text, { cornerRadius: 3,
            _hdsTokenBinding: slotBinding(spec, 'glyph') }),
        ],
      });
    case 'Tag':
      return baseFrame({
        width: 64,
        height: 28,
        paddingLeft: 12,
        paddingRight: 12,
        paddingTop: 8,
        paddingBottom: 8,
        cornerRadius: 4,
        fills: [solid(C.surfaceRaised)],
        strokes: [solid(C.border)],
        strokeWeight: 1,
        _hdsTokenBinding: slotBinding(spec, 'background'),
        children: [
          txt('Tag', { name: 'Label', fontSize: 13,
            _hdsTokenBinding: slotBinding(spec, 'label') }),
        ],
      });
    case 'Divider':
      return baseFrame({
        layoutMode: 'VERTICAL',
        width: 320,
        height: 1,
        fills: [],
        primaryAxisAlignItems: 'MIN',
        counterAxisAlignItems: 'MIN',
        children: [
          rect('Line', 320, 1, C.border,
            { _hdsTokenBinding: slotBinding(spec, 'line') }),
        ],
      });
    case 'HeadingStack':
      return baseFrame({
        layoutMode: 'VERTICAL',
        width: 320,
        itemSpacing: 8,
        fills: [],
        primaryAxisAlignItems: 'MIN',
        counterAxisAlignItems: 'MIN',
        _hdsTokenBinding: slotBinding(spec, 'root'),
        children: [
          txt('Heading', { name: 'Heading', fontSize: 28, fontWeight: 700,
            _hdsTokenBinding: slotBinding(spec, 'heading') }),
          txt('Supporting subtext', { name: 'Subtext', fontSize: 16, color: C.muted,
            _hdsTokenBinding: slotBinding(spec, 'subtext') }),
        ],
      });
    case 'TextLockup':
      return baseFrame({
        layoutMode: 'VERTICAL',
        width: 320,
        itemSpacing: 4,
        fills: [],
        primaryAxisAlignItems: 'MIN',
        counterAxisAlignItems: 'MIN',
        _hdsTokenBinding: slotBinding(spec, 'root'),
        children: [
          txt('EYEBROW', { name: 'Eyebrow', fontSize: 11, fontWeight: 700, color: C.muted,
            _hdsTokenBinding: slotBinding(spec, 'eyebrow') }),
          txt('Title text', { name: 'Title', fontSize: 20, fontWeight: 700,
            _hdsTokenBinding: slotBinding(spec, 'title') }),
          txt('Description or supporting copy', { name: 'Description', fontSize: 14, color: C.muted,
            _hdsTokenBinding: slotBinding(spec, 'description') }),
        ],
      });
    default:
      // Components without a hand-tuned tree fall back to a generic frame.
      // If the spec carries slots they project; otherwise slotBinding returns
      // undefined and the frame ships without bindings (raw values only).
      return baseFrame({
        width: 160,
        height: 48,
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 12,
        paddingBottom: 12,
        cornerRadius: 6,
        fills: [solid(C.surface)],
        _hdsTokenBinding: slotBinding(spec, 'background'),
        children: [
          txt(name, { fontSize: 12, color: C.muted,
            _hdsTokenBinding: slotBinding(spec, 'label') }),
        ],
      });
  }
}

function buildTree(name, spec, tuple) {
  if (name === 'Button') return buttonStateTree(spec, tuple);
  if (name === 'Input') return inputStateTree(spec, tuple.state || 'default');
  return defaultTreeFor(name, spec, tuple);
}

// ── Variant cartesian helpers ─────────────────────────────────────────────────

// Resolve the value list for one axis: 'state' reads spec.states; otherwise
// spec.props[axis].values, with booleans expanded to ['false','true']. Falls
// back to ['default'] for empty axes so cartesian product never collapses.
function resolveAxisValues(spec, axis) {
  if (axis === 'state') {
    return Array.isArray(spec.states) && spec.states.length ? spec.states : ['default'];
  }
  const propSpec = spec.props && spec.props[axis];
  if (propSpec) {
    if (Array.isArray(propSpec.values) && propSpec.values.length) {
      return propSpec.values.map((v) => String(v));
    }
    if (propSpec.type === 'boolean') {
      return ['false', 'true'];
    }
  }
  return ['default'];
}

// Convert a React prop name to its Figma variant property name. Prefers the
// manifest's figmaPropertyMapping entry; falls back to PascalCase of the prop.
function axisFigmaName(spec, axis) {
  const mapped = spec.figmaPropertyMapping && spec.figmaPropertyMapping[axis];
  if (mapped) return mapped;
  return axis.charAt(0).toUpperCase() + axis.slice(1);
}

// [[a,b],[c,d]] -> [[a,c],[a,d],[b,c],[b,d]]. Empty input collapses to [[]] so
// downstream logic always has at least one tuple to render.
function cartesianProduct(arrays) {
  if (!arrays.length) return [[]];
  return arrays.reduce(
    (acc, current) => acc.flatMap((prefix) => current.map((value) => [...prefix, value])),
    [[]],
  );
}

// Walk variantAxes -> emit one tuple per cartesian combination.
// Returns [{ axes: [...], values: [...], tuple: {axis: value, ...},
//           variantName: 'Variant=primary, Size=md, State=hover' }].
function variantTuples(spec) {
  const axes = Array.isArray(spec.variantAxes) && spec.variantAxes.length
    ? spec.variantAxes
    : ['state'];
  const valueLists = axes.map((axis) => resolveAxisValues(spec, axis));
  const product = cartesianProduct(valueLists);

  return product.map((values) => {
    const tuple = {};
    axes.forEach((axis, i) => { tuple[axis] = values[i]; });
    const variantName = axes
      .map((axis, i) => `${axisFigmaName(spec, axis)}=${values[i]}`)
      .join(', ');
    return { axes, values, tuple, variantName };
  });
}

/**
 * Build the masters batch payload.
 *
 * @param {string} [tenantSlug] — Optional tenant slug.  When supplied the
 *   shared C palette is patched with tenant brand token overrides before the
 *   variant trees are built.  Pass '_template' (or omit) to use Hirobius
 *   defaults with no mutations.
 * @returns {Array} Component batch array (same shape as before, with an added
 *   top-level `_tenant` property identifying the tenant context).
 */
export function buildMastersBatch(tenantSlug = '_template') {
  // Apply tenant palette overrides before building variant trees.
  // patchPaletteForTenant mutates C in-place; for _template it is a no-op.
  const tenantTokens = loadTenantTokens(tenantSlug);
  if (Object.keys(tenantTokens).length > 0) {
    patchPaletteForTenant(tenantTokens);
  }

  const specs = loadManifestSpecs();
  return specs.map(({ name, spec }) => {
    const tuples = variantTuples(spec);
    const effectiveAxes = Array.isArray(spec.variantAxes) && spec.variantAxes.length
      ? spec.variantAxes
      : ['state'];
    return {
      _tenant: tenantSlug,
      component: name,
      // figmaPropertyNames lets the plugin look up the canonical Figma property
      // name for each axis without re-deriving — useful for diagnostics.
      figmaPropertyNames: effectiveAxes.reduce((acc, axis) => {
        acc[axis] = axisFigmaName(spec, axis);
        return acc;
      }, {}),
      // componentProperties pass through verbatim to the plugin, which
      // applies them via master.addComponentProperty() AFTER combineAsVariants.
      componentProperties: Array.isArray(spec.componentProperties)
        ? spec.componentProperties
        : [],
      states: tuples.map(({ tuple, variantName }) => ({
        // 'state' on the wire is the COMPOSITE variant name. The plugin renames
        // each built node to "State=<state>"; we override to a multi-axis form
        // so figma.combineAsVariants() infers all axes automatically.
        state: variantName,
        tuple,
        tree: buildTree(name, spec, tuple),
      })),
    };
  });
}

// ── CLI entry point ───────────────────────────────────────────────────────────
//
// Usage:
//   node pipeline/figma-masters-batch.mjs                  # dry-run, _template
//   node pipeline/figma-masters-batch.mjs --tenant=<slug>  # dry-run, tenant palette
//   node pipeline/figma-masters-batch.mjs --tenant=<slug> --emit  # write JSON snapshot
//
// Validation command (used by orchestration.json gate):
//   node pipeline/figma-masters-batch.mjs --tenant=_template
//
// Always exits 0 unless the manifest is broken or token loading fails.

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cliArgs = process.argv.slice(2);
  const tenantArg = cliArgs.find((a) => a.startsWith('--tenant='));
  const slug = tenantArg ? tenantArg.split('=')[1] : '_template';
  const emit = cliArgs.includes('--emit');

  console.log(`[figma-masters-batch] tenant=${slug}  mode=${emit ? 'emit' : 'dry-run'}`);

  let batch;
  try {
    batch = buildMastersBatch(slug);
  } catch (err) {
    console.error(`[figma-masters-batch] ERROR: ${err.message}`);
    process.exit(1);
  }

  const totalVariants = batch.reduce((n, b) => n + b.states.length, 0);
  const meta = loadTenantMetadata(slug);
  const tenantDisplay = meta.displayName || slug;

  console.log(`[figma-masters-batch] tenant="${tenantDisplay}" — ${batch.length} components, ${totalVariants} variants`);

  // Log per-component variant counts for quick inspection.
  for (const entry of batch) {
    console.log(`  ${entry.component.padEnd(32)} ${entry.states.length} variants`);
  }

  if (emit) {
    // Write a JSON snapshot of the batch payload to pipeline/output/<slug>-masters-batch.json.
    const outputDir = path.join(REPO_ROOT, 'pipeline', 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${slug}-masters-batch.json`);
    const payload = {
      $schema: 'hirobius/figma-masters-batch/v1',
      generatedAt: new Date().toISOString(),
      tenant: slug,
      tenantDisplay,
      componentCount: batch.length,
      variantCount: totalVariants,
      batch,
    };
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[figma-masters-batch] snapshot written → ${path.relative(REPO_ROOT, outputPath)}`);
  }

  console.log('[figma-masters-batch] done. Exit 0.');
}
