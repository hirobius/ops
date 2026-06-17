/** @internal — not part of @hirobius/design-system public API surface. */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, 'public', 'hds-manifest.json');
const schemaPath = path.join(repoRoot, 'manifest', 'schema.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function pushViolation(violations, component, field, message) {
  violations.push({ component, field, message });
}

function validatePropMap(component, field, value, violations, options = {}) {
  if (!isPlainObject(value)) {
    pushViolation(violations, component, field, 'must be an object');
    return;
  }

  for (const [propName, propSpec] of Object.entries(value)) {
    const propField = `${field}.${propName}`;

    if (!isPlainObject(propSpec)) {
      pushViolation(violations, component, propField, 'must be an object');
      continue;
    }

    if (typeof propSpec.type !== 'string') {
      pushViolation(violations, component, `${propField}.type`, 'must be a string');
    }

    if ('values' in propSpec && !Array.isArray(propSpec.values)) {
      pushViolation(violations, component, `${propField}.values`, 'must be an array');
    }

    if ('optional' in propSpec && typeof propSpec.optional !== 'boolean') {
      pushViolation(violations, component, `${propField}.optional`, 'must be a boolean');
    }

    if (options.constraints) {
      if ('pattern' in propSpec && typeof propSpec.pattern !== 'string') {
        pushViolation(violations, component, `${propField}.pattern`, 'must be a string');
      }
      if ('min' in propSpec && typeof propSpec.min !== 'number') {
        pushViolation(violations, component, `${propField}.min`, 'must be a number');
      }
      if ('max' in propSpec && typeof propSpec.max !== 'number') {
        pushViolation(violations, component, `${propField}.max`, 'must be a number');
      }
    }
  }
}

function validateStringArray(component, field, value, violations) {
  if (!Array.isArray(value)) {
    pushViolation(violations, component, field, 'must be an array');
    return;
  }

  value.forEach((item, index) => {
    if (typeof item !== 'string') {
      pushViolation(violations, component, `${field}[${index}]`, 'must be a string');
    }
  });
}

const TIER_VALUES = new Set([
  'primitive',
  'pattern',
  'template',
  'utility',
]);

const TOKEN_BINDING_KEYS = new Set([
  'fill',
  'stroke',
  'paddingX',
  'paddingY',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'cornerRadius',
  'gap',
  'typography',
  'color',
]);

function validateTokenBinding(component, slotIndex, value, violations) {
  const baseField = `slots[${slotIndex}].tokenBinding`;

  if (!isPlainObject(value)) {
    pushViolation(violations, component, baseField, 'must be an object');
    return;
  }

  for (const [key, val] of Object.entries(value)) {
    if (!TOKEN_BINDING_KEYS.has(key)) {
      pushViolation(violations, component, `${baseField}.${key}`, `unknown binding key (allowed: ${[...TOKEN_BINDING_KEYS].join(', ')})`);
      continue;
    }
    if (val !== null && typeof val !== 'string') {
      pushViolation(violations, component, `${baseField}.${key}`, 'must be a string token path or null');
    }
  }
}

function validateSlots(component, value, violations) {
  if (!Array.isArray(value)) {
    pushViolation(violations, component, 'slots', 'must be an array');
    return;
  }

  value.forEach((slot, index) => {
    const baseField = `slots[${index}]`;

    if (!isPlainObject(slot)) {
      pushViolation(violations, component, baseField, 'must be an object');
      return;
    }

    if (typeof slot.name !== 'string' || slot.name.length === 0) {
      pushViolation(violations, component, `${baseField}.name`, 'must be a non-empty string');
    }

    if ('figmaSlotName' in slot && typeof slot.figmaSlotName !== 'string') {
      pushViolation(violations, component, `${baseField}.figmaSlotName`, 'must be a string');
    }

    if ('tokenBinding' in slot) {
      validateTokenBinding(component, index, slot.tokenBinding, violations);
      // figmaSlotName is required whenever tokenBinding is present so the
      // 8v-3 projection step knows which Figma layer to bind to.
      if (typeof slot.figmaSlotName !== 'string' || slot.figmaSlotName.length === 0) {
        pushViolation(violations, component, `${baseField}.figmaSlotName`, 'is required when tokenBinding is present');
      }
    }
  });
}

