# Knowledge Base

Three pillars. Everything maps to one.

## BUILD
What Adrian makes — HDS, client deliverables, Concrete Creations product.
`docs/knowledge/build/`

## GROW  
What makes the business bigger — agency pipeline, clients, LinkedIn, YouTube, brand.
`data/knowledge/grow/`

## RUN
What keeps it working — AI infrastructure, tools, research, processes, automation.
`docs/knowledge/run/`

---

## Ingestion sources (all feed into one of the three above)
- `youtube/`     — liked/saved videos, transcripts, summaries
- `bookmarks/`   — Chrome exports, processed and tagged
- `ai-convos/`   — GPT/Gemini history, HDS-relevant only
- `intel/`       — LinkedIn AI updates, industry digest
- `inbox/`       — raw captures (Discord #inbox, self-emails, screenshots)
- `gdrive/`      — tagged Google Drive docs

## Rules
- Every file is LLM-readable markdown
- Frontmatter: `pillar`, `source`, `date`, `tags`
- Client work goes in `docs/knowledge/build/clients/<name>/` — isolated namespace
- Never mix client context with HDS context
