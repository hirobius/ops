import { useMemo } from 'react';
import hdsManifestJson from 'virtual:hds-manifest';

type TokenTier = 'primitive' | 'semantic' | 'component';
type TokenType = 'color' | 'dimension' | 'typography' | 'shadow' | 'duration' | 'motion' | string;
type HdsColorTokenPath = `${TokenTier}.color.${string}` | 'semantic.accent.rest' | 'semantic.accent.hover' | 'semantic.accent.active';
type HdsSpacingTokenPath = `${TokenTier}.space.${string}`;
type HdsTypographyTokenPath = `${TokenTier}.typography.${string}`;

export type HdsManifestToken = {
  path: string;
  cssVar: string;
  type: TokenType;
  description?: string;
  value?: unknown;
};

type HdsComponentSpec = {
  category?: string;
  description?: string;
  figmaUrl?: string | null;
  figmaId?: string | null;
  filePath?: string;
  hidden?: boolean;
  tokenMapping?: Record<string, string>;
  [key: string]: unknown;
};

type HdsManifest = {
  name: string;
  version: string;
  componentSpecs: Record<string, HdsComponentSpec>;
  typographyRamp: Record<string, unknown>;
  tokens: Record<TokenTier, HdsManifestToken[]>;
};

type HdsManifestAccessors = {
  colors: {
    all: HdsManifestToken[];
    primitive: {
      all: HdsManifestToken[];
      blue: HdsManifestToken[];
      neutral: HdsManifestToken[];
    };
    semantic: {
      all: HdsManifestToken[];
      border: HdsManifestToken[];
      content: HdsManifestToken[];
      feedback: HdsManifestToken[];
      feedbackBackground: HdsManifestToken[];
      surface: HdsManifestToken[];
    };
    get: (path: HdsColorTokenPath) => HdsManifestToken | undefined;
  };
  spacing: {
    all: HdsManifestToken[];
    component: HdsManifestToken[];
    primitive: HdsManifestToken[];
    semantic: HdsManifestToken[];
    get: (path: HdsSpacingTokenPath) => HdsManifestToken | undefined;
  };
  typography: {
    ramp: HdsManifest['typographyRamp'];
    tokens: HdsManifestToken[];
    get: (path: HdsTypographyTokenPath) => HdsManifestToken | undefined;
  };
  getComponentMetadata: (componentName: string) => HdsComponentSpec | undefined;
};

const hdsManifest = hdsManifestJson as HdsManifest;

function tokensForTier(tier: TokenTier) {
  return hdsManifest.tokens?.[tier] ?? [];
}

function findToken(path: string) {
  return (Object.values(hdsManifest.tokens ?? {}) as HdsManifestToken[][])
    .flat()
    .find((token) => token.path === path);
}

function getHdsComponentMetadata(componentName: string) {
  return hdsManifest.componentSpecs?.[componentName];
}

export function useHdsManifest(): HdsManifest & HdsManifestAccessors {
  return useMemo(() => {
    const primitive = tokensForTier('primitive');
    const semantic = tokensForTier('semantic');
    const component = tokensForTier('component');
    const colorTokens = [...primitive, ...semantic, ...component].filter((token) => (
      token.type === 'color' || token.path.includes('.color.') || token.path.startsWith('semantic.accent.')
    ));
    const spacingTokens = [...primitive, ...semantic, ...component].filter((token) => token.path.includes('.space.'));
    const typographyTokens = [...primitive, ...semantic, ...component].filter((token) => token.path.includes('.typography.'));

    return {
      ...hdsManifest,
      colors: {
        all: colorTokens,
        primitive: {
          all: primitive.filter((token) => token.path.startsWith('primitive.color.')),
          blue: primitive.filter((token) => token.path.startsWith('primitive.color.blue.')),
          neutral: primitive.filter((token) => token.path.startsWith('primitive.color.neutral.')),
        },
        semantic: {
          all: semantic.filter((token) => token.path.startsWith('semantic.color.') || token.path.startsWith('semantic.accent.')),
          border: semantic.filter((token) => token.path.startsWith('semantic.color.border.')),
          content: semantic.filter((token) => token.path.startsWith('semantic.color.content.')),
          feedback: semantic.filter((token) => token.path.startsWith('semantic.color.feedback.') && !token.path.startsWith('semantic.color.feedback.bg.')),
          feedbackBackground: semantic.filter((token) => token.path.startsWith('semantic.color.feedback.bg.')),
          surface: semantic.filter((token) => token.path.startsWith('semantic.color.surface.')),
        },
        get: (path) => findToken(path),
      },
      spacing: {
        all: spacingTokens,
        component: component.filter((token) => token.path.includes('.space.')),
        primitive: primitive.filter((token) => token.path.startsWith('primitive.space.')),
        semantic: semantic.filter((token) => token.path.startsWith('semantic.space.')),
        get: (path) => findToken(path),
      },
      typography: {
        ramp: hdsManifest.typographyRamp,
        tokens: typographyTokens,
        get: (path) => findToken(path),
      },
      getComponentMetadata: getHdsComponentMetadata,
    };
  }, []);
}
