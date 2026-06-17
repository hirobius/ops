/**
 * Type-tests for Badge prop stability.
 * Uses pure tsc --noEmit — no external test library needed.
 * @unit 12p-test-type-tests-prop-stability
 */
import type { ComponentProps } from 'react';
import type { Badge } from '../../src/app/components/badge';

// Badge uses an unexported BadgeProps; derive via ComponentProps
type BadgeProps = ComponentProps<typeof Badge>;

// ── Shape assertions ──────────────────────────────────────────────────────────

// Valid tone values are assignable
const _neutralTone: BadgeProps['tone'] = 'neutral';
const _infoTone: BadgeProps['tone'] = 'info';
const _successTone: BadgeProps['tone'] = 'success';
const _dangerTone: BadgeProps['tone'] = 'danger';
const _warningTone: BadgeProps['tone'] = 'warning';

// Full valid props shape compiles without error (children is required)
const _validProps: BadgeProps = {
  children: 'Active',
  tone: 'success',
};

// Minimal props (just required children) compiles without error
const _minimalProps: BadgeProps = {
  children: 'Draft',
};

// ── Negative assertions (deliberate type errors) ──────────────────────────────

// @ts-expect-error — 'error' is not a valid tone
const _badTone: BadgeProps['tone'] = 'error';

// @ts-expect-error — 'primary' is not a valid tone
const _badPrimary: BadgeProps['tone'] = 'primary';

// @ts-expect-error — children is required, omitting it is a type error
const _missingChildren: BadgeProps = {
  tone: 'info',
};

void _neutralTone, _infoTone, _successTone, _dangerTone, _warningTone;
void _validProps, _minimalProps;
void _badTone, _badPrimary, _missingChildren;
