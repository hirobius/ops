/** @internal — not part of @hirobius/design-system public API surface. */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'public', 'hds-manifest.json');
const componentApiPath = path.join(repoRoot, 'src', 'app', 'data', 'component-api.json');

const targets = new Set([
  'Button',
  'HdsButtonGroup',
  'IconButton',
  'Alert',
  'Callout',
  'Stack',
  'Input',
  'SegmentedControl',
  'StepperField',
  'Card',
  'Dialog',
  'Badge',
  'Surface',
  'Grid',
  'Icon',
  'Tag',
  'Divider',
  'HeadingStack',
  'TextLockup',
  'DocLinkCard',
  'InlineLink',
  'NavGroup',
  'NavItem',
  'AssetImg',
  'Table',
  'Field',
  'Stat',
  'StatusListItem',
]);

const allowedChildrenDefaults = {
  Stack: ['*'],
  Grid: ['*'],
  Surface: ['*'],
  Card: ['*'],
  Dialog: ['*'],
  Button: [],
  Tag: [],
  Badge: [],
  Icon: [],
  Divider: [],
  Alert: ['*'],
  Callout: ['*'],
  Input: [],
  HeadingStack: [],
  TextLockup: [],
  Field: ['*'],
  Stat: [],
  StatusListItem: [],
};

const a11yDefaults = {
  // ── Actions ──────────────────────────────────────────────────────────────────
  Button: [
    { rule: 'Must have accessible name via label prop or aria-label', required: true },
    { rule: 'Focus ring visible in all interactive states (uses hds-focus class)', required: true },
  ],
  HdsButtonGroup: [
    { rule: 'Buttons in group must each have accessible names', required: true },
    { rule: 'Group role (role="group") should be set when buttons are semantically related', required: false },
  ],
  IconButton: [
    { rule: 'Must have aria-label (icon-only buttons have no visible text)', required: true },
    { rule: 'Focus ring visible in all interactive states (uses hds-focus class)', required: true },
  ],
  // ── Inputs ───────────────────────────────────────────────────────────────────
  Input: [
    { rule: 'Must have associated label via label prop or aria-labelledby', required: true },
    { rule: 'Error state must be communicated via aria-describedby or aria-invalid', required: true },
  ],
  SegmentedControl: [
    { rule: 'Must have accessible group label (aria-label or aria-labelledby on the container)', required: true },
    { rule: 'Selected option must be communicated via aria-pressed or aria-selected', required: true },
  ],
  StepperField: [
    { rule: 'Must have associated label via label prop or aria-labelledby', required: true },
    { rule: 'Decrement/increment buttons must have aria-label', required: true },
  ],
  Tag: [
    { rule: 'When used as interactive chip (onClick), must have role="button" and keyboard activation', required: true },
    { rule: 'When used as status indicator (no onClick), role should be "status" or omitted', required: false },
  ],
  // ── Navigation ───────────────────────────────────────────────────────────────
  DocLinkCard: [
    { rule: 'Card link must have descriptive accessible name (not just the URL)', required: true },
    { rule: 'Focus ring visible on keyboard navigation', required: true },
  ],
  InlineLink: [
    { rule: 'Link text must be descriptive — avoid "click here" or "read more"', required: true },
    { rule: 'External links must signal new-tab behavior via aria-label or visually hidden text', required: false },
  ],
  NavGroup: [
    { rule: 'Navigation group must have accessible label (aria-label on the nav element)', required: true },
    { rule: 'Expanded/collapsed state communicated via aria-expanded', required: true },
  ],
  NavItem: [
    { rule: 'Active item must be communicated via aria-current="page" or aria-selected', required: true },
    { rule: 'Focus ring visible in all interactive states (uses hds-focus class)', required: true },
  ],
  // ── Display / Media ──────────────────────────────────────────────────────────
  AssetImg: [
    { rule: 'Must have alt text (decorative images use alt="")', required: true },
    { rule: 'Caption or description should be associated via aria-describedby when present', required: false },
  ],
  Table: [
    { rule: 'Column headers must use <th> with scope="col", row headers with scope="row"', required: true },
    { rule: 'Table must have caption or aria-label describing its contents', required: false },
  ],
  // ── Overlays ─────────────────────────────────────────────────────────────────
  Icon: [
    { rule: 'Must have aria-label when used without adjacent text', required: true },
    { rule: 'Decorative icons must have aria-hidden="true"', required: true },
  ],
  Alert: [
    { rule: 'role=alert is set by the component — do not override', required: false },
  ],
  Callout: [
    { rule: 'Callout is decorative; tone is signaled visually — pair with semantic role when meaning matters', required: false },
  ],
  // ── Display ──────────────────────────────────────────────────────────────────
  Field: [
    { rule: 'Label must describe the value; pair with aria-describedby when value is non-trivial', required: false },
  ],
  Stat: [
    { rule: 'Provide an accessible name for the stat when value is symbolic (—, ✓, etc.)', required: false },
  ],
  StatusListItem: [
    { rule: 'Status dot is decorative (aria-hidden); convey status meaning via title or trailing badge', required: true },
  ],
  Dialog: [
    { rule: 'Must have an accessible name via Dialog.Title or aria-label', required: true },
    { rule: 'Description should be associated via Dialog.Description when present', required: false },
    { rule: 'Focus must be trapped within dialog while open', required: true },
    { rule: 'Escape key must close the dialog', required: true },
  ],
};

