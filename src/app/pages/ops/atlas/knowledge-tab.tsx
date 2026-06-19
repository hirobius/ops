/* hds-bypass: ops-internal page */

/**
 * KnowledgeTab — render knowledge pillars (Build, Grow, Run) in three columns.
 * Each pillar reads its README via import.meta.glob and displays the first
 * non-blank paragraph as a summary.
 *
 * @category Internal
 * @tier utility
 */

import React from 'react';
import { Card, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

// ── Import knowledge READMEs ─────────────────────────────────────────────────

const readmes = import.meta.glob<string>('../../../../../docs/knowledge/*/README.md', {
  eager: true,
  query: '?raw',
  import: 'default',
});

// ── Pillar metadata ──────────────────────────────────────────────────────────

interface Pillar {
  key: string;
  label: string;
  dir: string;
}

const PILLARS: Pillar[] = [
  { key: 'build', label: 'BUILD', dir: 'build' },
  { key: 'grow', label: 'GROW', dir: 'grow' },
  { key: 'run', label: 'RUN', dir: 'run' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractFirstParagraph(markdown: string): string {
  if (!markdown) return '';

  // Strip frontmatter
  let text = markdown;
  const frontmatterMatch = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (frontmatterMatch) {
    text = frontmatterMatch[2];
  }

  // Find first non-blank paragraph (split by double newline or first heading)
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim() && !p.trim().startsWith('#'));
  if (paragraphs.length === 0) return '';

  // Return first paragraph, strip markdown markers if present
  return paragraphs[0]
    .trim()
    .replace(/^#+\s+/, '')
    .trim();
}

function getPillarContent(dir: string): { summary: string; count: number } {
  const pattern = `/docs/knowledge/${dir}/README.md`;
  const readme = Object.entries(readmes).find(([k]) => k.endsWith(pattern));

  if (!readme) {
    return { summary: `${dir} knowledge directory.`, count: 0 };
  }

  const summary = extractFirstParagraph(readme[1]);
  return { summary: summary || `${dir} knowledge directory.`, count: 1 };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function KnowledgeTab() {
  return (
    <div style={s.pillarsContainer}>
      {PILLARS.map((pillar) => {
        const { summary } = getPillarContent(pillar.dir);
        return (
          <div key={pillar.key} style={s.pillarColumn}>
            <Card tone="default" padding="component">
              <Card.Header>
                <Card.Title style={s.pillarTitle}>{pillar.label}</Card.Title>
              </Card.Header>
              <Card.Body>
                <Stack direction="column" gap="px8">
                  <p style={s.summary}>{summary}</p>
                  <a href={`/ops/knowledge/${pillar.key}`} className="hds-focus" style={s.link}>
                    Browse {pillar.label.toLowerCase()} →
                  </a>
                </Stack>
              </Card.Body>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  pillarsContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: hds.semantic.space.section.inset,
  } satisfies React.CSSProperties,
  pillarColumn: {
    minWidth: 0,
  } satisfies React.CSSProperties,
  pillarTitle: {
    margin: '0 0 8px',
    fontSize: hds.typeStyles.h3.fontSize,
    fontWeight: hds.typeStyles.h3.fontWeight,
    lineHeight: hds.typeStyles.h3.lineHeight,
    color: 'var(--semantic-color-content-primary)',
  } satisfies React.CSSProperties,
  summary: {
    margin: 0,
    fontSize: hds.typeStyles.body.fontSize,
    lineHeight: hds.typeStyles.body.lineHeight,
    color: 'var(--semantic-color-content-secondary)',
  } satisfies React.CSSProperties,
  link: {
    display: 'inline-block',
    fontSize: hds.typeStyles.body.fontSize,
    color: 'var(--semantic-color-interaction-accent)',
    textDecoration: 'none',
    borderBottom: '1px solid transparent',
    transition: `border-color ${hds.duration.normal} ease-out`,
  } satisfies React.CSSProperties,
};
