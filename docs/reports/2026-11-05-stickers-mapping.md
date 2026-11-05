# Clothing stickers mapping

Risk: R2. Date: 2026-11-05.

User rule: all configured sellers, WB subject Декор для одежды and supplier article containing наклейки (case-insensitive) -> separate наклейки category. Other clothing decorations retain шевроны; original size grouping and FBS/FBO completeness remain.

Root implemented; stickers_review independently approved final diff. No API key, inventory, auth or database changes. Shared FBS classifier consumes the mapping and returns the new category; its mapping digest updates automatically. Comparison with Excel leaves stickers unmatched when the workbook lacks that category rather than adding to patches.

Cache namespaces are advanced for mapped server daily orders/sales and reports, and browser daily/report data. No data deletion. Historical aggregates require normal sequential reload; initial loading can take longer. Rollback point f9586a057b29ba816cbc9c5a3ce89bb6c03b71b3.

VERIFIED: mapping29/29; unit suite132/132 before last added classifier test; independent mapping+cache57/57; git diff --check. Commands: node --experimental-strip-types --test src/lib/wb-mapping.test.ts; npm run test:unit; npm run build. Initial production build passed. Standalone tsc --noEmit reports pre-existing test typing failures in unchanged redis-cache.test.ts and wb-api-key.test.ts; app build type check passed. Final release build/check pending.

Branch codex/stickers-nov5. Deployment and live smoke pending; no production claim yet.
