import { Page, Stack, Surface, TextLockup } from '@hirobius/design-system';

export default function IncubatorPage() {
  return (
    <div className="hds-page-enter">
      <Page>
        <Stack gap="spacious">
          <TextLockup
            eyebrow="The Lab"
            title="Component Incubator"
            description="Staging ground for AI-generated draft components before they are promoted to the core library."
            size="section"
          />

          <Surface padding="component">
            <Stack gap="gap">
              <TextLockup
                eyebrow="Baseline"
                title="Draft mount"
                description="Mount one Draft component here, review it at mobile and desktop, then promote it once it passes the guardrails."
                size="section"
              />
              {/* @hds-incubation: Mount one Draft component below for visual review before promotion. */}
            </Stack>
          </Surface>
        </Stack>
      </Page>
    </div>
  );
}
