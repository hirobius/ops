# Agent Context System

Lightweight ownership map for agent-facing docs.

## Canonical Owners

| Topic | Canonical file |
|---|---|
| Primary agent entrypoint | `CLAUDE.md` |
| Visual system guidance | `DESIGN.md` |
| Token governance | `TOKEN_GOVERNANCE.md` |
| Active work | `TASKS.md` |
| Audit findings | `HDS_COMPLIANCE_LOG.md` |
| Process and decisions archive | `PROCESS.md` |
| Scripts and checks | `SYSTEMS_REGISTRY.md` |
| Long-term memory | `claude-config/memory/` |

## Secondary Docs

These can summarize or point, but should not become new policy layers:

- `claude-config/CLAUDE.md`
- `README.md`
- historical plans and handoffs

## Drift Rule

If a rule matters across sessions, move it into the canonical owner for that topic instead of repeating it in multiple entry docs.
