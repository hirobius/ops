# North Star

> Owner: Adrian. Sessions read this and flag drift — they never edit it.
> (Adrian: rewrite freely; one page max; dated changes below.)

**Build the Hirobius web/automations agency: sign and ship paying client
sites end-to-end — lead → generated site → publish → outreach → invoice.
Infrastructure exists only in service of that.**

## The scope test (apply to every new ask)

> Does this get a paying client site shipped sooner?

- **Yes** → proceed.
- **Indirectly** (tooling that removes a proven, recurring bottleneck) →
  proceed, smallest version first.
- **No / someday** → park it: file an issue, don't build it. Say so out loud:
  _"North-star drift: this adds infrastructure beyond the star — park or
  proceed?"_

## Current commitments in service of the star (keep this list ≤5)

1. First real lead → generate → render run (Access Tech campaign).
2. Outreach v1 (cold email + follow-up, approve-every-send).
3. Astro cutover (publish path = billing event).
4. Fleet hub (only the pieces that reduce Adrian-as-bottleneck).
5. Take money: Stripe (ops#200). Buy, don't build.

**Build vs buy:** build only `ClientConfig` + the lead → site pipeline; for
the rest, buy a mature tool (prefer one with an MCP server) or thin-wrap it.

**Design system:** HDS is the one design system; every surface moves onto it
in small slices, never blocking a client site.

## Change log

- 2026-07-02: Initial statement (drafted in delegation interview, accepted).
- 2026-09-25: +5, build-vs-buy, HDS (Adrian, one-off edit).
