import hds from '@hirobius/design-system/tokens';

export type NavLevel = 'root' | 'section' | 'nested' | 'deep';

function getNavLevelDepth(level: NavLevel) {
  switch (level) {
    case 'nested':
      return 1;
    case 'deep':
      return 2;
    case 'root':
    case 'section':
    default:
      return 0;
  }
}

export function getNavLevelInset(level: NavLevel) {
  const depth = getNavLevelDepth(level);
  return depth === 0
    ? '0px'
    : `calc(${hds.semantic.space.sidebar.indent} * ${depth})`;
}

export function getNavLevelLeadingPadding(level: NavLevel) {
  const inset = getNavLevelInset(level);
  return inset === '0px'
    ? hds.semantic.space.sidebar.railPadding
    : `calc(${hds.semantic.space.sidebar.railPadding} + ${inset})`;
}

export function getNextNavLevel(level: NavLevel): NavLevel {
  switch (level) {
    case 'root':
    case 'section':
      return 'nested';
    case 'nested':
      return 'deep';
    case 'deep':
    default:
      return 'deep';
  }
}
