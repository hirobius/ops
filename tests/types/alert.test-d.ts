/**
 * Type-tests for Alert prop stability.
 * Uses pure tsc --noEmit — no external test library needed.
 * @unit 12p-test-type-tests-prop-stability
 */
import type { ComponentProps } from 'react';
import type { Alert } from '../../src/app/components/alert';

// Alert uses an unexported AlertProps; derive via ComponentProps
type AlertProps = ComponentProps<typeof Alert>;

// ── Shape assertions ──────────────────────────────────────────────────────────

// Valid variant values are assignable
const _successVariant: AlertProps['variant'] = 'success';
const _errorVariant: AlertProps['variant'] = 'error';
const _warningVariant: AlertProps['variant'] = 'warning';
const _infoVariant: AlertProps['variant'] = 'info';

// Full valid props shape compiles without error (children is required)
const _validProps: AlertProps = {
  variant: 'success',
  title: 'Success',
  children: 'Your changes have been saved.',
};

// Minimal props (just required children) compiles without error
const _minimalProps: AlertProps = {
  children: 'Something went wrong.',
};

// Optional variant is assignable after the fact
const _withVariant: AlertProps = {
  variant: 'error',
  children: 'Form validation failed.',
};

// ── Negative assertions (deliberate type errors) ──────────────────────────────

// @ts-expect-error — 'danger' is not a valid variant (the API uses 'error')
const _badDanger: AlertProps['variant'] = 'danger';

// @ts-expect-error — 'neutral' is not a valid variant
const _badNeutral: AlertProps['variant'] = 'neutral';

// @ts-expect-error — children is required, omitting it is a type error
const _missingChildren: AlertProps = {
  variant: 'info',
};

void _successVariant, _errorVariant, _warningVariant, _infoVariant;
void _validProps, _minimalProps, _withVariant;
void _badDanger, _badNeutral, _missingChildren;
