#!/usr/bin/env bash
# Hirobius Design System — Style Dictionary POC parity check
#
# Runs the Style Dictionary config and diffs its output against the expected
# snapshot extracted from build-tokens.mjs's actual output for the same tokens.
#
# EXIT 0 → byte-equivalent for the POC scope (primitive.color + .space + .radius)
# EXIT 1 → semantic differences found or SD build failed
#
# Usage: bash scripts/poc/style-dictionary-poc/run.sh
#    or: pnpm audit:style-dictionary

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

echo "=== Style Dictionary POC ==="
echo "Scope: primitive.color + primitive.space + primitive.radius"
echo ""

# Step 1: Run Style Dictionary
echo "Running Style Dictionary..."
node "${SCRIPT_DIR}/sd.config.mjs"

ACTUAL="${SCRIPT_DIR}/actual.css"
EXPECTED="${SCRIPT_DIR}/expected.css"

if [ ! -f "${ACTUAL}" ]; then
  echo "ERROR: actual.css was not generated."
  exit 1
fi

# Step 2: Normalize both files for comparison
# Strip header comments, trailing whitespace, and collapse blank lines for diffing.
normalize() {
  # Remove block comments /* ... */ spanning single or multiple lines
  # Then strip trailing whitespace and collapse consecutive blank lines
  python3 -c "
import re, sys
text = open(sys.argv[1]).read()
# Remove block comments (single and multi-line)
text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
# Strip trailing whitespace on each line
lines = [l.rstrip() for l in text.split('\n')]
# Remove leading blank lines
while lines and not lines[0].strip():
    lines.pop(0)
# Collapse consecutive blank lines
result = []
prev_blank = False
for line in lines:
    is_blank = not line.strip()
    if is_blank and prev_blank:
        continue
    result.append(line)
    prev_blank = is_blank
# Remove trailing blank lines
while result and not result[-1].strip():
    result.pop()
print('\n'.join(result))
" "$1"
}

ACTUAL_NORM=$(normalize "${ACTUAL}")
EXPECTED_NORM=$(normalize "${EXPECTED}")

echo ""
echo "=== Diff (normalized) ==="
if diff <(echo "${EXPECTED_NORM}") <(echo "${ACTUAL_NORM}"); then
  echo ""
  echo "RESULT: PASS — byte-equivalent output for POC scope (after normalization)"
  echo ""
  echo "Semantic equivalence confirmed for:"
  echo "  - All primitive.color tokens (neutral, blue, red, green, amber, projectBrand)"
  echo "  - All primitive.space tokens (0px–128px, px1–px10)"
  echo "  - All primitive.radius tokens (0px–9999px)"
  echo ""
  echo "Known differences outside POC scope (require custom transforms to resolve):"
  echo "  1. primitive.color.projectBrand names: SD kebab-converts camelCase segments"
  echo "     unless name/hds-preserve-camel transform is applied (included in sd.config.mjs)"
  echo "  2. Hex case: SD lowercases hex literals; build-tokens.mjs preserves source case"
  echo "     (cosmetic, browsers are case-insensitive)"
  echo "  3. Zero dimensions: SD emits '0' not '0px' without value/hds-dimension-zero transform"
  echo ""
  echo "Out-of-scope gaps (not covered by this POC, documented in migration plan):"
  echo "  - spring/motionEasing custom types → SD emits [object Object]; need custom transform"
  echo "  - duration {value,unit} objects → SD emits [object Object]; need custom transform"
  echo "  - motion composite expansion (--hds-motion-X-duration / -easing) → custom format"
  echo "  - typography composite expansion (--sem-typo-X-font-family etc.) → custom format"
  echo "  - elevation composite expansion (--sem-elev-X-surface/shadow/border) → custom format"
  echo "  - dark mode [data-theme='dark'] block → custom format"
  echo "  - tenant overlay [data-tenant='slug'] blocks → custom plugin"
  echo "  - TypeScript output files → custom format (not SD's core concern)"
  echo "  - hds-manifest.json → out-of-band script"
  echo "  - tailwind.config.tokens.cjs → out-of-band script"
  exit 0
else
  echo ""
  echo "RESULT: FAIL — differences found (see diff above)"
  exit 1
fi
