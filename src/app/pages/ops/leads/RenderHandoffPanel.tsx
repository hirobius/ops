/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * RenderHandoffPanel — the render-action hand-off for one lead row.
 *
 * Surfaces the `render` action's response (lib/leads/pipeline.mjs renderLeadSite
 * → lib/render's renderArtifacts): the drop-in client.config.ts source and the
 * scaffold/deploy command block, as paste-ready copy-to-clipboard blocks (per
 * the Working-with-Adrian "paste-ready text" convention). The design-system
 * CodeBlock owns the copy button — no bespoke clipboard code needed here.
 */
import { CodeBlock } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import type { CSSProperties } from 'react';

export interface RenderHandoffPanelProps {
  configFile: string;
  commands: string;
  onDismiss: () => void;
}

export function RenderHandoffPanel({ configFile, commands, onDismiss }: RenderHandoffPanelProps) {
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span style={s.title}>Render hand-off — paste into hirobius/clients</span>
        <button type="button" onClick={onDismiss} className="hds-focus" style={s.dismiss}>
          Dismiss
        </button>
      </div>
      <CodeBlock code={configFile} language="typescript" filename="client.config.ts" />
      <CodeBlock code={commands} language="bash" filename="deploy commands" />
    </div>
  );
}

const s = {
  wrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
    width: '100%',
    padding: `0 0 ${hds.space.px12}`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: hds.space.px12,
  },
  title: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  dismiss: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    background: 'transparent',
    border: 'none',
    color: 'var(--semantic-color-content-accent)',
    cursor: 'pointer',
    padding: 0,
  },
} satisfies Record<string, CSSProperties>;
