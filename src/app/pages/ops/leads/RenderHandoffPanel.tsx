/**
 * RenderHandoffPanel — the render-action hand-off for one lead row.
 *
 * Surfaces the `render` action's response (lib/leads/pipeline.mjs renderLeadSite
 * → lib/render's renderArtifacts): the drop-in client.config.ts source and the
 * scaffold/deploy command block, as paste-ready copy-to-clipboard blocks (per
 * the Working-with-Adrian "paste-ready text" convention). The design-system
 * CodeBlock owns the copy button — no bespoke clipboard code needed here.
 */
import { Button, CodeBlock, Stack, Text } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

export interface RenderHandoffPanelProps {
  configFile: string;
  commands: string;
  onDismiss: () => void;
}

export function RenderHandoffPanel({ configFile, commands, onDismiss }: RenderHandoffPanelProps) {
  return (
    <Stack direction="column" gap="px8" style={{ width: '100%', paddingBottom: hds.space.px12 }}>
      <Stack direction="row" justify="space-between" align="center" gap="px12">
        <Text
          variant="technical"
          as="span"
          style={{ color: 'var(--semantic-color-content-secondary)' }}
        >
          Render hand-off — paste into hirobius/clients
        </Text>
        <Button variant="tertiary" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </Stack>
      <CodeBlock code={configFile} language="typescript" filename="client.config.ts" />
      <CodeBlock code={commands} language="bash" filename="deploy commands" />
    </Stack>
  );
}
