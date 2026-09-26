/* hds-bypass: ops-internal page */

/**
 * LibraryReportPage — `/ops/library/:slug`. Native HDS reports render as
 * components; legacy HTML reports render framed, sandboxed without same-origin
 * access so a report's scripts can never reach the ops session cookie.
 *
 * @category Internal
 * @tier utility
 */

import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';

import { Callout, Page, Stack } from '@hirobius/design-system';

import { PageHeader } from '../PageHeader';
import BuildVsBuyReport from './BuildVsBuyReport';
import PipelineWalkthroughReport from './PipelineWalkthroughReport';
import StateOfPlayReport from './StateOfPlayReport';
import { LEGACY_LOADERS, library } from './libraryData';
import { s } from './styles';

const NATIVE: Record<string, () => JSX.Element> = {
  'build-vs-buy': BuildVsBuyReport,
  'state-of-play': StateOfPlayReport,
  'pipeline-walkthrough': PipelineWalkthroughReport,
};

function LegacyFrame({ slug, title }: { slug: string; title: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    LEGACY_LOADERS[slug]?.()
      .then((h) => live && setHtml(h))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [slug]);
  if (failed) {
    return <Callout tone="danger">This report failed to load. Reload the page to retry.</Callout>;
  }
  return html === null ? (
    <p style={s.caption}>Loading…</p>
  ) : (
    <iframe title={title} srcDoc={html} sandbox="allow-scripts" style={s.frame} />
  );
}

/** @public */
export default function LibraryReportPage() {
  const { slug = '' } = useParams();
  const entry = library.find((e) => e.slug === slug);
  // Unknown slug, or an entry that lives at its own route (e.g. /ops/audit).
  if (!entry) return <Navigate to="/ops/library" replace />;
  if (entry.href) return <Navigate to={entry.href} replace />;

  const Native = NATIVE[slug];
  return (
    <Page>
      <Stack direction="column" gap="px32">
        <PageHeader
          breadcrumbs={[
            { label: 'Ops', href: '/ops' },
            { label: 'Library', href: '/ops/library' },
            { label: entry.title },
          ]}
          title={entry.title}
        />
        {Native ? (
          <Native />
        ) : (
          <Stack direction="column" gap="px12">
            <Callout tone="warning">
              Not on HDS yet — shown as its original HTML. Source: {entry.source}
            </Callout>
            <LegacyFrame slug={slug} title={entry.title} />
          </Stack>
        )}
      </Stack>
    </Page>
  );
}
