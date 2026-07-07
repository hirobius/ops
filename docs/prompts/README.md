# Hirobius Prompt Library

Reusable prompts for generating marketing copy for Hirobius — a Washington
web-design studio that finds local trade businesses with strong reputations
and weak (or no) web presence, builds them a free spec/demo site, and
cold-outreaches with the preview link.

## How the pipeline uses these

1. Scraper scores WA trade businesses (lead_score, build_score, site_quality_score).
2. We build a spec site for the winners → **`spec-site-copy.md`** writes the demo site's copy.
3. We email the owner with the preview link → **`cold-outreach.md`** writes the email + follow-ups.
4. For retained clients (currently Concrete Creations) → **`content-repurpose.md`** turns one job story into a week of content.

## Target model: Claude Fable 5

These prompts are written for **Claude Fable 5** and lean on how it behaves:

- **It follows instructions literally and well.** Each prompt gives a concrete
  role, audience, voice spec, and pass/fail criteria — and Fable will actually
  hold to them. Don't soften the constraints; don't add "CRITICAL: YOU MUST".
- **It does worse with over-prescriptive scaffolding.** These prompts state
  the goal and the bar, show worked examples, and let the model write. Resist
  the urge to add step-by-step instructions — on Fable 5 that reduces quality.
- **Fill every bracket with real lead data before pasting.** Fable writes
  specific copy when given specifics ("212 Google reviews, Spokane Valley,
  excavation") and generic copy when given placeholders. Never send it
  `[business name]` unfilled.
- **Want variants?** Ask for "3 distinct takes, then your pick with one line
  of reasoning" rather than re-rolling.

## House voice (applies to all three prompts)

Warm, direct, Pacific-Northwest plainspoken. Short sentences. Contractions.
The words a contractor would use in the cab of a truck.

**Never:** "I hope this finds you well," hype, emojis, marketing jargon
("elevate," "unlock," "solutions"), or anything that insults the prospect's
business. A bad website is a fact that's costing them calls — their business
itself is always treated with respect. These owners often have hundreds of
five-star reviews; they're good at what they do. We're good at the one thing
they haven't gotten to.

## Files

| File | Generates | For |
|---|---|---|
| `cold-outreach.md` | ~90-word cold email + day-3 and day-7 follow-ups | No-site AND bad-site prospects |
| `spec-site-copy.md` | Hero headline, subhead, 3 service blurbs, About paragraph | Demo/spec sites built from Google data |
| `content-repurpose.md` | IG caption, carousel outline, short-video script, email blurb from one job story | Concrete Creations (hirobius/concrete) |
