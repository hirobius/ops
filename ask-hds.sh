#!/bin/bash
# Pre-pends strict HDS rules to every mobile prompt
cat <<INNER_EOF | ollama run hds-coder
CONTEXT: 
Here is the design system manifest: $(cat public/hds-manifest.json)

RULES: 
- NEVER use @mui, @human-design-system, or Tailwind utility classes.
- Use ONLY '@/app/components/HdsSurface' and '@/app/design-system/tokens'.
- Use 'style={hds.typeStyles.name}' for typography.

QUESTION:
$1
INNER_EOF
