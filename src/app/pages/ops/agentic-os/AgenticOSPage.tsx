/* hds-bypass: ops-internal page */

/**
 * AgenticOSPage — `/ops` index. The "is the system OK and what's happening
 * right now?" surface. Mobile-first; every metric reads truth from a
 * checked-in source; every button calls a real script via the dev-only
 * skill-runner endpoint.
 *
 * Surface flow (top → bottom):
 *   1. PageHeader        locked-down chrome (Clash anchor + divider)
 *   2. SurfacesRail      Atlas + Kanban inline jump-tiles
 *   3. StatusBanner      one-line triage (errors > stale > healthy)
 *   4. KpiCards          live metrics — active · cost · errors
 *   5. PillarRail        BUILD / GROW / RUN distribution + filter chips
 *   6. LanesGrid         workstreams (outline-light list)
 *   7. Routes            (atlas import) — interactive route tree
 *   8. Clients           (atlas import) — registry card grid
 *   9. Gates             (atlas import) — guardrail validators table
 *  10. Knowledge         (atlas import) — BUILD/GROW/RUN pillar summaries
 *  11. Skills            (collapsed) — whitelisted scripts grouped Build/Ops/Knowledge
 *  12. New skill         (collapsed) — capture-only seam; appends to proposed-skills.jsonl
 *  13. StrengthFooter    Score A/B + --json compliance bar
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
import { StatusBanner } from './StatusBanner';
import { KpiCards } from './KpiCards';
import { PillarRail, type PillarFilter } from './PillarRail';
import { SurfacesRail } from './SurfacesRail';
import { SkillsBar } from './SkillsBar';
import { SkillCreatorForm } from './SkillCreatorForm';
import { PluginsBar } from './PluginsBar';
import { ResearchBar } from './ResearchBar';
import { ServicesBar } from './ServicesBar';
import { computeTriage, UNITS } from './data';

/** @public */
export default function AgenticOSPage() {
  const triage = useMemo(() => computeTriage(), []);
  const [pillarFilter, setPillarFilter] = useState<PillarFilter>(null);

  const filteredUnits = useMemo(() => {
    if (pillarFilter === null) return UNITS;
    if (pillarFilter === 'UNCLASSIFIED') return UNITS.filter((u) => !u.pillar);
    return UNITS.filter((u) => u.pillar === pillarFilter);
  }, [pillarFilter]);

  return (
    <Page>
      <Stack direction="column" gap="px40">
        <PageHeader breadcrumbs={[{ label: 'Ops' }]} title="Ops" />

        <SurfacesRail />

        <StrengthTab />

        <StatusBanner triage={triage} />

        <KpiCards triage={triage} units={filteredUnits} />

        <PillarRail units={UNITS} filter={pillarFilter} onFilterChange={setPillarFilter} />

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
