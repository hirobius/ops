/**
 * Type-tests for HdsButton prop stability.
 * Uses pure tsc --noEmit — no external test library needed.
 * @unit 12p-test-type-tests-prop-stability
 */
import type { ComponentProps } from 'react';
import type { HdsButton, HdsButtonProps } from '../../src/app/components/HdsButton';

// ── Shape assertions ──────────────────────────────────────────────────────────

// Valid variant values are assignable
const _primaryVariant: HdsButtonProps['variant'] = 'primary';
const _secondaryVariant: HdsButtonProps['variant'] = 'secondary';
const _tertiaryVariant: HdsButtonProps['variant'] = 'tertiary';

// Valid size values are assignable
const _smSize: HdsButtonProps['size'] = 'sm';
const _mdSize: HdsButtonProps['size'] = 'md';
const _lgSize: HdsButtonProps['size'] = 'lg';

// Optional boolean flags are assignable
const _iconOnly: HdsButtonProps['iconOnly'] = true;
const _loading: HdsButtonProps['loading'] = false;
const _asChild: HdsButtonProps['asChild'] = false;
const _disabled: HdsButtonProps['disabled'] = true;

// Full valid props shape compiles without error
const _validProps: HdsButtonProps = {
  variant: 'primary',
  size: 'md',
};

// Minimal props (all optional except nothing) compiles without error
const _minimalProps: HdsButtonProps = {};

// ComponentProps inference matches the exported interface
type InferredProps = ComponentProps<typeof HdsButton>;
const _fromInferred: InferredProps = { variant: 'secondary', size: 'sm' };

// ── Negative assertions (deliberate type errors) ──────────────────────────────

// @ts-expect-error — 'invalid' is not a valid variant
const _badVariant: HdsButtonProps['variant'] = 'invalid';

// @ts-expect-error — 'xl' is not a valid size
const _badSize: HdsButtonProps['size'] = 'xl';

// @ts-expect-error — loading must be boolean, not string
const _loadingString: HdsButtonProps['loading'] = 'yes';

// Suppress unused variable warnings — these are type-only assertions
void _primaryVariant, _secondaryVariant, _tertiaryVariant;
void _smSize, _mdSize, _lgSize;
void _iconOnly, _loading, _asChild, _disabled;
void _validProps, _minimalProps, _fromInferred;
void _badVariant, _badSize, _loadingString;
