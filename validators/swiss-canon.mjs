/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * validators/swiss-canon.mjs
 *
 * Detects the most common AI-generation aesthetic tells against the project's
 * Swiss / IBM Plex / stone-palette / 8px-grid canon. Returns the standard
 * { ok, errors } shape; each error has { path, code, message, suggestion } and
 * gets fed back to the LLM by pipeline/format-correction.mjs on retry.
 *
 * Rules:
 *   SWISS_BOLD            — font-bold / weight=700+ / fontWeight: bold
 *   SWISS_OFF_GRID        — padding/gap/margin not on the {0,4,8,12,16,20,24,32,40,48,64,80,96,128} scale
 *   SWISS_BG_WHITE_BLACK  — bg-white / bg-black / #fff / #000 string literals
 *   SWISS_GRADIENT        — gradient-* / linear-gradient( / radial-gradient(
 *   SWISS_OVERSIZED_RADIUS — radius >= 16 on structural components (Card/Input/Frame/Container/Field)
 *   SWISS_LOREM           — placeholder copy ("lorem ipsum", "dolor sit amet")
 *   SWISS_ELLIPSIS        — three-period `...` in user-visible copy (use `…`)
 *   SWISS_PURPLE_INDIGO   — purple/indigo/violet/fuchsia in raw color attributes
 *   SWISS_MULTI_HUE_TEXT  — sibling text-bearing elements using different hue families for hierarchy
 *   SWISS_STRAIGHT_QUOTES — straight `"` / `'` inside user-visible copy
 *
 * If the prefix rename (HDS → Hydra or no-prefix) lands, only the
 * STRUCTURAL_COMPONENTS / TEXT_BEARING_COMPONENTS sets need updating.
 */

import { parse } from './parse-jsx.mjs';
import {
  ON_GRID_SPACING,
  STRUCTURAL_COMPONENTS,
  TEXT_BEARING_COMPONENTS,
  isTokenPath,
  BG_BLACK_WHITE_VALUE_RE,
  PURPLE_RE,
  GRADIENT_VALUE_RE,
  LOREM_RE,
  TRIPLE_DOT_RE,
  BOLD_VALUE_RE,
  STRAIGHT_DOUBLE_QUOTE_RE,
  STRAIGHT_SINGLE_QUOTE_RE,
} from './canon-rules.mjs';

const SPACING_PROPS = new Set([
  'padding', 'paddingX', 'paddingY', 'paddingTop', 'paddingBottom',
  'paddingLeft', 'paddingRight', 'gap', 'rowGap', 'columnGap',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
]);

const RADIUS_PROPS = new Set([
  'radius', 'borderRadius', 'cornerRadius',
]);

const TEXT_CONTENT_PROPS = new Set([
  'children', 'label', 'placeholder', 'title', 'description', 'helperText',
  'aria-label',
]);

const COLOR_PROPS = new Set([
  'color', 'textColor', 'tone', 'fill', 'colorToken',
]);

function getAttrValue(attr) {
  if (!attr || attr.type === 'JSXSpreadAttribute') return null;
  const v = attr.value;
  if (!v) return true; // boolean shorthand: <X disabled />
  if (v.type === 'Literal') return v.value;
  if (v.type === 'JSXExpressionContainer') {
    const inner = v.expression;
    if (!inner) return null;
    if (inner.type === 'Literal') return inner.value;
    if (inner.type === 'TemplateLiteral' && inner.quasis?.length === 1) {
      return inner.quasis[0].value?.cooked ?? null;
    }
  }
  return null;
}

function asString(v) {
  return typeof v === 'string' ? v : null;
}

function asNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const m = v.match(/^(-?\d+(?:\.\d+)?)(?:px)?$/);
    if (m) return Number(m[1]);
  }
  return null;
}

function getTextChildren(element) {
  const out = [];
  for (const child of element.children || []) {
    if (child.type === 'JSXText' || child.type === 'Literal') {
      const t = (child.value ?? child.raw ?? '').toString();
      if (t.trim()) out.push(t);
    }
  }
  return out.join(' ');
}

/**
 * Extract a "hue family" key from a color value so siblings can be compared
 * for multi-hue hierarchy violations.
 *   semantic.color.content.primary  → "content"
 *   semantic.color.accent.primary   → "accent"
 *   semantic.color.feedback.danger  → "feedback"
 *   text-stone-900                  → "stone"
 *   stone-900/70                    → "stone"
 *   #C8102E                         → "hex:c8102e"
 *   stone                           → "stone"
 *   anything else                   → the value, lowercased
 */
