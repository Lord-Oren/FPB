# Screen messages and operation progress

Version 0.23.0, local integration review. Not deployed.

## Screen messages

In Pond Desk, choose The site, then a section under Lily-pad screens. Screen message is optional. Save draft changes only the private structure; Save and publish builds A and B from one snapshot. The legacy arrow stays when no message is set.

`structure.nodes[].message` is plain text, trimmed at both ends, at most 14 grapheme clusters including internal spaces. Node 24 uses `Intl.Segmenter('en', {granularity: 'grapheme'})`; an emoji sequence or combining accent counts as one visible character. Validation rejects C0 controls, DEL, line separators U+2028/U+2029 and bidi controls U+202A..U+202E/U+2066..U+2069. Markup is displayed as text, never interpreted. Non-empty messages are allowed only in the inherited `screens` zone. Errors return HTTP 422 with `code: invalid_screen_message` and `diagnostics: [{field: 'message', message: ...}]`.

Missing and empty messages normalize to an absent key. Existing snapshots and older drafts need no value migration. The interface fitting fixes were checked with wide letters, emoji and family sequences in both designs, including the former 800 x 600 failure. This is measured viewport coverage, not a guarantee for every font or browser.

## Opt-in server progress

Existing synchronous requests keep their status and response shape. To track a long operation, send `Prefer: respond-async` to one of these POST routes under `/api/v2`:

- `/structure/publish`, `/items/:id/publish`, `/pages/:slug/publish` (including wording).
- `/publishes/:id/restore`.
- `/files` (PDF or video).

After authentication and request parsing, the server returns HTTP 202, `Preference-Applied: respond-async`, and `{job: {id}}`. This acknowledges acceptance, not success. `GET /api/v2/jobs/:id` uses the same authenticated editor session as the initiating request. Other sessions receive 404; missing/expired authentication receives 403. Polling does not extend a session. Job reads bypass the mutation queue and expose no private session identifier.

The response contains `id`, `state` (`running`, `done`, `failed`), `message` and `steps` with `id`, `label`, `state` (`waiting`, `running`, `done`, `failed`). File processing may include integer `done`/`total` page counts. A completed job also includes `result`, exactly the successful synchronous operation's result. A failed job includes `error: {step, status, message, code?, diagnostics?}`. Never interpret HTTP 200 from polling as operation success: inspect `state`.

Publication stages are `content`, `build-a`, `check-a`, `build-b`, `check-b`, `install`. Only configured variants appear. These represent content validation, each real build and validation, then installation and durable history save. The last stage completes only after the write and session context succeed. A/B still install atomically. Failed builds retain the previously published snapshot.

File stages are `format`, `processing`, `saving`. PDF rendering starts without a percentage; actual completed, re-encoded pages then report counts. Video processing stays indeterminate. Reading and uploading bytes are still browser stages. There is no timer-based simulated progress.

All mutations retain the existing single queue. A queued job is running with waiting steps until its work begins. At most 32 jobs are retained per process. Completed jobs expire after ten minutes; running jobs do not expire. At capacity an async request receives 429 before being queued. Poll about once per second, then every three seconds; stop on a terminal state, navigation, or a lost session. A process restart clears all jobs.

On a lost response, 404 after restart/expiry, interrupted poll, or malformed response, the outcome is unknown. Do not claim Done, do not claim nothing was added, and do not automatically retry a write. For publication, consult Settings / Site history; for uploads, inspect files before retrying. This is progress tracking, not an idempotency or durable task API.

The bundled Desk now requests asynchronous publications and PDF/video checks, follows the server steps and handles lost or unreadable replies as unknown. The shared Save/Publish/upload lock is retained. One remaining review issue: syntactically valid but incomplete success bodies (for example an empty object), and a done job missing its result, still need stricter interface validation before rollout.

## Deployment order and rollback

1. Review and complete the frontend fixes. Back up and restore-test the live database before any authorized deployment.
2. Deploy a complete build containing the message-aware parser before allowing messages to be saved. This source bundles frontend and backend; never deploy the frontend alone against 0.21.0.
3. Check the active commit, database startup, A/B output, Desk login and a controlled save/publication. Never mark a rollout complete from `/livez` alone.

Do not roll back to an unmodified server at or below 0.21.0 after storing messages. Its strict parser rejects the new key in persisted snapshots. Clearing today's text does not remove keys from older publication history or all stored drafts. Prefer rolling back the UI while retaining this compatible parser, with a tested full build. A full restore of an older database loses subsequent edits and needs separate approval. No automatic history erasure, message-stripping migration or live database restore is included here.
