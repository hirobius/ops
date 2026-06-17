# Fixtures

Fixture convention for all validator and pipeline unit tests.

## Directory layout

  fixtures/
    <unit-id>/
      <case-name>/
        input.jsx      (or input.json — match the unit's input type)
        expected.json  (the expected output from the unit under test)

## Rules

- Every Phase 2–3 unit MUST have fixtures before its code is written.
- A fixture is the definition of done for its case.
- input.jsx contains the raw JSX string the validator receives.
- expected.json contains the exact {ok, errors[]} object the validator must return.
- Case names must be lowercase-kebab and self-describing: "unknown-component", not "test1".
- Do not put real token values in fixtures — use placeholder paths like
  "semantic.color.surface.raised" and "component.button.bg".
