/**
 * Type-tests for Input prop stability.
 * Uses pure tsc --noEmit — no external test library needed.
 * @unit 12p-test-type-tests-prop-stability
 */
import type { ComponentProps } from 'react';
import type { Input, InputProps, InputSize } from '../../src/app/components/input';

// ── Shape assertions ──────────────────────────────────────────────────────────

// Valid size values are assignable
const _smSize: InputSize = 'sm';
const _mdSize: InputSize = 'md';
const _lgSize: InputSize = 'lg';

// Valid type values are assignable
const _textType: InputProps['type'] = 'text';
const _emailType: InputProps['type'] = 'email';
const _passwordType: InputProps['type'] = 'password';
const _searchType: InputProps['type'] = 'search';

// Valid textStyle values are assignable
const _bodyStyle: InputProps['textStyle'] = 'body';
const _monoStyle: InputProps['textStyle'] = 'mono';

// Full valid props shape compiles without error
const _validProps: InputProps = {
  size: 'md',
  type: 'text',
  label: 'Email',
  helperText: 'Enter your email',
};

// Error state props compile without error
const _errorProps: InputProps = {
  error: true,
  errorMessage: 'Required field',
};

// Minimal props compiles without error
const _minimalProps: InputProps = {};

// ComponentProps inference works
type InferredProps = ComponentProps<typeof Input>;
const _fromInferred: InferredProps = { size: 'sm', type: 'email' };

// ── Negative assertions (deliberate type errors) ──────────────────────────────

// @ts-expect-error — 'xl' is not a valid size
const _badSize: InputSize = 'xl';

// @ts-expect-error — 'file' is not in the restricted InputFieldType
const _badType: InputProps['type'] = 'file';

// @ts-expect-error — 'serif' is not a valid textStyle
const _badTextStyle: InputProps['textStyle'] = 'serif';

// @ts-expect-error — loading must be boolean, not string
const _loadingStr: InputProps['loading'] = 'true';

void _smSize, _mdSize, _lgSize;
void _textType, _emailType, _passwordType, _searchType;
void _bodyStyle, _monoStyle;
void _validProps, _errorProps, _minimalProps, _fromInferred;
void _badSize, _badType, _badTextStyle, _loadingStr;
