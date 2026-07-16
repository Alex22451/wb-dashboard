# Blanket Category Mapping Report

Date: 2026-07-16

## Result

- Added a specific WB mapping for `Пледы для животных` before the broader
  `Пледы` rule, preventing animal blankets from being counted as regular blankets.
- Kept regular `Пледы` mapping independent of entrepreneur or brand, so it applies
  automatically to every mapped entrepreneur where WB returns that subject.
- Updated both the shared dashboard mapping and the WB-to-Excel comparison mapping.
- Advanced daily and report cache versions so previously cached category results
  do not preserve the old mapping.
- WB API keys and entrepreneur configuration were not changed.

## Verification

- Added three focused mapping tests covering the animal category, partial subject
  matching, and entrepreneur-independent regular blanket mapping.
- All 12 logic tests passed.
- ESLint, TypeScript, and the production build passed.

## Delivery

- Target branch: `main`.
- Vercel deployment is triggered automatically by the repository push.
