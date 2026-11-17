# Render handover - investigation, November 17, 2026

Status: open P2. No hosting configuration or startup implementation changed in 0.22.0.

The application holds a PostgreSQL advisory lock for the lifetime of its writer. The new container answers `/livez` before acquiring that lock; all other routes return 503 until initialization and the published-site rebuild finish. A second writer is rejected. The PostgreSQL integration test verifies exclusion and stale-writer fencing.

Render documents traffic switching after a new instance passes health checks, then termination of the previous instance after 60 seconds. This ordering conflicts with waiting for the old writer to release its lifetime lock before declaring full readiness. See [deployment sequence](https://render.com/docs/deploys#zero-downtime-deploys) and [health checks](https://render.com/docs/health-checks), checked November 17, 2026.

This explains why traffic can reach the startup-only 503 handler. It does not establish the cause of every historical 502, particularly responses observed after the ready log. The previous rollout also recorded a lock wait reaching its timeout; no current live reproduction or new rollout was attempted in this review.

Changing only `/livez` to `/healthz` risks a circular wait: the new instance needs the old writer to stop, while the platform keeps the old instance until the new one is healthy. Increasing the lock deadline alone is not an interruption-free handover fix. Neither change is included.

Proposed next backend work: serve a verified, published-only snapshot in read-only startup mode while waiting for writer ownership, then reacquire and rebuild the latest committed snapshot before enabling editor writes. Define separate read readiness and write readiness; retain authentication and stale-writer fencing. Test two processes against disposable PostgreSQL, old-instance writes during preparation, lock transfer, SIGTERM during a build, interrupted file writes and rollback without stale data. The design is a proposal, not an implemented or approved production change.

Before any authorized rollout, record the provider's health path, timestamps for listener/lock/build/ready/shutdown, deployment ID and HTTP results without secrets. Keep a verified backup and inspect both A and B plus Desk after the switch. Do not claim that an alive process proves a working website.
