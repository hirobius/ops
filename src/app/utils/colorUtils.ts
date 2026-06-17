/**
 * colorUtils — shared color math utilities.
 * Extracted from LegacyTokenDetail.tsx on 2026-05-01 (12i-bloat-legacy-token-dead-code).
 */

/** Convert an oklch(...) CSS string to a lowercase hex color, or null on failure. */
export function convertCssColorToHex(value: string): string | null {
  const parsed = parseOklch(value);
  if (!parsed) return null;

  const { l, c, h } = parsed;
  const angle = (h * Math.PI) / 180;
  const a = c * Math.cos(angle);
  const b = c * Math.sin(angle);

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;

  const lLinear = lPrime ** 3;
  const mLinear = mPrime ** 3;
  const sLinear = sPrime ** 3;

  const rLinear = +4.0767416621 * lLinear - 3.3077115913 * mLinear + 0.2309699292 * sLinear;
  const gLinear = -1.2684380046 * lLinear + 2.6097574011 * mLinear - 0.3413193965 * sLinear;
  const bLinear = -0.0041960863 * lLinear - 0.7034186147 * mLinear + 1.707614701 * sLinear;

  const toSrgb = (channel: number) => {
    const clamped = Math.min(Math.max(channel, 0), 1);
    return clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  };

  return `#${[rLinear, gLinear, bLinear]
    .map(channel => Math.round(toSrgb(channel) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Parse an oklch(...) CSS string into { l, c, h } components, or null on failure. */
export function parseOklch(value: string) {
  const match = value
    .trim()
    .match(/^oklch\(\s*([+-]?\d*\.?\d+%?)\s+([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)(?:\s*\/\s*[+-]?\d*\.?\d+%?)?\s*\)$/i);

  if (!match) return null;

  const [, lightnessText, chromaText, hueText] = match;
  const l = lightnessText.endsWith('%')
    ? Number.parseFloat(lightnessText) / 100
    : Number.parseFloat(lightnessText);
  const c = Number.parseFloat(chromaText);
  const h = Number.parseFloat(hueText);

  if ([l, c, h].some(Number.isNaN)) return null;
  return { l, c, h };
}

/** Compute relative luminance from a 6-digit hex color string. */
export function hexToLuminance(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (channel: number) => (
    channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(hex1: string, hex2: string) {
  const l1 = hexToLuminance(hex1);
  const l2 = hexToLuminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Build a WebAIM contrast checker URL for the given foreground and background hex colors. */
export function buildWebAimContrastHref(foregroundHex: string, backgroundHex: string) {
  return `https://webaim.org/resources/contrastchecker/?fcolor=${foregroundHex.replace('#', '')}&bcolor=${backgroundHex.replace('#', '')}`;
}
