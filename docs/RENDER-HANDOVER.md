# Render handover - implementation and production verification

Version 0.23.0 introduced a published-only startup mode. Version 0.23.1 was deployed and observed on Render on November 19, 2026; the implementation notes below were originally prepared November 17. Keep the existing `/livez` health path and one writer instance; no new account, plan, DNS entry or environment secret is required.

## Why the former startup interrupted traffic

The old process holds the PostgreSQL advisory lock for its lifetime. Previously the new listener returned 200 at `/livez` before acquiring that lock or building any pages. Render could route visitors to this listener, which returned 503 for the site. Render documents switching traffic after the new instance is healthy, then stopping the old one after 60 seconds. Waiting for full write readiness before passing that probe creates a circular wait. Increasing the lock timeout alone does not fix this ordering. See [deployment sequence](https://render.com/docs/deploys#zero-downtime-deploys) and [health checks](https://render.com/docs/health-checks), checked November 17, 2026.

## Implemented sequence

1. Listen with 503, including health probes. Attempt to acquire the existing writer lock.
2. If another writer owns it, open a separate PostgreSQL connection with read-only transactions. Fetch only the last committed public snapshot, its image pool and checked public-file metadata. Do not initialize editor state, run migrations, send mail or write sessions through this connection.
3. Build both configured variants from that snapshot. Only after a current build exists does `/livez` return 200. Public host gates, HTTPS, script hashes, private-preview Access verification and file authorization stay in force. Desk and all writes remain unavailable with 503/Retry-After; anonymous Desk remains 403. `/healthz` stays 503 until the writer is ready.
4. While waiting for the writer, check the publication identity. A new draft alone does not revoke the preview. A newly committed publication does: do not serve stale pages or revoked files; rebuild it before serving public content again. Only immutable, checked file IDs referenced by the installed public snapshot can be served.
5. Acquire the existing writer lock without stealing it. Reload the latest state, run the normal migrations and builds, and save durably. Only then replace the HTTP handler and allow Desk operations. The last write drained by the old process is included. Revision fencing is unchanged.
6. Close the read-only connection. SIGTERM is handled during startup as well as normal operation. Shutdown stops accepting new work and drains existing operations before closing the writer. A startup failure closes its listener and connections; it never pretends to be write-ready.

The lock-wait budget is five minutes, checked between attempts; individual database/build commands retain their own bounds. Events `pond_writer_wait`, `pond_public_ready`, `pond_writer_acquired`, `pond_ready` and `pond_stopping` expose elapsed time without data or credentials. Public readiness can temporarily be revoked if the old process publishes a newer snapshot.

## Local evidence and limits

Two real Node processes against PostgreSQL test reader/writer exclusion, public A/B during waiting, closed Desk/API routes, published PDF versus private draft file access, refresh after an old-instance publication, the final commit during shutdown, persistent sessions, successful editing after takeover, cancellation during waiting/building, and failure of either warm build or final reconciliation. A stale writer still cannot save after another writer changes the durable revision. Separate real builds exercise both public variants and the deployment image.

This improves the previously identified startup gap; it does not promise uninterrupted Desk access or explain every historical 502 after the ready log. An update during preparation can briefly return 503 rather than serve revoked content. A failed final rebuild after the old writer has stopped still needs a successful restart or an approved compatible rollback. Initial cold starts with no existing writer wait for the full build. Real provider routing, timing and resource usage must be observed at the next authorized rollout.

Before rollout, restore-check an encrypted backup, stop editorial publishing temporarily, and record the Render health path and deployment ID. Watch the lifecycle events plus HTTP results for A, B and private Desk. Do not infer write readiness from `/livez`. Do not roll back to an older parser that rejects stored screen-message fields, including history. Never restore an old database merely to roll back application code.

## November 19 follow-up (0.23.1)

Simultaneous public readiness checks share one in-flight database query per installed publication. The answer is discarded when the query settles, including failure. Later requests query again; a rebuilt generation does not reuse an old check. No one-second success cache is used, so the existing immediate revocation behavior is preserved. Refresh and file-generation checks still use fresh reads. A 40-request test verifies sharing, immediate revocation, recovery after a rebuild and recovery after a database error.


## Production observation - November 19, rechecked November 20

The 0.23.1 deployment reached public readiness after 14.215 seconds, acquired the writer after 137.618 seconds, and became write-ready after 151.292 seconds. The recorded rollout observed 180 successful public A/B requests and 21 temporary 503 responses from Desk readiness before it became ready. This verifies that rollout, not a permanent availability guarantee. The November 20 review found no subsequent startup failure in the available logs. Generic historical nonzero-exit events cannot all be attributed to the writer lock from their timestamps alone.
