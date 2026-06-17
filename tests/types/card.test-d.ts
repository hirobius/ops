/**
 * Type-tests for Card prop stability.
 * Uses pure tsc --noEmit — no external test library needed.
 * @unit 12p-test-type-tests-prop-stability
 */
import type { ComponentProps } from 'react';
import type { Card, CardProps } from '../../src/app/components/card';

// ── Shape assertions ──────────────────────────────────────────────────────────

// Valid tone values are assignable
const _defaultTone: CardProps['tone'] = 'default';
const _accentTone: CardProps['tone'] = 'accent';
const _successTone: CardProps['tone'] = 'success';
const _warningTone: CardProps['tone'] = 'warning';
const _dangerTone: CardProps['tone'] = 'danger';

// Valid padding values are assignable
const _componentPad: CardProps['padding'] = 'component';
const _itemPad: CardProps['padding'] = 'item';
const _nonePad: CardProps['padding'] = 'none';

// Boolean flags are assignable
const _bordered: CardProps['bordered'] = true;
const _noPadding: CardProps['noPadding'] = false;

// Full valid props shape compiles without error
const _validProps: CardProps = {
  tone: 'accent',
  bordered: false,
  padding: 'component',
};

// Minimal props compiles without error
const _minimalProps: CardProps = {};

// ComponentProps inference works
type InferredProps = ComponentProps<typeof Card>;
const _fromInferred: InferredProps = { tone: 'success' };

// ── Negative assertions (deliberate type errors) ──────────────────────────────

// @ts-expect-error — 'error' is not a valid tone (it's 'danger' in the API)
const _badTone: CardProps['tone'] = 'error';

// @ts-expect-error — 'px32' is not a valid padding option
const _badPadding: CardProps['padding'] = 'px32';

// @ts-expect-error — bordered must be boolean, not string
const _borderedStr: CardProps['bordered'] = 'yes';

void _defaultTone, _accentTone, _successTone, _warningTone, _dangerTone;
void _componentPad, _itemPad, _nonePad;
void _bordered, _noPadding;
void _validProps, _minimalProps, _fromInferred;
void _badTone, _badPadding, _borderedStr;
