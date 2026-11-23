# Self-service key replacement

R2: expose existing authenticated key rotation flow without changing credentials or backend authorization. User will supply replacement keys after release.

Changes: explicit replacement button, masked input, server validation errors, positive save acknowledgement, pending-submit lock, clearing secret inputs. Hide unsupported admin promotion field and reset-to-config delete control. Existing same-seller and Analytics/Statistics checks, Redis persistence and cache mapping remain unchanged.

Validation: npm run build passed; node --experimental-strip-types --test src/lib/wb-api-key.test.ts passed 10/10; git diff --check passed. Standalone tsc reported existing test typing errors (redis-cache.test.ts and wb-api-key.test.ts); Next production typecheck passed. Independent key_replacement_review: PASS, copy clarification applied.

OBSERVED: existing server persistence and validation reviewed. VERIFIED: build and key-rotation utility tests. UNVERIFIED: successful real replacement (awaiting user keys); production UI smoke pending deployment. Rollback: revert UI commit; no data migration.
