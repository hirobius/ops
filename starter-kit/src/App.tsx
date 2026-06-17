/**
 * HDS Starter Kit — demo page
 *
 * Imports HDS primitives from the parent package (@hirobius/design-system)
 * and renders them on a single page with a light/dark toggle.
 *
 * Theme: toggled by flipping `data-theme` and `.dark` on <html> (matching
 * the pattern in ThemeContext.tsx of the parent repo).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  HdsButton,
  HdsCard,
  HdsBadge,
  HdsTag,
  HdsDivider,
  HdsAlert,
  HdsInput,
} from '@hirobius/design-system';
import { Moon, Sun, Layers } from 'lucide-react';

// ── Theme helpers ─────────────────────────────────────────────────────────────

function getInitialDark(): boolean {
  try {
    const stored = localStorage.getItem('hds-starter-theme');
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function applyTheme(dark: boolean) {
  const html = document.documentElement;
  if (dark) {
    html.setAttribute('data-theme', 'dark');
    html.classList.add('dark');
  } else {
    html.setAttribute('data-theme', 'light');
    html.classList.remove('dark');
  }
  try {
    localStorage.setItem('hds-starter-theme', dark ? 'dark' : 'light');
  } catch {}
}

// ── App ───────────────────────────────────────────────────────────────────────

export function App() {
  const [isDark, setIsDark] = useState<boolean>(getInitialDark);

  // Apply theme on mount and on change
  useEffect(() => {
    applyTheme(isDark);
  }, [isDark]);

  const toggleTheme = useCallback(() => setIsDark((prev) => !prev), []);

  // Tag filter demo state
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set(['React']));
  const toggleTag = (tag: string) =>
    setActiveTags((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });

  // Input demo state
  const [inputValue, setInputValue] = useState('');

  const tags = ['React', 'TypeScript', 'Vite', 'Tailwind', 'CSS'];

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--semantic-color-surface-page)',
        color: 'var(--semantic-color-content-primary)',
        fontFamily: 'var(--hds-font-body, system-ui, sans-serif)',
        transition: 'background-color 0.3s ease, color 0.3s ease',
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 32px',
          borderBottom: '1px solid var(--semantic-color-border-default)',
          backgroundColor: 'var(--semantic-color-surface-raised)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Layers size={20} style={{ color: 'var(--semantic-color-brand-primary, var(--hds-color-brand-500, #6366f1))' }} />
          <span style={{ fontWeight: 600, fontSize: '16px', letterSpacing: '-0.01em' }}>
            HDS Starter Kit
          </span>
          <HdsBadge tone="info">demo</HdsBadge>
        </div>

        <HdsButton
          variant="tertiary"
          size="sm"
          iconOnly
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
          iconLeft={isDark ? <Sun size={16} /> : <Moon size={16} />}
        />
      </header>

      {/* ── Main ── */}
      <main
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          padding: '48px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '40px',
        }}
      >
        {/* Section: Intro */}
        <section>
          <h1
            style={{
              fontSize: '28px',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              margin: '0 0 8px',
              color: 'var(--semantic-color-content-primary)',
            }}
          >
            Hirobius Design System
          </h1>
          <p
            style={{
              fontSize: '15px',
              color: 'var(--semantic-color-content-secondary)',
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            External consumer demo — install{' '}
            <code style={{ fontFamily: 'var(--hds-font-mono, monospace)', fontSize: '13px' }}>
              @hirobius/design-system
            </code>{' '}
            and import components directly. Tokens flow through CSS custom properties; dark mode
            is a single attribute flip on{' '}
            <code style={{ fontFamily: 'var(--hds-font-mono, monospace)', fontSize: '13px' }}>
              &lt;html&gt;
            </code>
            .
          </p>
        </section>

        <HdsDivider />

        {/* Section: Buttons */}
        <section>
          <SectionHeading label="HdsButton" />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
            <HdsButton variant="primary">Primary</HdsButton>
            <HdsButton variant="secondary">Secondary</HdsButton>
            <HdsButton variant="tertiary">Tertiary</HdsButton>
            <HdsButton variant="primary" size="sm">Small</HdsButton>
            <HdsButton variant="secondary" size="lg">Large</HdsButton>
            <HdsButton variant="primary" loading>Loading</HdsButton>
            <HdsButton variant="secondary" disabled>Disabled</HdsButton>
          </div>
        </section>

        <HdsDivider />

        {/* Section: Badges */}
        <section>
          <SectionHeading label="HdsBadge" />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <HdsBadge tone="neutral">neutral</HdsBadge>
            <HdsBadge tone="info">info</HdsBadge>
            <HdsBadge tone="success">success</HdsBadge>
            <HdsBadge tone="warning">warning</HdsBadge>
            <HdsBadge tone="danger">danger</HdsBadge>
          </div>
        </section>

        <HdsDivider />

        {/* Section: Tags */}
        <section>
          <SectionHeading label="HdsTag" subtitle="Click to toggle active state" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {tags.map((tag) => (
              <HdsTag
                key={tag}
                active={activeTags.has(tag)}
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </HdsTag>
            ))}
          </div>
        </section>

        <HdsDivider />

        {/* Section: Input */}
        <section>
          <SectionHeading label="HdsInput" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '360px' }}>
            <HdsInput
              label="Label"
              placeholder="Default input…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
            <HdsInput
              label="Disabled"
              placeholder="Cannot edit"
              disabled
            />
            <HdsInput
              label="Error state"
              placeholder="Something went wrong"
              errorMessage="This field is required"
            />
          </div>
        </section>

        <HdsDivider />

        {/* Section: Alerts */}
        <section>
          <SectionHeading label="HdsAlert" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <HdsAlert variant="info" title="Token architecture">
              Design tokens flow from <code>hirobius.tokens.json</code> through CSS custom
              properties — no runtime theming library required.
            </HdsAlert>
            <HdsAlert variant="success">Build passed. All visual regression snapshots match.</HdsAlert>
            <HdsAlert variant="warning">A new token path was added; regenerate the manifest.</HdsAlert>
            <HdsAlert variant="error">Typecheck failed — 3 errors in 2 files.</HdsAlert>
          </div>
        </section>

        <HdsDivider />

        {/* Section: Card */}
        <section>
          <SectionHeading label="HdsCard" />
          <HdsCard padding="none" style={{ maxWidth: '360px' }}>
            <HdsCard.Header>
              <HdsCard.Title>Component card</HdsCard.Title>
              <HdsCard.Description>
                Compound-parts pattern — Header, Body, Footer compose independently.
              </HdsCard.Description>
            </HdsCard.Header>
            <HdsCard.Body>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--semantic-color-content-secondary)', lineHeight: 1.6 }}>
                All visual decisions resolve through CSS custom properties. Dark mode is handled by{' '}
                <code style={{ fontFamily: 'var(--hds-font-mono, monospace)', fontSize: '13px' }}>
                  [data-theme="dark"]
                </code>{' '}
                on{' '}
                <code style={{ fontFamily: 'var(--hds-font-mono, monospace)', fontSize: '13px' }}>
                  &lt;html&gt;
                </code>
                .
              </p>
            </HdsCard.Body>
            <HdsCard.Footer>
              <div style={{ display: 'flex', gap: '8px' }}>
                <HdsButton variant="primary" size="sm">Accept</HdsButton>
                <HdsButton variant="tertiary" size="sm">Cancel</HdsButton>
              </div>
            </HdsCard.Footer>
          </HdsCard>
        </section>

        {/* Footer */}
        <HdsDivider />
        <footer
          style={{
            fontSize: '12px',
            color: 'var(--semantic-color-content-tertiary, var(--semantic-color-content-secondary))',
            textAlign: 'center',
          }}
        >
          @hirobius/design-system — starter-kit demo
        </footer>
      </main>
    </div>
  );
}

// ── SectionHeading ─────────────────────────────────────────────────────────────

function SectionHeading({ label, subtitle }: { label: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <h2
        style={{
          fontSize: '13px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--semantic-color-content-secondary)',
          margin: 0,
        }}
      >
        {label}
      </h2>
      {subtitle && (
        <p
          style={{
            fontSize: '12px',
            color: 'var(--semantic-color-content-tertiary, var(--semantic-color-content-secondary))',
            margin: '2px 0 0',
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