const compilerStubSpecs = {
  HdsPhosphor: {
    category: 'Compiler',
    filePath: 'scripts/hds-jsx-compiler.mjs',
    description: 'Compiler-recognized icon alias stub for JSX normalization.',
    hidden: true,
    tier: 'utility',
  },
  HdsFrame: {
    category: 'Compiler',
    filePath: 'scripts/hds-jsx-compiler.mjs',
    description: 'Compiler-internal frame primitive stub for generated JSX validation.',
    hidden: true,
    tier: 'utility',
  },
  Text: {
    category: 'Compiler',
    filePath: 'scripts/hds-jsx-compiler.mjs',
    description: 'Compiler-internal text primitive stub for generated JSX validation.',
    hidden: true,
    tier: 'utility',
  },
  HdsHeading: {
    category: 'Compiler',
    filePath: 'scripts/hds-jsx-compiler.mjs',
    description: 'Compiler-recognized heading primitive stub for generated JSX validation.',
    hidden: true,
    tier: 'utility',
  },
  HdsLabel: {
    category: 'Compiler',
    filePath: 'scripts/hds-jsx-compiler.mjs',
    description: 'Compiler-recognized label primitive stub for generated JSX validation.',
    hidden: true,
    tier: 'utility',
  },
  HdsCaption: {
    category: 'Compiler',
    filePath: 'scripts/hds-jsx-compiler.mjs',
    description: 'Compiler-recognized caption primitive stub for generated JSX validation.',
    hidden: true,
    tier: 'utility',
  },
  HdsCheckbox: {
    category: 'Compiler',
    filePath: 'scripts/hds-jsx-compiler.mjs',
    description: 'Compiler-recognized checkbox instance stub for generated JSX validation.',
    hidden: true,
    tier: 'utility',
  },
  HdsChip: {
    category: 'Compiler',
    filePath: 'scripts/hds-jsx-compiler.mjs',
    description: 'Compiler-recognized chip instance stub for generated JSX validation.',
    hidden: true,
    tier: 'utility',
  },
  HdsAvatar: {
    category: 'Compiler',
    filePath: 'scripts/hds-jsx-compiler.mjs',
    description: 'Compiler-recognized avatar instance stub for generated JSX validation.',
    hidden: true,
    tier: 'utility',
  },
};

