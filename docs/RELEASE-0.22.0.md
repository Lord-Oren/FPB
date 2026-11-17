# 0.22.0 - screen message backend and measured server progress

Local integration only. The live release remains 0.21.0. Nothing in this package authorizes a deployment.

Screen messages now survive saving, publication, history restoration and restart. The server enforces the current 14-character contract with field-level errors. A and B build from the same published snapshot. Empty older data remains compatible.

Long publications and PDF/video processing can now report real internal steps through an optional, session-bound operation API. Existing synchronous requests are unchanged. See SCREEN-MESSAGES-AND-PROGRESS.md for the API, limits and rollback constraints.

Release gates remain open: the A design clips long messages in a short desktop window; the Desk must correctly report unknown outcomes after lost or malformed responses and connect server progress. Human live editing/publication acceptance is separate from automated tests. Forms and notifications remain closed. The Render handover issue remains open; no deployment health setting was changed.

The delivery manifest and review PDF record actual checks. The included standalone previews use repository seed content, not a copy of live private drafts or uploaded files. Test messages and fixtures are excluded.
