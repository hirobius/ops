# Heal History

Project memory for failed audits and smoke tests that required a self-heal pass.

Add one entry per resolved failure with:

- timestamp
- route or surface
- failing audit or smoke signal
- fix applied

## 2026-04-24 07:36:43Z

- timestamp: `2026-04-24 07:36:43Z`
- route or surface: `Phase 11 verification loop and component documentation tables`
- failing audit or smoke signal: `The first accessibility hard-stop pass failed because the self-heal script launched multiple Playwright suites against the same local port in parallel, and the component property/token tables then surfaced serious axe violations for scrollable regions that were not keyboard-focusable.`
- fix applied: `Serialized the static self-heal checks so Playwright owns its server lifecycle cleanly, then updated Table so its scrollable HdsSurface wrapper is a focusable region with an accessible label. Re-ran heal, heal:smoke, and the accessibility suite to green.`
