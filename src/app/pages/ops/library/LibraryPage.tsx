/**
 * LibraryPage — `/ops/library`. Every report and research artifact in one
 * place, each marked by whether it is built on HDS yet. The HDS count is the
 * point: migrating a legacy report flips one entry and the number moves.
 *
 * Data: docs/ai/library.json.
 *
 * @category Internal
 * @tier utility
 */

import { Link } from 'react-router';

import { Badge, Divider, Page, Stack, Text } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

import { PageHeader } from '../PageHeader';
import { entryHref, library } from './libraryData';

/** @public */
export default function LibraryPage() {
  const onHds = library.filter((e) => e.render === 'hds').length;
  return (
    <Page>
      <Stack direction="column" gap="px32">
        <PageHeader
          breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Library' }]}
          title="Library"
          lede="Every report and research artifact, newest first."
        />
        <Text variant="caption" as="p" style={{ color: 'var(--semantic-color-content-secondary)' }}>
          {onHds} of {library.length} on HDS. Legacy reports show as-is until migrated.
        </Text>
        <Stack direction="column" gap="px2">
          {library.map((e, i) => (
            <div key={e.slug}>
              {i > 0 && <Divider />}
              <Stack
                direction="row"
                gap="px12"
                align="start"
                style={{ padding: `${hds.space.px16} 0` }}
              >
                <Stack direction="column" gap="px4" style={{ minWidth: 0 }}>
                  <Stack direction="row" gap="px8" wrap="wrap" style={{ alignItems: 'baseline' }}>
                    <Link
                      to={entryHref(e)}
                      className="hds-focus"
                      style={{ textDecoration: 'none' }}
                    >
                      <Text
                        variant="body"
                        as="span"
                        style={{
                          fontWeight: hds.fontWeight.bold,
                          color: 'var(--semantic-color-content-primary)',
                        }}
                      >
                        {e.title}
                      </Text>
                    </Link>
                    <Text
                      variant="technical"
                      as="span"
                      style={{ color: 'var(--semantic-color-content-secondary)' }}
                    >
                      {e.date}
                    </Text>
                    {e.render === 'hds' ? (
                      <Badge tone="success">HDS</Badge>
                    ) : (
                      <Badge tone="warning">Not on HDS yet</Badge>
                    )}
                  </Stack>
                  <Text
                    variant="ui"
                    as="span"
                    style={{ color: 'var(--semantic-color-content-secondary)' }}
                  >
                    {e.summary}
                  </Text>
                </Stack>
              </Stack>
            </div>
          ))}
        </Stack>
      </Stack>
    </Page>
  );
}
