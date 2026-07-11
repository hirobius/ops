import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AssetImg, InlineLink, Stack, Text } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

// Ported from @hirobius/design-system's InfoPage (present through ^0.11, removed
// in 0.12 — portfolio-branding content, out of scope for the shared package).
// Kept local since /info is a real, tested ops route (adrianmilsap.com/info).

const TRANSITION =
  'opacity 400ms ease-in-out, transform 400ms ease-in-out, max-width 400ms ease-in-out, top 400ms ease-in-out, left 400ms ease-in-out';

const PAGE_WRAPPER_STYLE: CSSProperties = {
  paddingTop: hds.space.px40,
  width: '100%',
  maxWidth: 'var(--semantic-layout-width-content)',
  marginLeft: 'auto',
  marginRight: 'auto',
  boxSizing: 'border-box',
};

const IMAGE_BUTTON_BASE: CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  margin: 0,
  display: 'block',
};

export default function InfoPageWrapper() {
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  useEffect(() => {
    if (textRef.current) textRef.current.inert = expanded;
  }, [expanded]);

  const fadeStyle: CSSProperties = {
    opacity: expanded ? 0 : 1,
    pointerEvents: expanded ? 'none' : 'auto',
    transition: TRANSITION,
  };

  const imageButtonStyle: CSSProperties = expanded
    ? {
        ...IMAGE_BUTTON_BASE,
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(90vw, 800px)',
        height: 'auto',
        aspectRatio: '1 / 1',
        maxWidth: 'min(90vw, 800px)',
        cursor: 'zoom-out',
        zIndex: hds.zIndex.modal,
        transition: TRANSITION,
      }
    : {
        ...IMAGE_BUTTON_BASE,
        position: 'relative',
        width: `calc(${hds.size[96]} * 2)`,
        height: `calc(${hds.size[96]} * 2)`,
        cursor: 'zoom-in',
        transition: TRANSITION,
      };

  return (
    <div style={PAGE_WRAPPER_STYLE}>
      <Stack gap="normal">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            gap: hds.semantic.space.layout.gap,
            flexWrap: 'wrap',
          }}
        >
          <figure
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: hds.semantic.space.subgrid.gap,
              margin: 0,
              minWidth: 0,
              flex: '0 0 auto',
            }}
          >
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse profile image' : 'Expand profile image'}
              onClick={() => setExpanded((v) => !v)}
              className="hds-focus"
              style={imageButtonStyle}
            >
              <AssetImg
                src="/assets/adrian.webp"
                alt="Adrian Milsap"
                expandable={false}
                loading="eager"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                  border: `${hds.borderWidth.default} solid var(--semantic-color-border-default)`,
                  borderRadius: hds.borderRadius[8],
                  filter: 'grayscale(100%)',
                }}
              />
            </button>
            <Text
              variant="caption"
              as="figcaption"
              className="text-secondary"
              style={{ textAlign: 'left', ...fadeStyle }}
            >
              © 2026 Adrian Milsap
            </Text>
          </figure>
          <Stack
            ref={textRef}
            gap="normal"
            style={{
              alignItems: 'flex-start',
              minWidth: 0,
              flex: '1 1 320px',
              textAlign: 'left',
              ...fadeStyle,
            }}
          >
            <Stack gap="xs" style={{ alignItems: 'flex-start' }}>
              <Text
                variant="heading3"
                as="h1"
                style={{ color: 'var(--semantic-color-content-primary)', textAlign: 'left' }}
              >
                Adrian Milsap
              </Text>
              <Text variant="ui" as="p" className="text-secondary" style={{ textAlign: 'left' }}>
                Digital Designer & Systems Architect
              </Text>
            </Stack>
            <Text
              variant="ui"
              as="p"
              className="text-secondary"
              style={{ maxWidth: '100%', textAlign: 'left' }}
            >
              Product Designer focused on design and visual systems at scale. I build modular
              libraries, frameworks and visual languages that drive efficiency and consistency
              across complex ecosystems. Currently building{' '}
              <InlineLink href="/case-studies/hirobius">Hirobius</InlineLink>, a code-first design
              system that powers this site.
            </Text>
          </Stack>
        </div>
      </Stack>
    </div>
  );
}
