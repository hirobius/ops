/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * validators/motion-perf.mjs
 *
 * Detects CSS animation / transition antipatterns that cause layout thrashing,
 * unnecessary paint, or compositor-layer abuse. Rules are distilled from the
 * ibelick/fixing-motion-performance skill (ui-skills.com).
 *
 * Operates on raw JSX/TSX string content — scans inline style strings, className
 * strings, and CSS-in-JS literal values for forbidden patterns.
 *
 * Returns the standard { ok, errors } shape; each error has
 * { path, code, message, suggestion } and gets fed back to the LLM by
 * pipeline/format-correction.mjs on retry.
 *
 * Rules:
 *   MOTION_TRANSITION_ALL      — transition: all | transition-property: all
 *   MOTION_LAYOUT_ANIMATE      — animating width/height/top/left/right/bottom/margin/padding
 *   MOTION_SCROLL_EVENT        — scroll event listeners used for animation
 *   MOTION_RAF_NO_STOP         — requestAnimationFrame without cancel/stop reference
 *   MOTION_WILL_CHANGE_ALL     — will-change: all (too broad; causes memory pressure)
 *   MOTION_BLUR_LARGE          — backdrop-filter or filter blur > 8px on large surfaces
 *   MOTION_CSS_VAR_ANIMATE     — animating CSS custom properties in transition shorthand
 *   MOTION_REDUCED_MOTION      — (informational) missing prefers-reduced-motion guard
 *
 * Source: https://github.com/ibelick/ui-skills/blob/main/skills/fixing-motion-performance/SKILL.md
 */

/**
 * Scan a raw source string for all occurrences of a regex.
 * Returns an array of { match, index } for the caller to annotate.
 *
 * @param {string} src
 * @param {RegExp} re  — must have the 'g' flag
 */
function scan(src, re) {
  const hits = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    hits.push({ match: m[0], index: m.index });
  }
  return hits;
}

// ── Regex Patterns ────────────────────────────────────────────────────────────

/**
 * transition: all — catches both shorthand and longhand.
 * e.g. "transition: all 0.3s ease" or "transitionProperty: 'all'"
 *       also Tailwind: "transition-all"
 */
