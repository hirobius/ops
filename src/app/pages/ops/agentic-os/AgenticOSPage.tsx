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
 *   3. Services / Skills  (collapsed disclosures)
 *   4. Gates             (atlas import) — guardrail validators table
 *
 * Routes, Clients, New skill, Plugins and Research were stripped 2026-09-27
 * (ops redesign T1 — confirmed dead by the audit).
 *
 * @category Internal
 * @tier utility
 */

import { Page, Stack } from '@hirobius/design-system';

import { PageHeader } from '../PageHeader';
import { Disclosure } from '../Disclosure';

import ValidatorsTab from '../atlas/validators-tab';
import { SurfacesRail } from './SurfacesRail';
import { SkillsBar } from './SkillsBar';
import { ServicesBar } from './ServicesBar';

/** @public */
export default function AgenticOSPage() {
  return (
    <Page>
      <Stack direction="column" gap="px40">
        <PageHeader breadcrumbs={[{ label: 'Ops' }]} title="Ops" />

        <SurfacesRail />

        <Disclosure id="agentic-os.services" label="Services" hint="local dev daemons">
          <ServicesBar />
        </Disclosure>

        <Disclosure id="agentic-os.skills" label="Skills" hint="whitelisted scripts">
          <SkillsBar />
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
