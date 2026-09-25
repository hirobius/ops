/* hds-bypass: ops-internal page */

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

import { Badge, Page, Stack } from '@hirobius/design-system';

import { PageHeader } from '../PageHeader';
import { entryHref, library } from './libraryData';
import { s } from './styles';

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
        <p style={s.caption}>
          {onHds} of {library.length} on HDS. Legacy reports show as-is until migrated.
        </p>
        <Stack direction="column" gap="px2">
          {library.map((e) => (
            <div key={e.slug} style={s.band}>
              <Stack direction="column" gap="px4" style={{ minWidth: 0 }}>
                <span style={s.bandHead}>
                  <Link to={entryHref(e)} className="hds-focus" style={s.bandTitle}>
                    {e.title}
                  </Link>
                  <span style={s.mono}>{e.date}</span>
                  {e.render === 'hds' ? (
                    <Badge tone="success">HDS</Badge>
                  ) : (
                    <Badge tone="warning">Not on HDS yet</Badge>
                  )}
                </span>
                <span style={s.body}>{e.summary}</span>
              </Stack>
            </div>
          ))}
        </Stack>
      </Stack>
    </Page>
  );
}