const legacyFilePaths = {
  AssetImg: 'src/app/components/AssetImg.tsx',
  DocLinkCard: 'src/app/components/DocLinkCard.tsx',
  ComponentDocPage: 'src/app/components/ComponentDocPage.tsx',
  HdsDocPrimitives: 'src/app/pages/hds/HdsDocPrimitives.tsx',
  ReflectiveTokenTable: '',
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stripQuotes(value) {
  return value.replace(/^['"]|['"]$/g, '');
}

function parseEnumValues(type) {
  const parts = String(type)
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const quoted = parts.every((part) => /^['"][^'"]+['"]$/.test(part));
  return quoted ? parts.map(stripQuotes) : null;
}

function parseDefaultValue(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (/^-?\d+(\.\d+)?$/.test(String(value))) {
    return Number(value);
  }

  if (/^['"].*['"]$/.test(String(value))) {
    return stripQuotes(String(value));
  }

  return value;
}

function normalizePropType(type) {
  const typeText = String(type).trim();
  const enumValues = parseEnumValues(typeText);

  if (enumValues) {
    return { type: 'enum', values: enumValues };
  }

  if (typeText === 'boolean' || /^boolean\s*\|/.test(typeText) || /\|\s*boolean$/.test(typeText)) {
    return { type: 'boolean' };
  }

  if (typeText === 'string') {
    return { type: 'string' };
  }

  if (typeText === 'number') {
    return { type: 'number' };
  }

  return { type: typeText };
}

function normalizeApiProps(apiProps) {
  if (!Array.isArray(apiProps)) {
    return {};
  }

  const props = {};

  for (const prop of apiProps) {
    if (!prop || typeof prop.name !== 'string') {
      continue;
    }

    const normalized = normalizePropType(prop.type ?? 'unknown');

    if (normalized.values) {
      props[prop.name] = { type: normalized.type, values: normalized.values };
    } else {
      props[prop.name] = { type: normalized.type };
    }

    const parsedDefault = parseDefaultValue(prop.default);
    if (parsedDefault !== undefined) {
      props[prop.name].default = parsedDefault;
    }

    if (prop.required === false && parsedDefault === undefined) {
      props[prop.name].optional = true;
    }
  }

  return props;
}

function ensureProps(spec, apiComponent) {
  if (isPlainObject(spec.props)) {
    return spec.props;
  }

  return normalizeApiProps(apiComponent?.props);
}

function deriveRequiredProps(props) {
  return Object.entries(props)
    .filter(([, config]) => isPlainObject(config))
    .filter(([, config]) => config.optional !== true && !Object.prototype.hasOwnProperty.call(config, 'default'))
    .map(([propName]) => propName);
}

function derivePropConstraints(props) {
  const constraints = {};

  for (const [propName, config] of Object.entries(props)) {
    if (!isPlainObject(config) || typeof config.type !== 'string') {
      continue;
    }

    if (config.type === 'enum' && Array.isArray(config.values)) {
      constraints[propName] = { type: 'enum', values: [...config.values] };
      continue;
    }

    if (config.type === 'boolean') {
      constraints[propName] = { type: 'boolean' };
      continue;
    }

    if (config.type === 'string') {
      constraints[propName] = { type: 'string' };
    }
  }

  return constraints;
}

const manifest = readJson(manifestPath);
const componentApi = readJson(componentApiPath);
const componentSpecs = manifest.componentSpecs ?? {};
const apiComponents = componentApi.components ?? {};

for (const [name, stubSpec] of Object.entries(compilerStubSpecs)) {
  if (!componentSpecs[name]) {
    componentSpecs[name] = { ...stubSpec };
  }
}

for (const [name, spec] of Object.entries(componentSpecs)) {
  const apiComponent = apiComponents[name];
  const props = ensureProps(spec, apiComponent);

  if (typeof spec.filePath !== 'string') {
    spec.filePath = spec.sourcePath ?? apiComponent?.filePath ?? legacyFilePaths[name] ?? '';
  }

  if (!isPlainObject(spec.props)) {
    spec.props = props;
  }

  if (!('allowedChildren' in spec)) {
    spec.allowedChildren = targets.has(name) ? [...(allowedChildrenDefaults[name] ?? [])] : ['*'];
  }

  if (!('propConstraints' in spec)) {
    spec.propConstraints = targets.has(name) ? derivePropConstraints(props) : {};
  }

  if (!('requiredProps' in spec)) {
    spec.requiredProps = targets.has(name) ? deriveRequiredProps(props) : [];
  }

  // Apply a11yRules: set if not present, or if empty and we have defaults for this component
  if (!('a11yRules' in spec) || (spec.a11yRules.length === 0 && targets.has(name) && a11yDefaults[name])) {
    spec.a11yRules = targets.has(name) ? [...(a11yDefaults[name] ?? [])] : (spec.a11yRules ?? []);
  }
}

manifest.componentSpecs = componentSpecs;
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
