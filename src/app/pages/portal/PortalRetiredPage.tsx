/* hds-bypass: standalone public-facing surface; no HDS sidebar/TOC chrome. The
   page renders inside the HDS shell to satisfy layout-integrity coverage but
   uses minimal chrome — Page + Stack + the shared HDS primitives Adrian's
   CLAUDE.md mandates.
*/

/**
 * PortalRetiredPage — successor to the retired `/c/:slug` client portal.
 *
 * The in-ops client portal (live-preview iframe + milestones + feedback stub,
 * HMAC token gate via `/api/portal-verify`) was retired once client portals
 * moved to the portal-kit system (`hirobius/portal-kit`), where each client
 * gets its own password-gated deployment (e.g. lilac → lilac-insure.vercel.app).
 *
 * This slug-agnostic notice catches any link previously handed to a client
 * (`/c/<slug>?token=…`) and points them at their current portal without a bare
 * 404. It deliberately does NOT read the client registry or echo the slug —
 * the same privacy posture the old token gate held.
 *
 * See docs/ARCHITECTURE.md row ⑤ and the DONE-LOG retirement entry.
 */

import { Page, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

export default function PortalRetiredPage() {
  return (
    <Page maxWidth="content" paddingY="default">
      <Stack gap="spacious">
        <h1
          style={{
            ...hds.typeStyles.h2,
            color: 'var(--semantic-color-content-primary)',
            margin: 0,
          }}
        >
          This portal has moved
        </h1>
        <p
          style={{
            ...hds.typeStyles.body,
            color: 'var(--semantic-color-content-secondary)',
            margin: 0,
          }}
        >
          Your Hirobius engagement portal now lives at its own address. If you have not received
          your new link, contact your Hirobius point of contact and we will send it over.
        </p>
      </Stack>
    </Page>
  );
}
