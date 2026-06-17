---
client: lilac-insure
lastUpdated: 2026-05-03
---

# Lilac Insure — Context Notes

## Relationship
Conrad Milsap is Adrian's relative. First Hirobius automation client. Relationship is warm, collaborative, casual — but professional. "Eat an elephant one bite at a time" is Conrad's operating style.

## The Core Problem (Conrad's Words)
"It's not really any just one thing. It's just a lot of little day-to-day little things that just need to... what's most important?"

The agency is at capacity for one person: 600 customers, 1,200 policies, solo operation. Conrad can't grow without automation absorbing the grunt work. He runs out of energy before running out of tasks.

## Key Insight: Conrad Doesn't Need AI Yet
Phase 1 is purely automation and infrastructure. Local/contained AI is the right framing for Phase 2+ — not because AI isn't useful, but because:
1. Privacy concerns are real (SSN, DOB, financial data)
2. The workflows are broken at the automation level before needing intelligence
3. Conrad said: "prioritize small, incremental automation steps over complex AI solutions"

When talking to Conrad about AI: frame it as "a local tool that only does 8 specific things and never talks to the internet." That resonated.

## System That Cannot Be Replaced
EZLynx is the mandatory AMS. Everything must flow through it. Design all automations around EZLynx as the hub.

## The Dream Feature (Conrad's Words)
Call ends → auto-transcription → summary + action items → note appears in EZLynx client file automatically. LightSpeed/Orbit already pulls up the client file on incoming calls. The bridge is the transcription layer.

## Biggest Time Sinks
1. Manual entry: WordPress lead → EZLynx (Zapier broken)
2. Commercial renewal submissions: re-entering all prior year data into new ACORD forms annually, for each wholesaler (RT, RPS, Burns & Wiltox)
3. Outlook inbox as task manager (pinned emails = to-do list)
4. Call notes — manual typing after every client call

## Constraints
- EZLynx: single-license ($150/month for additional user). API activation requires contacting EZLynx Support.
- Conrad wants to personally call every new lead — automation doesn't replace that call, just eliminates the data entry before it
- Privacy guardrails are non-negotiable for anything touching client PII

## Outstanding Actions (as of 2026-04-28 meeting)
- [ ] Conrad: Send EZLynx login credentials
- [ ] Conrad: Establish retainer / payment bucket
- [ ] Adrian: Create current-state workflow diagram (FigJam) — prompt already drafted in Google Doc
- [ ] Adrian: Prioritize Phase 1 task list

## Phase 1 Deliverable Language (from doc)
"The $1,500 sprint includes setup and implementation of several small but practical workflow improvements: lead intake automation, Outlook triage structure, follow-up templates, a renewal reminder prototype, tool/access review, testing, and handoff documentation."

## Brand Notes
Client has a "relatively clean visual appearance" — not heavy on design needs. Pro bono brand touchpoint scrub is an opportunity to show care and surface quick wins (Google Business Profile, email signature, DocuSign header, consistent logo). Don't pitch a rebrand — gift them a simple deck of "here's what we found, here are 3 easy fixes."

## Agentic Command Center (Conrad's Phase 3 Need)
Conrad wants his own ops visibility — like the Hirobius Discord setup, but not too tech-heavy. Web-based, mobile-friendly. Something he can glance at to see: what's happening, what needs attention, what's automated. The client portal strategy fits here — build toward this in Phase 3.

## EZLynx API (research in doc)
- REST API, JSON/XML, webhooks
- Postman collection: https://documenter.getpostman.com/view/17108315/UVXjHahb
- Key operations: create/update applicants, policies, documents; QAS for quoting; webhooks for real-time notifications
- Must contact EZLynx Support to activate API access
- Integrations: Zapier, Canopy Connect, Shape Software already documented

## The 5 Automation Service Categories (Hirobius pitch framework)
1. Speed to Lead — auto-respond/qualify leads within minutes
2. Document Processing — eliminate manual data entry from forms/invoices
3. Follow-up Nurture Sequences — multi-touch personalized sequences
4. Database Reactivation — re-engage past leads / churned customers
5. Internal Reporting & Status Notifications — auto-pull data for team visibility

Lilac Phase 1 covers #1, #2, #3. #4 and #5 are Phase 2+.