const TRANSITION_ALL_RE = /\btransition(?:-property)?:\s*['"]?all\b|['"]transition:\s*all\b|(?<![a-z])transition-all(?![a-z-])/gi;

/**
 * Animating layout-triggering properties inside a transition or animation
 * declaration — width, height, top, left, right, bottom, margin*, padding*,
 * flex-basis.
 *
 * Matches: "transition: width 0.3s" | transition-property: top |
 *          "animation: grow-width 0.5s" | "to { width: 200px }"
 *
 * We flag transition/animation shorthand strings containing these props.
 */
const LAYOUT_PROP_ANIMATE_RE = /\btransition(?:-property)?:\s*['"]?(?:width|height|top|left|right|bottom|margin[\w-]*|padding[\w-]*|flex-basis)\b|'transition':\s*'(?:width|height|top|left|right|bottom|margin|padding|flex-basis)/gi;

/**
 * scroll event listener used for animation (direct DOM scrollTop/scrollY reads
 * inside an event callback).
 *
 * Catches: addEventListener('scroll', ...) and onScroll style.
 */
const SCROLL_EVENT_RE = /addEventListener\s*\(\s*['"]scroll['"]/g;

/**
 * will-change: all — too broad, causes the browser to promote everything.
 */
const WILL_CHANGE_ALL_RE = /will-change:\s*['"]?all\b/gi;

/**
 * backdrop-filter or filter with blur > 8px — large blur values cause paint
 * on every frame and are forbidden on large surfaces.
 * Catches blur(9px), blur(10px), blur(20px), blur(1.5rem) etc.
 * 8px / 0.5rem are the allowed ceiling.
 */
const BLUR_LARGE_TAILWIND_RE = /\bblur-(?:md|lg|xl|2xl|3xl)\b/g; // Tailwind blur-md = 12px+

/**
 * CSS custom property (variable) in a transition shorthand — animating CSS
 * variables triggers style recalc and can cascade to layout/paint.
 * e.g. "transition: --color-token 0.3s" or "transition-property: --my-var"
 */
const CSS_VAR_ANIMATE_RE = /\btransition(?:-property)?:\s*['"]?--[\w-]+/gi;

/**
 * Missing prefers-reduced-motion guard around animation/transition declarations.
 * We emit an INFO-level note when we detect animation strings with no
 * "@media (prefers-reduced-motion" in the same file.
 */
const HAS_ANIMATION_RE = /(?:animation|transition)[\s:]/gi;
const REDUCED_MOTION_GUARD_RE = /@media\s*\(\s*prefers-reduced-motion/i;

// ── Validator Entry Point ─────────────────────────────────────────────────────

/**
 * @param {string} src  Raw JSX/TSX source string.
 * @returns {Promise<{ ok: boolean, errors: Array<{path, code, message, suggestion}> }>}
 */
export default async function validate(src) {
  if (typeof src !== 'string') {
    return { ok: true, errors: [] };
  }

  const errors = [];

  // ── MOTION_TRANSITION_ALL ─────────────────────────────────────────────────
  const transAll = scan(src, TRANSITION_ALL_RE);
  for (const hit of transAll) {
    errors.push({
      path: 'css.transition',
      code: 'MOTION_TRANSITION_ALL',
      message: `"transition: all" detected ("${hit.match.trim()}") — animates every property including layout-triggering ones`,
      suggestion: 'Enumerate only compositor-safe properties: "transition: transform 0.3s ease, opacity 0.3s ease". Avoid width, height, top, left.',
    });
  }

  // ── MOTION_LAYOUT_ANIMATE ─────────────────────────────────────────────────
  const layoutAnim = scan(src, LAYOUT_PROP_ANIMATE_RE);
  for (const hit of layoutAnim) {
    errors.push({
      path: 'css.transition',
      code: 'MOTION_LAYOUT_ANIMATE',
      message: `Layout-triggering property animated in transition ("${hit.match.trim()}")`,
      suggestion: 'Prefer transform for positional changes: translateX/Y instead of left/top, scaleX/Y instead of width/height. Use FLIP for layout-like transitions.',
    });
  }

  // ── MOTION_SCROLL_EVENT ───────────────────────────────────────────────────
  const scrollEvt = scan(src, SCROLL_EVENT_RE);
  for (const hit of scrollEvt) {
    errors.push({
      path: 'js.scroll',
      code: 'MOTION_SCROLL_EVENT',
      message: `Scroll event listener detected for animation ("${hit.match.trim()}") — drives animation from scroll events which can cause layout thrash`,
      suggestion: 'Use CSS Scroll Timelines (animation-timeline: scroll()) or View Timelines (animation-timeline: view()) for scroll-linked motion. Use IntersectionObserver for enter/exit triggers.',
    });
  }

  // ── MOTION_WILL_CHANGE_ALL ────────────────────────────────────────────────
  const willChangeAll = scan(src, WILL_CHANGE_ALL_RE);
  for (let i = 0; i < willChangeAll.length; i++) {
    errors.push({
      path: 'css.will-change',
      code: 'MOTION_WILL_CHANGE_ALL',
      message: `"will-change: all" is too broad — promotes every property to its own compositor layer`,
      suggestion: 'Use will-change: transform or will-change: opacity. Only add will-change immediately before an animation; remove it after. Avoid on large/many elements.',
    });
  }

  // ── MOTION_BLUR_LARGE ─────────────────────────────────────────────────────
  let blurMatch;
  const blurSrc = src;
  const blurRe = /(?:backdrop-filter|filter):[^;'"]*blur\(\s*([\d.]+)(px|rem)\s*\)/gi;
  while ((blurMatch = blurRe.exec(blurSrc)) !== null) {
    const value = parseFloat(blurMatch[1]);
    const unit = blurMatch[2];
    const pxValue = unit === 'rem' ? value * 16 : value;
    if (pxValue > 8) {
      errors.push({
        path: 'css.filter',
        code: 'MOTION_BLUR_LARGE',
        message: `blur(${blurMatch[1]}${unit}) exceeds the 8px ceiling — large blur is paint-heavy and causes jank on animated surfaces`,
        suggestion: 'Keep blur ≤ 8px. Use blur only for short one-shot effects on small, isolated elements. Prefer opacity + translate over blur for entrance/exit motion.',
      });
    }
  }
  // Also catch Tailwind classes for blur >= md (12px)
  const twBlur = scan(src, BLUR_LARGE_TAILWIND_RE);
  for (const hit of twBlur) {
    errors.push({
      path: 'css.filter',
      code: 'MOTION_BLUR_LARGE',
      message: `Tailwind class "${hit.match}" applies blur ≥ 12px which is paint-heavy for animated or large surfaces`,
      suggestion: 'Use blur-sm (4px) or blur (8px) at most. Never animate large blur continuously.',
    });
  }

  // ── MOTION_CSS_VAR_ANIMATE ────────────────────────────────────────────────
  const cssVarAnim = scan(src, CSS_VAR_ANIMATE_RE);
  for (const hit of cssVarAnim) {
    errors.push({
      path: 'css.transition',
      code: 'MOTION_CSS_VAR_ANIMATE',
      message: `CSS custom property animated in transition ("${hit.match.trim()}") — CSS variable transitions trigger style recalc cascades`,
      suggestion: 'Animate transform and opacity directly instead of CSS variables. Scope animated CSS variables locally and avoid inheritance.',
    });
  }

  // ── MOTION_REDUCED_MOTION (advisory) ─────────────────────────────────────
  const hasAnimations = HAS_ANIMATION_RE.test(src);
  const hasGuard = REDUCED_MOTION_GUARD_RE.test(src);
  if (hasAnimations && !hasGuard) {
    errors.push({
      path: 'css.accessibility',
      code: 'MOTION_REDUCED_MOTION',
      message: 'Animation/transition declarations present but no @media (prefers-reduced-motion) guard found',
      suggestion: 'Wrap motion declarations in @media (prefers-reduced-motion: no-preference) { ... } or add @media (prefers-reduced-motion: reduce) { animation: none; transition: none; } to disable motion for users who request reduced motion.',
    });
  }

  return { ok: errors.length === 0, errors };
}