function colorFamily(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  const semanticMatch = v.match(/^(?:semantic|tokens|theme)\.color\.([^.]+)\./);
  if (semanticMatch) return semanticMatch[1].toLowerCase();
  const tailwindMatch = v.match(/^(?:text|bg|border|from|to|via|ring)-([a-z]+)(?:-\d+)?(?:\/\d+)?$/);
  if (tailwindMatch) return tailwindMatch[1];
  const tailwindBareMatch = v.match(/^([a-z]+)-\d+(?:\/\d+)?$/);
  if (tailwindBareMatch) return tailwindBareMatch[1];
  const hexMatch = v.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) return `hex:${hexMatch[1].toLowerCase()}`;
  return v.toLowerCase();
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
 * @returns {Promise<{ ok: boolean, errors: Array<{path, code, message, suggestion}> }>}
 */
export default async function validate(jsxString) {
  const parsed = parse(jsxString);
  if (!parsed.ok) {
    return {
      ok: false,
      errors: [{ path: '', code: 'PARSE_ERROR', message: parsed.error, suggestion: 'Fix JSX syntax' }],
    };
  }

  const errors = [];

  walkJsx(parsed.ast, (element) => {
    const tagName = element.openingElement?.name?.name;
    if (!tagName) return;
    const attrs = element.openingElement?.attributes || [];

    for (const attr of attrs) {
      if (attr.type === 'JSXSpreadAttribute') continue;
      const attrName = attr.name?.name;
      if (!attrName) continue;
      const value = getAttrValue(attr);
      const valStr = asString(value);
      const valNum = asNumber(value);

      // ── SWISS_BOLD ────────────────────────────────────────────────
      if ((attrName === 'weight' || attrName === 'fontWeight') && valStr && BOLD_VALUE_RE.test(valStr)) {
        errors.push({
          path: `${tagName}.${attrName}`,
          code: 'SWISS_BOLD',
          message: `${tagName} uses bold weight "${valStr}" — bold is forbidden`,
          suggestion: 'Headings use font-light (display, h1) or font-normal (h2, h3). Body emphasis uses font-medium (500). Never bold.',
        });
      }

      // ── SWISS_OFF_GRID ────────────────────────────────────────────
      if (SPACING_PROPS.has(attrName) && valNum !== null) {
        if (!ON_GRID_SPACING.has(valNum)) {
          errors.push({
            path: `${tagName}.${attrName}`,
            code: 'SWISS_OFF_GRID',
            message: `${tagName}.${attrName}=${valNum} is not on the 4/8px scale`,
            suggestion: 'Use {0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128}. Prefer multiples of 8 for layout, multiples of 4 for component-internal padding.',
          });
        }
      }

      // ── SWISS_OVERSIZED_RADIUS ────────────────────────────────────
      if (RADIUS_PROPS.has(attrName) && STRUCTURAL_COMPONENTS.has(tagName) && valNum !== null && valNum >= 16) {
        errors.push({
          path: `${tagName}.${attrName}`,
          code: 'SWISS_OVERSIZED_RADIUS',
          message: `${tagName}.${attrName}=${valNum} is too round for a structural element`,
          suggestion: 'Cards, inputs, frames, containers use radius 0/2/4/8 only. Pills (HdsBadge) may use larger radii.',
        });
      }

      // ── SWISS_BG_WHITE_BLACK ──────────────────────────────────────
      if (valStr && BG_BLACK_WHITE_VALUE_RE.test(valStr.trim())) {
        errors.push({
          path: `${tagName}.${attrName}`,
          code: 'SWISS_BG_WHITE_BLACK',
          message: `${tagName}.${attrName}="${valStr}" uses pure white/black`,
          suggestion: 'Use semantic.color.surface.{raised,page,dark,overlay} or semantic.color.content.{primary,secondary} — never bg-white or bg-black.',
        });
      }

      // ── SWISS_GRADIENT ────────────────────────────────────────────
      if (valStr && GRADIENT_VALUE_RE.test(valStr)) {
        errors.push({
          path: `${tagName}.${attrName}`,
          code: 'SWISS_GRADIENT',
          message: `${tagName}.${attrName}="${valStr}" uses a gradient`,
          suggestion: 'Flat surfaces only. Use a single semantic surface token. If accent is needed, full-opacity solid only — no gradients.',
        });
      }

      // ── SWISS_PURPLE_INDIGO ───────────────────────────────────────
      if (valStr && PURPLE_RE.test(valStr) && !isTokenPath(valStr)) {
        errors.push({
          path: `${tagName}.${attrName}`,
          code: 'SWISS_PURPLE_INDIGO',
          message: `${tagName}.${attrName}="${valStr}" uses purple/indigo/violet/fuchsia`,
          suggestion: 'Project palette is stone neutrals + Swiss Red accent. Replace with semantic.color.surface.* / .content.* / .accent.*.',
        });
      }

      // ── SWISS_LOREM (in any text-y attr) ──────────────────────────
      if (TEXT_CONTENT_PROPS.has(attrName) && valStr && LOREM_RE.test(valStr)) {
        errors.push({
          path: `${tagName}.${attrName}`,
          code: 'SWISS_LOREM',
          message: `${tagName}.${attrName} contains lorem ipsum placeholder copy`,
          suggestion: 'Use realistic copy. Placeholder text hides wrap, length, and overflow defects.',
        });
      }

      // ── SWISS_ELLIPSIS (in any text-y attr) ───────────────────────
      if (TEXT_CONTENT_PROPS.has(attrName) && valStr && TRIPLE_DOT_RE.test(valStr)) {
        errors.push({
          path: `${tagName}.${attrName}`,
          code: 'SWISS_ELLIPSIS',
          message: `${tagName}.${attrName} uses three-period ellipsis "..."`,
          suggestion: 'Use the single-character ellipsis "…" (U+2026) for typographic correctness.',
        });
      }
    }

    // ── Text-content rules (children of text-bearing components) ────
    if (TEXT_BEARING_COMPONENTS.has(tagName)) {
      const text = getTextChildren(element);
      if (text) {
        if (LOREM_RE.test(text)) {
          errors.push({
            path: `${tagName}.children`,
            code: 'SWISS_LOREM',
            message: `${tagName} contains lorem ipsum placeholder copy`,
            suggestion: 'Use realistic copy. Placeholder text hides wrap, length, and overflow defects.',
          });
        }
        if (TRIPLE_DOT_RE.test(text)) {
          errors.push({
            path: `${tagName}.children`,
            code: 'SWISS_ELLIPSIS',
            message: `${tagName} uses three-period ellipsis "..."`,
            suggestion: 'Use the single-character ellipsis "…" (U+2026) for typographic correctness.',
          });
        }
        if (STRAIGHT_DOUBLE_QUOTE_RE.test(text) || STRAIGHT_SINGLE_QUOTE_RE.test(text)) {
          errors.push({
            path: `${tagName}.children`,
            code: 'SWISS_STRAIGHT_QUOTES',
            message: `${tagName} uses straight quotes in user-visible text`,
            suggestion: 'Use curly quotation marks: “ … ” for double, ‘ … ’ for single. Apostrophes inside contractions (don’t) should also be curly.',
          });
        }
      }
    }

    // ── SWISS_MULTI_HUE_TEXT ────────────────────────────────────────
    // Look at sibling text-bearing children of this parent. If two or more
    // carry explicit color attributes belonging to different hue families,
    // hierarchy is being driven by hue instead of opacity — flag it.
    const textSiblings = (element.children || []).filter(
      c => c.type === 'JSXElement'
        && TEXT_BEARING_COMPONENTS.has(c.openingElement?.name?.name),
    );
    if (textSiblings.length >= 2) {
      const families = [];
      for (const sib of textSiblings) {
        const sibAttrs = sib.openingElement?.attributes || [];
        for (const a of sibAttrs) {
          if (a.type === 'JSXSpreadAttribute') continue;
          const aName = a.name?.name;
          if (!COLOR_PROPS.has(aName)) continue;
          const aVal = asString(getAttrValue(a));
          if (!aVal) continue;
          const fam = colorFamily(aVal);
          if (fam) families.push({ tag: sib.openingElement.name.name, attr: aName, value: aVal, family: fam });
        }
      }
      if (families.length >= 2) {
        const distinct = new Set(families.map(f => f.family));
        if (distinct.size >= 2) {
          const offender = families[families.length - 1];
          errors.push({
            path: `${offender.tag}.${offender.attr}`,
            code: 'SWISS_MULTI_HUE_TEXT',
            message: `Sibling text-bearing elements use different hue families (${[...distinct].join(', ')}) for hierarchy`,
            suggestion: 'Drive hierarchy with opacity on a single hue: semantic.color.content.{primary,secondary,tertiary}. One accent token per layout, not per text node.',
          });
        }
      }
    }
  });

  return { ok: errors.length === 0, errors };
}
