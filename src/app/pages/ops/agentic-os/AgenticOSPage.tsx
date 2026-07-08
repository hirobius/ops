/* hds-bypass: ops-internal page */

/**
 * AgenticOSPage — `/ops` index. The "is the system OK and what's happening
 * right now?" surface. Mobile-first; every metric reads truth from a
 * checked-in source; every button calls a real script via the dev-only
 * skill-runner endpoint.
 *
 * Surface flow (top → bottom):
 *   1. PageHeader        locked-down chrome (Clash anchor + divider)
 *   2. SurfacesRail      inline jump-tiles to sibling /ops surfaces
 *   3. StrengthTab       Score A/B + --json compliance
 *   4. KpiCards          live metrics — active · cost
 *   5. PillarRail        BUILD / GROW / RUN distribution + filter chips
 *   6. Approvals         tasks queued for dispatch — approve/deny inline (#8)
 *   7. Fleet / Runs      run-log + events + alerts, autonomous recaps
 *   8. Routes            (atlas import) — interactive route tree
 *   9. Clients           (atlas import) — registry card grid
 *  10. Gates             (atlas import) — guardrail validators table
 *  11. Skills / New skill / Plugins / Research (collapsed disclosures)
 *
 * @category Internal
 * @tier utility
 */

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { Page, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

import { PageHeader } from '../PageHeader';
import { Disclosure } from '../Disclosure';

import RoutesTree from '../atlas/routes-tree';
import ClientsTab from '../atlas/clients-tab';
import ValidatorsTab from '../atlas/validators-tab';
import StrengthTab from '../atlas/strength-tab';
import { useApprovalsInbox } from '../../admin/useApprovalsInbox';
import { KpiCards } from './KpiCards';
import { PillarRail, type PillarFilter } from './PillarRail';
import { RunsPanel } from './RunsPanel';
import { FleetTimeline } from './FleetTimeline';
import { SurfacesRail } from './SurfacesRail';
import { ApprovalsPanel } from './ApprovalsPanel';
import { SkillsBar } from './SkillsBar';
import { SkillCreatorForm } from './SkillCreatorForm';
import { PluginsBar } from './PluginsBar';
import { ResearchBar } from './ResearchBar';
import { ServicesBar } from './ServicesBar';
import { UNITS } from './data';

/** @public */
export default function AgenticOSPage() {
  const [pillarFilter, setPillarFilter] = useState<PillarFilter>(null);
  const approvalsInbox = useApprovalsInbox();
  const approvalsCount = approvalsInbox.loaded ? approvalsInbox.queued.length : null;

  const filteredUnits = useMemo(() => {
    if (pillarFilter === null) return UNITS;
    if (pillarFilter === 'UNCLASSIFIED') return UNITS.filter((u) => !u.pillar);
    return UNITS.filter((u) => u.pillar === pillarFilter);
  }, [pillarFilter]);

  return (
    <Page>
      <Stack direction="column" gap="px40">
        <PageHeader breadcrumbs={[{ label: 'Ops' }]} title="Ops" />

        <SurfacesRail approvalsCount={approvalsCount} />

        <StrengthTab />

        <KpiCards units={filteredUnits} />

        <PillarRail units={UNITS} filter={pillarFilter} onFilterChange={setPillarFilter} />

        <Section label="Approvals" hint="tasks queued for dispatch — approve or deny">
          <ApprovalsPanel inbox={approvalsInbox} />
        </Section>

        <Section label="Fleet" hint="run-log + events + alerts, merged — newest 20">
          <FleetTimeline />
        </Section>

        <Section label="Runs" hint="autonomous run recap — newest 15">
          <RunsPanel />
        </Section>

        <Disclosure id="agentic-os.services" label="Services" hint="local dev daemons">
          <ServicesBar />
        </Disclosure>

        <Disclosure id="agentic-os.skills" label="Skills" hint="whitelisted scripts">
          <SkillsBar />
        </Disclosure>

        <Disclosure
          id="agentic-os.skill-creator"
          label="New skill"
          hint="capture intent — build deferred to next session"
        >
          <SkillCreatorForm />
        </Disclosure>

        <Disclosure id="agentic-os.plugins" label="Plugins" hint="Claude Code skills">
          <PluginsBar />
        </Disclosure>

        <Disclosure
          id="agentic-os.research"
          label="Research"
          hint="auto-research findings — local Ollama"
        >
          <ResearchBar />
        </Disclosure>

        <Section label="Routes" hint="all /app routes — clickable">
          <RoutesTree />
        </Section>

        <Disclosure id="agentic-os.clients" label="Clients" hint="active retainers + prospects">
          <ClientsTab />
        </Disclosure>

        <Disclosure
          id="agentic-os.gates"
          label="Gates"
          hint="guardrail registry — severity, fixture, owner"
        >
          <ValidatorsTab />
        </Disclosure>
      </Stack>
    </Page>
  );
}

function Section({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <Stack as="section" direction="column" gap="px8">
      <Stack
        direction="row"
        align="center"
        justify="space-between"
        gap="px8"
        style={{
          paddingBottom: hds.space.px4,
          borderBottom: '1px solid var(--semantic-color-border-default)',
        }}
      >
        <span style={s.sectionLabel}>{label}</span>
        {hint && <span style={s.sectionHint}>{hint}</span>}
      </Stack>
      <div style={s.sectionBody}>{children}</div>
    </Stack>
  );
}

const s = {
  sectionLabel: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  sectionHint: {
    ...hds.typeStyles.mono,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  sectionBody: {
    paddingTop: hds.space.px8,
  } as CSSProperties,
};
