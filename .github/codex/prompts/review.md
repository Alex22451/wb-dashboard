Review this pull request independently against the repository `AGENTS.md` and
the actual diff against `main`.

Do not trust the PR description or implementer's claims. Inspect source, tests,
data contracts, and affected behavior directly. Prioritize false business data,
WB API semantics, incomplete multi-entrepreneur results, cache invalidation,
authorization, secret exposure, database integrity, regressions, and missing
logic tests.

Do not edit files. Return one JSON object that exactly matches the configured
output schema. The fields mean:

- `verdict`: `PASS`, `PASS_WITH_RISKS`, or `FAIL`. Use `PASS` only when every
  required acceptance criterion and release gate is verified, every claim has
  status `VERIFIED`, `missing_gates` is empty, and no critical/high finding exists.
- `summary`: concise independent conclusion.
- `findings`: ordered by severity with title, details, and file/line location.
- `claims`: material claims with evidence and status.
- `missing_gates`: checks or evidence that remain unavailable.

Never say production works, deployment succeeded, or WB data is complete unless
the available evidence proves that exact claim.
