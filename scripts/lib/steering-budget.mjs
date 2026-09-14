/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/lib/steering-budget.mjs — pure budget arithmetic for ops#292.
 *
 * Kept separate from the gate script so the decision logic is testable without
 * touching the filesystem. See scripts/check-steering-budget.mjs for the shell.
 *
 * @module steering-budget
 */

/**
 * Compare measured always-on context against the budget.
 *
 * @param {{ maxTotalBytes: number, sizes: Record<string, number|null> }} input
 *   `sizes` maps each manifest path to its byte count, or null when missing.
 * @returns {{ total: number, over: number, violations: Array<{ id: string, detail: string }> }}
 */
export function evaluateBudget({ maxTotalBytes, sizes }) {
  const violations = [];
  let total = 0;

  for (const [file, size] of Object.entries(sizes)) {
    if (size === null || size === undefined) {
      violations.push({
        id: `missing-${file}`,
        detail: `${file} is listed in the steering budget but does not exist — remove it from the manifest or restore the file`,
      });
      continue;
    }
    total += size;
  }

  const over = total - maxTotalBytes;
  if (over > 0) {
    const worst = Object.entries(sizes)
      .filter(([, s]) => typeof s === 'number')
      .sort((a, b) => b[1] - a[1])[0];
    violations.push({
      id: 'steering-budget-exceeded',
      detail:
        `always-on agent context is ${fmt(total)} against a ${fmt(maxTotalBytes)} budget ` +
        `(${fmt(over)} over). Largest contributor: ${worst?.[0]} at ${fmt(worst?.[1] ?? 0)}. ` +
        `Move history to an on-demand file rather than raising the budget.`,
    });
  }

  return { total, over: Math.max(0, over), violations };
}

/** Human-readable byte count. @param {number} n */
export function fmt(n) {
  return n >= 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`;
}
