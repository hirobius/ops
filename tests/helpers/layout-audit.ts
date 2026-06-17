/**
 * Shared layout integrity audit logic.
 *
 * Runs entirely inside the browser via page.evaluate() so it has no Node.js
 * dependencies and works with any Playwright page handle.
 *
 * Two enforced invariants from the UI Integrity Constitution:
 *   Gap Mandate       — sibling grid items must never overlap
 *   Containment Rule  — text/content must not bleed outside its surface or sit on its edge
 *   Stretch Rule      — sibling swatch surfaces in a grid row must share a horizon
 */

type IntegrityIssue = {
  target: string;
  detail: string;
};

type IntegrityReport = {
  gridCollisions: IntegrityIssue[];
  textOverflows: IntegrityIssue[];
  stretchMismatches: IntegrityIssue[];
};

/**
 * Evaluates the current page state and returns layout integrity issues.
 * Must be called via `page.evaluate(auditPageLayout)` — the function is
 * serialised and run in the browser context.
 */
export const auditPageLayout: () => IntegrityReport = () => {
  const EPSILON_COLLISION = 2;
  const EPSILON_OVERFLOW = 2;
  const MIN_INTERNAL_PADDING = 4;
  const EPSILON_STRETCH = 2;
  const TEXT_SELECTORS = 'p, span, a, button, label, li, dt, dd, td, th, h1, h2, h3, h4, h5, h6';

  function describeEl(el: Element): string {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = el.classList.length
      ? `.${Array.from(el.classList).slice(0, 3).join('.')}`
      : '';
    return `${tag}${id}${cls}`;
  }

  function domPath(el: Element | null): string {
    const parts: string[] = [];
    let node = el;
    while (node && parts.length < 4 && node.tagName !== 'BODY') {
      parts.unshift(describeEl(node));
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  function isVisible(el: Element): boolean {
    const s = window.getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = (el as HTMLElement).getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }

  function hasTruncation(s: CSSStyleDeclaration): boolean {
    return s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none';
  }

  function findParentSurface(el: Element | null): HTMLElement | null {
    let node = el instanceof HTMLElement ? el : el?.parentElement ?? null;

    while (node) {
      if (node.hasAttribute('data-hds-surface')) {
        return node;
      }
      node = node.parentElement;
    }

    return null;
  }

  // ── Trigger 1: Gap Mandate — detect overlapping siblings inside CSS grids ──

  const gridCollisions: IntegrityIssue[] = [];
  const grids = Array.from(document.querySelectorAll('[data-hds-grid="true"]')).filter((el) => isVisible(el));

  for (const grid of grids) {
    const children = Array.from(grid.children).filter((c) => {
      const s = window.getComputedStyle(c);
      return c.hasAttribute('data-hds-grid-item') && isVisible(c) && s.position !== 'absolute' && s.position !== 'fixed';
    });

    if (children.length < 2) continue;

    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const a = (children[i] as HTMLElement).getBoundingClientRect();
        const b = (children[j] as HTMLElement).getBoundingClientRect();
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > EPSILON_COLLISION && oy > EPSILON_COLLISION) {
          gridCollisions.push({
            target: domPath(grid),
            detail: `${domPath(children[i])} overlaps ${domPath(children[j])} (${Math.round(ox)}×${Math.round(oy)}px)`,
          });
        }
      }
    }
  }

  // ── Trigger 2: Containment Rule — detect text bleeding outside its surface ──

  const textOverflows: IntegrityIssue[] = [];
  const main = document.querySelector('main');
  if (!main) {
    return {
      gridCollisions,
      textOverflows,
      stretchMismatches: [],
    };
  }

  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    const rawText = textNode.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    const parentElement = textNode.parentElement;

    if (!rawText || !parentElement || !isVisible(parentElement)) continue;

    const parentStyle = window.getComputedStyle(parentElement);
    if (hasTruncation(parentStyle)) continue;
    if (parentStyle.display === 'inline') continue;
    if (!parentElement.closest(TEXT_SELECTORS)) continue;

    const surface = findParentSurface(parentElement);
    if (!surface || !isVisible(surface)) continue;

    const surfaceStyle = window.getComputedStyle(surface);
    if (surfaceStyle.overflowX === 'auto' || surfaceStyle.overflowX === 'scroll') continue;
    if (surfaceStyle.overflowY === 'auto' || surfaceStyle.overflowY === 'scroll') continue;

    const range = document.createRange();
    range.selectNodeContents(textNode);
    const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
    if (rects.length === 0) continue;

    const surfaceRect = surface.getBoundingClientRect();
    const hasContainmentViolation = rects.some((rect) => {
      const overflow =
        rect.left < surfaceRect.left - EPSILON_OVERFLOW
        || rect.right > surfaceRect.right + EPSILON_OVERFLOW
        || rect.top < surfaceRect.top - EPSILON_OVERFLOW
        || rect.bottom > surfaceRect.bottom + EPSILON_OVERFLOW;
      const missingPadding =
        rect.left - surfaceRect.left <= MIN_INTERNAL_PADDING
        || surfaceRect.right - rect.right <= MIN_INTERNAL_PADDING
        || rect.top - surfaceRect.top <= MIN_INTERNAL_PADDING
        || surfaceRect.bottom - rect.bottom <= MIN_INTERNAL_PADDING;

      return overflow || missingPadding;
    });

    if (hasContainmentViolation) {
      textOverflows.push({
        target: domPath(parentElement),
        detail: `"${rawText.slice(0, 96)}${rawText.length > 96 ? '…' : ''}" touches or exceeds ${domPath(surface)} (${Math.round(surfaceRect.width)}×${Math.round(surfaceRect.height)}px)`,
      });
    }
  }

  // ── Trigger 3: Stretch Rule — sibling swatches in a grid row must align ──

  const stretchMismatches: IntegrityIssue[] = [];
  const SWATCH_SELECTOR = '[data-layout-role="foundation-swatch-surface"], [data-inspector-ignore="color-swatch"], [data-inspector-ignore="type-specimen"]';

  for (const grid of grids) {
    const rowGroups: Array<Array<{ surface: HTMLElement; rect: DOMRect }>> = [];
    const children = Array.from(grid.children).filter((c) => {
      const s = window.getComputedStyle(c);
      return isVisible(c) && s.position !== 'absolute' && s.position !== 'fixed';
    });

    for (const child of children) {
      const surface = child.querySelector(SWATCH_SELECTOR);
      if (!(surface instanceof HTMLElement) || !isVisible(surface)) continue;

      const rect = surface.getBoundingClientRect();
      const row = rowGroups.find((group) => Math.abs(group[0].rect.top - rect.top) <= EPSILON_STRETCH);
      if (row) {
        row.push({ surface, rect });
      } else {
        rowGroups.push([{ surface, rect }]);
      }
    }

    for (const row of rowGroups) {
      if (row.length < 2) continue;

      const heights = row.map((entry) => entry.rect.height);
      const minHeight = Math.min(...heights);
      const maxHeight = Math.max(...heights);

      if (maxHeight - minHeight > EPSILON_STRETCH) {
        const tallest = row.find((entry) => entry.rect.height === maxHeight);
        const shortest = row.find((entry) => entry.rect.height === minHeight);

        stretchMismatches.push({
          target: domPath(grid),
          detail: `${domPath(shortest?.surface ?? row[0].surface)} (${Math.round(minHeight)}px) vs ${domPath(tallest?.surface ?? row[row.length - 1].surface)} (${Math.round(maxHeight)}px)`,
        });
      }
    }
  }

  return {
    gridCollisions: gridCollisions.slice(0, 20),
    textOverflows: textOverflows.slice(0, 20),
    stretchMismatches: stretchMismatches.slice(0, 20),
  };
};
