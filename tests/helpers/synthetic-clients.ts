/**
 * Synthetic client records for Playwright specs that render the /ops client
 * surfaces. Real client records are read from the private client store and must
 * never be committed to this public repo, and `vite preview` has no /api/*
 * functions, so specs stub
 * GET /api/clients with these. Every value is fictitious: pseudonymous slugs,
 * example.com / example.test domains, 555-01xx numbers.
 *
 * The active client exercises every panel the dashboard, report and brand-audit
 * pages render (phases + swimlanes, checklist, goals, automations, workflows,
 * audit touchpoints); the prospect exercises the gallery's Prospects section.
 */

export const SYNTHETIC_CLIENT_SLUG = 'client-alpha';

export const SYNTHETIC_CLIENTS = [
  {
    slug: 'client-alpha',
    meta: {
      id: 'client-alpha',
      name: 'Example Agency Co',
      status: 'active',
      type: 'Independent services firm',
      engagementType: 'Automation Consulting Retainer',
      startDate: '2026-01-15',
      location: 'Springfield, ST',
      website: 'https://www.example.com',
      contact: {
        name: 'Jane Example',
        role: 'Owner',
        email: 'jane@example.com',
        phone: '555-0100',
      },
      scale: { employees: 'Small' },
      portalUrl: { prod: 'https://portal.example.test' },
      figmaFileUrl: {},
      services: ['automation', 'marketing'],
      serviceModel: 'Hirobius: software vendor — synthetic fixture',
    },
    tasks: {
      phases: [
        {
          id: 'phase-1',
          name: 'Phase 1 — Foundation',
          status: 'in-progress',
          description: 'Synthetic foundation phase.',
          budget: 1200,
          swimlanes: [
            {
              id: 'lane-1',
              name: 'Intake',
              goal: 'Route new enquiries automatically',
              tasks: [
                { id: 't-1', title: 'Map the enquiry form', status: 'done', owner: 'Adrian' },
                {
                  id: 't-2',
                  title: 'Draft the auto-reply',
                  status: 'in-progress',
                  owner: 'Adrian',
                  notes: 'Waiting on copy review.',
                },
                {
                  id: 't-3',
                  title: 'Connect the inbox',
                  status: 'blocked',
                  owner: 'Client',
                  blockedReason: 'Needs mailbox access.',
                },
              ],
            },
          ],
        },
        {
          id: 'phase-2',
          name: 'Phase 2 — Growth',
          status: 'planned',
          description: 'Synthetic follow-on phase.',
          budget: null,
          tasks: [],
        },
      ],
    },
    checklist: {
      categories: [
        {
          id: 'access',
          name: 'System Access',
          items: [
            {
              id: 'acc-1',
              item: 'Mailbox access',
              status: 'blocked',
              owner: 'Client',
              blockedReason: 'Pending admin approval.',
            },
            { id: 'acc-2', item: 'Website CMS login', status: 'done', owner: 'Client' },
          ],
        },
      ],
    },
    retainer: {
      model: 'retainer',
      description: 'Synthetic monthly retainer.',
      currentPhase: {
        phase: 'phase-1',
        status: 'active',
        currency: 'USD',
        scopedAt: 1200,
        includes: ['Intake automation'],
        excludes: [],
      },
      blockers: [],
      futureTiers: [{ tier: 'Growth', estimatedScope: '$1,500/mo', includes: ['Reporting'] }],
    },
    goals: {
      micro: [
        {
          id: 'g-1',
          goal: 'Reply to every enquiry within an hour',
          status: 'in-progress',
          metric: 'median reply time',
        },
      ],
      macro: [
        { id: 'g-2', goal: 'Double qualified enquiries', status: 'planned', horizon: '12 months' },
      ],
      aiOpportunities: [],
    },
    automationConfig: {
      client: 'client-alpha',
      mode: 'test',
      testRecipient: 'test@example.com',
      productionRecipients: [],
      systems: {
        outlook: { envKeys: ['MS_GRAPH_CLIENT_ID'], status: 'pending-access', notes: 'Synthetic.' },
      },
      llm: {
        provider: 'ollama',
        ollama: { endpoint: 'http://localhost:11434', model: 'example-model' },
      },
    },
    workflows: [
      {
        id: 'auto-responder',
        config: { id: 'auto-responder', phase: 'phase-1', systemsTouched: ['outlook'] },
      },
      {
        id: 'lead-intake',
        config: { id: 'lead-intake', phase: 'phase-1', systemsTouched: ['outlook'] },
      },
    ],
    brandAudit: {
      summary: 'Synthetic brand audit summary.',
      website: {
        url: 'https://www.example.com',
        platform: 'Example CMS',
        assessment: 'Consistent',
      },
      touchpoints: [
        {
          id: 'tp-1',
          channel: 'Website',
          url: 'https://www.example.com',
          status: 'audited',
          items: ['Logo is consistent', 'Contact page is current'],
        },
        {
          id: 'tp-2',
          channel: 'Business listing',
          url: null,
          status: 'needs-audit',
          items: ['Hours need confirming'],
        },
      ],
      quickWins: ['Update listing hours', 'Add the logo to the email signature'],
      competitorReferences: [
        { name: 'Example Competitor', url: 'https://competitor.example.test' },
      ],
      deliverable: 'Synthetic deck',
    },
  },
  {
    slug: 'client-beta',
    meta: {
      id: 'client-beta',
      name: 'Sample Prospect LLC',
      status: 'prospect',
      type: 'Trades',
      engagementType: 'Project',
      startDate: '2026-08-01',
      location: 'Shelbyville, ST',
      website: '',
      contact: { name: 'John Sample', email: 'john@example.com', phone: '555-0101' },
      scale: {},
      portalUrl: {},
      figmaFileUrl: {},
      services: ['seo'],
    },
    retainer: {
      model: 'project',
      estimatedScope: '$2,000',
      currentPhase: { phase: 'phase-1', status: 'evaluating', currency: 'USD', scopedAt: 0 },
    },
  },
] as const;
