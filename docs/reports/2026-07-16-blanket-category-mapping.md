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

## Post-deployment warmup

- Confirmed that commit `c85080f` completed its production deployment.
- Warmed the new daily orders cache for `2026-07-09` through `2026-07-15`
  across nine configured WB cabinets, using 61-second spacing between dates.
- Burago and the other available cabinets completed without mapping errors.
- WB continued to rate-limit the Altukhova cabinet; its missing daily data was not
  replaced with stale values or zeroes.
- Confirmed that the warmup path applies category mapping to configured admin
  entrepreneurs and writes the same cache variant read by the daily report.