function validateA11yRules(component, value, violations) {
  if (!Array.isArray(value)) {
    pushViolation(violations, component, 'a11yRules', 'must be an array');
    return;
  }

  value.forEach((rule, index) => {
    const baseField = `a11yRules[${index}]`;

    if (!isPlainObject(rule)) {
      pushViolation(violations, component, baseField, 'must be an object');
      return;
    }

    if (typeof rule.rule !== 'string') {
      pushViolation(violations, component, `${baseField}.rule`, 'must be a string');
    }

    if (typeof rule.required !== 'boolean') {
      pushViolation(violations, component, `${baseField}.required`, 'must be a boolean');
    }

    if ('selector' in rule && typeof rule.selector !== 'string') {
      pushViolation(violations, component, `${baseField}.selector`, 'must be a string');
    }
  });
}

function validateComponent(component, spec, schemaRequired, violations) {
  if (!isPlainObject(spec)) {
    pushViolation(violations, component, 'componentSpecs', 'must be an object');
    return;
  }

  for (const field of schemaRequired) {
    if (!(field in spec)) {
      pushViolation(violations, component, field, 'is required');
    }
  }

  if ('category' in spec && typeof spec.category !== 'string') {
    pushViolation(violations, component, 'category', 'must be a string');
  }

  if ('filePath' in spec && typeof spec.filePath !== 'string') {
    pushViolation(violations, component, 'filePath', 'must be a string');
  }

  if ('description' in spec && typeof spec.description !== 'string') {
    pushViolation(violations, component, 'description', 'must be a string');
  }

  if ('props' in spec) {
    validatePropMap(component, 'props', spec.props, violations);
  }

  if ('allowedChildren' in spec) {
    validateStringArray(component, 'allowedChildren', spec.allowedChildren, violations);
  }

  if ('propConstraints' in spec) {
    validatePropMap(component, 'propConstraints', spec.propConstraints, violations, { constraints: true });
  }

  if ('requiredProps' in spec) {
    validateStringArray(component, 'requiredProps', spec.requiredProps, violations);
  }

  if ('a11yRules' in spec) {
    validateA11yRules(component, spec.a11yRules, violations);
  }

  if ('slots' in spec) {
    validateSlots(component, spec.slots, violations);
  }

  if ('tier' in spec) {
    if (typeof spec.tier !== 'string' || !TIER_VALUES.has(spec.tier)) {
      pushViolation(
        violations,
        component,
        'tier',
        `must be one of: ${[...TIER_VALUES].join(', ')}`,
      );
    }
  }
}

function validateSection(sectionName, sectionValue, schemaRequired, violations) {
  if (sectionValue === undefined) return 0;
  if (!isPlainObject(sectionValue)) {
    pushViolation(violations, sectionName, sectionName, 'must be an object keyed by component name');
    return 0;
  }
  for (const [component, spec] of Object.entries(sectionValue)) {
    validateComponent(`${sectionName}.${component}`, spec, schemaRequired, violations);
  }
  return Object.keys(sectionValue).length;
}

const manifest = readJson(manifestPath);
const schema = readJson(schemaPath);
const componentSpecs = manifest.componentSpecs ?? {};
const violations = [];
const schemaRequired = Array.isArray(schema.required) ? schema.required : [];

// utilities[] is the only relaxed-contract section. Behavioral helpers,
// barrel re-exports, and runtime modules carry tier-only metadata; their
// public-API fields are best-effort. componentSpecs entries are uniformly
// strict regardless of @doc-exempt status — a component either meets the
// primitive/pattern/template contract or moves to utilities.
const NON_PUBLIC_API_REQUIRED = ['tier'];

for (const [component, spec] of Object.entries(componentSpecs)) {
  validateComponent(component, spec, schemaRequired, violations);
}

const utilityCount = validateSection('utilities', manifest.utilities, NON_PUBLIC_API_REQUIRED, violations);

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(JSON.stringify(violation));
  }
  process.exit(1);
}

const componentCount = Object.keys(componentSpecs).length;
const sections = [`${componentCount} components`];
if (utilityCount > 0) sections.push(`${utilityCount} utilities`);
console.log(`✅ Manifest valid — ${sections.join(', ')} checked`);
