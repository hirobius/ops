/* hds-bypass: ops-internal page. Inline styles intentional for standalone ops surface. */

/**
 * AtlasPage — tabbed command center at /ops/atlas.
 *
 * Scope after the 2026-05-06 ops-index consolidation: Atlas keeps the
 * design-system-leaning surfaces (components / tokens / pipeline / strength).
 * Routes, Clients, Gates, and Knowledge moved up to the /ops index page
 * so the launchpad surfaces them directly.
 *
 * Tab state lives in window.location.hash; direct links work out of the box.
 *
 * @category Internal
 * @tier utility
 */

import { useState, useEffect } from 'react';
import {
  Page,
  Surface,
  Stack,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@hirobius/design-system';
import ComponentGraph from './atlas/component-graph';
import TokensTab from './atlas/tokens-tab';
import FoundationsTab from './atlas/foundations-tab';
import { PageHeader } from './PageHeader';

// ── Tab definitions ──────────────────────────────────────────────────────────
//
// Atlas absorbs the HDS doc surface (foundations / components catalog / tokens)
// as additional tabs. Each tab is the OPERATOR view; the canonical PUBLIC view
// for design-system docs still lives under /hds — those routes are never
// duplicated here, only linked through. See OPERATING_MAP.md for the rule.
// (Closes kanban t_ada3aa9f, 2026-05-10.)

type TabValue = 'foundations' | 'components' | 'tokens';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'foundations', label: 'Foundations' },
  { value: 'components', label: 'Components' },
  { value: 'tokens', label: 'Tokens' },
];

const VALID_TABS = new Set<string>(TABS.map((t) => t.value));

function parseHash(): TabValue {
  const hash = window.location.hash.slice(1);
  return VALID_TABS.has(hash) ? (hash as TabValue) : 'foundations';
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AtlasPage() {
  const [tab, setTab] = useState<TabValue>(() => parseHash());

  useEffect(() => {
    const onHashChange = () => setTab(parseHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function handleChange(next: string) {
    setTab(next as TabValue);
    window.location.hash = next;
  }

  return (
    <Page>
      <Stack direction="column" gap="spacious">
        <PageHeader
          breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Atlas' }]}
          title="Atlas"
          lede="Design system command center — foundations, components, tokens. Operator surface; public docs live at /hds."
        />

        <Tabs value={tab} onValueChange={handleChange}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="foundations">
            <Surface padding="component">
              <FoundationsTab />
            </Surface>
          </TabsContent>

          <TabsContent value="components">
            <Surface padding="component">
              <ComponentGraph />
            </Surface>
          </TabsContent>

          <TabsContent value="tokens">
            <Surface padding="component">
              <TokensTab />
            </Surface>
          </TabsContent>
        </Tabs>
      </Stack>
    </Page>
  );
}
