/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * SkillsPage — /ops/skills.
 *
 * The design toolkit surface: the external design-quality catalog
 * (external-skills.ts — impeccable, shadcn skill, SkillUI, Mobbin MCP) plus
 * the Claude Code skills installed in this repo (PluginsBar — dev middleware
 * live, build-time static manifest in prod). Everything is copy-to-run:
 * copy an invocation here, paste it into Claude Code. Dispatch-as-@claude-task
 * is a tracked follow-up, deliberately not built into this slice.
 */

import type { CSSProperties } from 'react';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from '../PageHeader';
import { ExternalSkillsBar } from '../agentic-os/ExternalSkillsBar';
import { PluginsBar } from '../agentic-os/PluginsBar';

export default function SkillsPage() {
  return (
    <div style={s.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Skills' }]}
        title="Skills"
        lede="Design toolkit — copy an invocation, run it in Claude Code. External catalog + skills installed in this repo."
      />

      <section aria-labelledby="skills-external" style={s.section}>
        <h2 id="skills-external" style={s.sectionTitle}>
          Design toolkit
        </h2>
        <p style={s.sectionLede}>
          External skills, CLIs, and connectors adopted for design output — provenance pinned in
          each repo&rsquo;s <code style={s.inlineCode}>skills-lock.json</code>.
        </p>
        <ExternalSkillsBar />
      </section>

      <section aria-labelledby="skills-installed" style={s.section}>
        <h2 id="skills-installed" style={s.sectionTitle}>
          Installed in this repo
        </h2>
        <p style={s.sectionLede}>
          Claude Code skills under <code style={s.inlineCode}>.claude/skills/</code> — engineering
          protocol (implement, tdd, code-review, …). Copy the invocation to run one.
        </p>
        <PluginsBar />
      </section>
    </div>
  );
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px32,
  } as CSSProperties,
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px12,
    minWidth: 0,
  } as CSSProperties,
  sectionTitle: {
    ...hds.typeStyles.h3,
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
  sectionLede: {
    margin: 0,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-secondary)',
    lineHeight: 1.5,
  } as CSSProperties,
  inlineCode: {
    fontFamily: hds.monoFamily,
    fontSize: '0.9em',
  } as CSSProperties,
};
