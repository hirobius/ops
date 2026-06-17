/** @internal — not part of @hirobius/design-system public API surface. */
(function () {
  const CHECKED_PROPERTIES = {
    color: ['background-color', 'color', 'border-color', 'outline-color'],
    spacing: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'gap'],
    typography: ['font-size', 'font-family', 'letter-spacing', 'line-height'],
    shape: ['border-radius'],
  };

  const ALL_CHECKED_PROPS = Object.values(CHECKED_PROPERTIES).flat();
  const HDS_COMPONENT_CLASSES = [
    'hds-button',
    'hds-card',
    'hds-badge',
    'hds-tag',
    'hds-alert',
    'hds-codeblock',
    'hds-token-chip',
  ];
  const HDS_ANCESTOR_DEPTH = 10;
  const ALLOWED_KEYWORD_VALUES = new Set([
    'transparent',
    'initial',
    'inherit',
    'unset',
    'none',
    'auto',
    'currentcolor',
  ]);

  function invertMap(map) {
    const result = {};
    for (const [key, value] of Object.entries(map)) {
      result[value] = key;
    }
    return result;
  }

  function parseVarName(value) {
    if (!value) return null;
    const match = value.match(/^var\(\s*(--[\w-]+)/);
    return match ? match[1] : null;
  }

  function parseHex(hex) {
    const shortMatch = hex.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
    if (shortMatch) {
      return [
        Number.parseInt(shortMatch[1] + shortMatch[1], 16),
        Number.parseInt(shortMatch[2] + shortMatch[2], 16),
        Number.parseInt(shortMatch[3] + shortMatch[3], 16),
      ];
    }

    const match = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!match) return null;
    return [
      Number.parseInt(match[1], 16),
      Number.parseInt(match[2], 16),
      Number.parseInt(match[3], 16),
    ];
  }

  function normalizeHex(hex) {
    const parsed = parseHex(hex);
    if (!parsed) return null;
    return `#${parsed.map(value => value.toString(16).padStart(2, '0')).join('')}`;
  }

  function normalizeFontFamily(value) {
    return value
      .split(',')
      .map(part => part.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' '))
      .filter(Boolean)
      .join(', ');
  }

  function fontFamilyContainsExpected(actual, expected) {
    const actualFamilies = normalizeFontFamily(actual)
      .toLowerCase()
      .split(', ')
      .map(part => part.replace(/\s+variable$/, ''));
    const expectedFamilies = normalizeFontFamily(expected)
      .toLowerCase()
      .split(', ')
      .map(part => part.replace(/\s+variable$/, ''));

    const actualSet = new Set(actualFamilies);
    const expectedSet = new Set(expectedFamilies);
    const sharedFamilies = expectedFamilies.filter(family => actualSet.has(family));
    const actualHasSans = actualSet.has('sans-serif');
    const expectedHasSans = expectedSet.has('sans-serif');

    if (sharedFamilies.length >= 2 && (!expectedHasSans || actualHasSans)) {
      return true;
    }

    let index = 0;
    for (const family of actualFamilies) {
      if (family === expectedFamilies[index]) {
        index += 1;
      }
      if (index === expectedFamilies.length) return true;
    }

    return false;
  }

  function normalizeNumericCss(value) {
    const match = value.match(/^(-?)(?:0+)?(\d+)?(?:\.(\d+))?(px|rem|em|%)?$/i);
    if (!match) return value;

    const sign = match[1] ?? '';
    const integer = match[2] ?? '0';
    const decimal = match[3] ? `.${match[3]}` : '';
    const unit = match[4] ?? '';
    return `${sign}${integer}${decimal}${unit}`;
  }

  function normalizeCssValue(value) {
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();
    const normalizedHex = normalizeHex(lower);
    if (normalizedHex) return normalizedHex;
    if (/(?:^|,)\s*["']/.test(trimmed) || trimmed.includes(',')) {
      return normalizeFontFamily(trimmed).toLowerCase();
    }
    if (/^-?(?:\d|\.\d)/.test(trimmed)) {
      return normalizeNumericCss(trimmed).toLowerCase();
    }
    return lower.replace(/\s+/g, ' ');
  }

  function rgbDistance(a, b) {
    return Math.sqrt(
      Math.pow(a[0] - b[0], 2) +
      Math.pow(a[1] - b[1], 2) +
      Math.pow(a[2] - b[2], 2),
    );
  }

  function nearestColorToken(hex, valueToToken) {
    const target = parseHex(hex);
    if (!target) return null;

    let bestToken = null;
    let bestDistance = Infinity;

    for (const [tokenHex, cssVar] of Object.entries(valueToToken)) {
      const rgb = parseHex(tokenHex);
      if (!rgb) continue;
      const distance = rgbDistance(target, rgb);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestToken = cssVar;
      }
    }

    return bestToken;
  }

  function nearestSpacingToken(value, valueToToken) {
    if (!value.endsWith('px')) return null;
    const numericValue = Number.parseFloat(value);
    if (Number.isNaN(numericValue)) return null;

    let bestToken = null;
    let bestDistance = Infinity;

    for (const [tokenValue, cssVar] of Object.entries(valueToToken)) {
      if (!tokenValue.endsWith('px')) continue;
      const numericTokenValue = Number.parseFloat(tokenValue);
      if (Number.isNaN(numericTokenValue)) continue;
      const distance = Math.abs(numericValue - numericTokenValue);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestToken = cssVar;
      }
    }

    return bestToken;
  }

  function buildSelectorChain(el, depth) {
    const segments = [];
    let current = el;

    while (current && current !== document.body && segments.length < depth) {
      const tag = current.tagName.toLowerCase();
      const id = current.id ? `#${current.id}` : '';
      const cls = !id && current.classList.length > 0 ? `.${current.classList[0]}` : '';
      segments.unshift(`${tag}${id}${cls}`);
      current = current.parentElement;
    }

    return segments.join(' > ');
  }

  function isHdsAncestor(el, depth) {
    let current = el.parentElement;
    let levels = 0;

    while (current && levels < depth) {
      if (current.hasAttribute('data-hds-component')) return true;

      for (const cls of Array.from(current.classList)) {
        if (cls.startsWith('hds-')) return true;
        if (HDS_COMPONENT_CLASSES.includes(cls)) return true;
      }

      current = current.parentElement;
      levels += 1;
    }

    return false;
  }

  function buildVarMap() {
    const result = {};
    const computed = getComputedStyle(document.documentElement);

    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }

      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSStyleRule)) continue;
        const style = rule.style;
        for (let i = 0; i < style.length; i += 1) {
          const prop = style[i];
          if (!prop.startsWith('--')) continue;
          const resolved = computed.getPropertyValue(prop).trim();
          if (resolved) {
            result[prop] = resolved;
          }
        }
      }
    }

    return result;
  }

  function checkHardcoded(el, valueToToken) {
    const violations = [];
    const htmlEl = el;
    if (!htmlEl.style) return violations;

    if (el.hasAttribute('data-inspector-ignore')) return violations;
    let ignoreAncestor = el.parentElement;
    while (ignoreAncestor) {
      if (ignoreAncestor.hasAttribute('data-inspector-ignore')) return violations;
      ignoreAncestor = ignoreAncestor.parentElement;
    }

    const selector = buildSelectorChain(el, 4);

    for (const prop of ALL_CHECKED_PROPS) {
      const raw = htmlEl.style.getPropertyValue(prop).trim();
      if (!raw) continue;
      if (raw.startsWith('var(')) continue;
      if (ALLOWED_KEYWORD_VALUES.has(raw.toLowerCase())) continue;
      if (Object.prototype.hasOwnProperty.call(valueToToken, raw)) continue;

      const isColorProp = CHECKED_PROPERTIES.color.includes(prop);
      const isSpacingProp = CHECKED_PROPERTIES.spacing.includes(prop);
      const suggestion = isColorProp
        ? nearestColorToken(raw, valueToToken)
        : isSpacingProp
          ? nearestSpacingToken(raw, valueToToken)
          : null;

      violations.push({
        kind: 'hardcoded',
        selector,
        property: prop,
        value: raw,
        suggestion,
      });
    }

    return violations;
  }

  function checkStaleVars(el, varToValue, expectedValues) {
    const violations = [];
    const htmlEl = el;
    if (!htmlEl.style) return violations;

    const selector = buildSelectorChain(el, 4);

    for (const prop of ALL_CHECKED_PROPS) {
      const raw = htmlEl.style.getPropertyValue(prop).trim();
      if (!raw) continue;

      const varName = parseVarName(raw);
      if (!varName) continue;

      const actualValue = varToValue[varName] ?? null;

      if (actualValue === null) {
        violations.push({
          kind: 'dangling-var',
          selector,
          property: prop,
          varName,
          actualValue: null,
          expectedValue: expectedValues[varName] ?? null,
        });
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(expectedValues, varName)) {
        const expectedValue = expectedValues[varName];
        const isFontFamilyVar = varName.includes('font-family');
        const fontFamilyCompatible = isFontFamilyVar && fontFamilyContainsExpected(actualValue, expectedValue);
        if (!fontFamilyCompatible && normalizeCssValue(actualValue) !== normalizeCssValue(expectedValue)) {
          violations.push({
            kind: 'stale-var',
            selector,
            property: prop,
            varName,
            actualValue,
            expectedValue,
          });
        }
      }
    }

    return violations;
  }

  function checkUninventoried(el) {
    const htmlEl = el;
    if (!htmlEl.style || htmlEl.style.length < 4) return null;

    let ancestor = el.parentElement;
    while (ancestor) {
      if (ancestor.hasAttribute('data-inspector-ignore')) return null;
      ancestor = ancestor.parentElement;
    }

    if (el.hasAttribute('data-hds-component') || el.hasAttribute('data-inspector-ignore')) return null;
    if (isHdsAncestor(el, HDS_ANCESTOR_DEPTH)) return null;

    const properties = [];
    for (let i = 0; i < htmlEl.style.length; i += 1) {
      properties.push(htmlEl.style[i]);
    }

    return {
      kind: 'uninventoried',
      selector: buildSelectorChain(el, 4),
      styleCount: htmlEl.style.length,
      properties,
    };
  }

  window.__HDS_HEADLESS_SCAN__ = function runHeadlessScan(payload) {
    const expectedValues = payload.expectedValues ?? {};
    const handoffDrift = payload.handoffDrift ?? [];
    const deadTokens = payload.deadTokens ?? [];
    const auditOkComments = payload.auditOkComments ?? [];

    const varToValue = buildVarMap();
    const valueToToken = invertMap(varToValue);
    const hardcoded = [];
    const staleVars = [];
    const uninventoried = [];

    for (const el of Array.from(document.querySelectorAll('*'))) {
      hardcoded.push(...checkHardcoded(el, valueToToken));
      staleVars.push(...checkStaleVars(el, varToValue, expectedValues));
      const uninventoriedViolation = checkUninventoried(el);
      if (uninventoriedViolation) {
        uninventoried.push(uninventoriedViolation);
      }
    }

    const totalOffenders =
      hardcoded.length +
      staleVars.length +
      uninventoried.length +
      handoffDrift.length +
      deadTokens.length;

    return {
      hardcoded,
      staleVars,
      uninventoried,
      handoffDrift,
      deadTokens,
      auditOkComments,
      totalOffenders,
    };
  };
}());
