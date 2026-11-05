# Weekly analytics recovery

Risk R2. User requires complete weekly FBS/FBO; partial reporting remains forbidden.
Baseline / rollback:366b10b69afa66af350d56ca25de7ac5424947b1.

OBSERVED production Oct29-Nov4 all7: client stopped at Oct31 with seller5 fulfillment incomplete, while Nov1-3 had21 missing cache partitions. Manual retry of Oct31 seller5 subsequently returned complete, no errors. Cache rebuild follows earlier sticker mapping version change. Root cause in loader: first transient failure terminates remaining plan, and returnError uses120s success cache TTL.

Change: retain failed fulfillment results for60s (preserve dedup and click burst protection); client retries explicitly transient500/502/503/504 or existing upstream network warnings after65s, at most3 total attempts. Retry only reported failed selected seller IDs. No automatic retry for auth, unknown/mismatch or throttling without retry metadata. Cancellation checked during wait. Every attempt updates pacing timestamp. Final whole-range complete cache reread remains mandatory before UI commits data. No calculations, API credentials, DB schema or cache namespace changes/deletion.

Root implemented. Independent reviewer weekly_recovery_review. Commands: npm run test:unit; npm run build; git diff --check. Focused async tests cover transient success, subset IDs, TTL expiry, cap, cancellation, permanent and unexplained incomplete errors. Production smoke and release pending.
