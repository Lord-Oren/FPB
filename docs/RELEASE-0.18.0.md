# Version 0.18.0 - final local review

This release is prepared locally and has not been deployed. Public forms and email notifications remain disabled. A complete email launch still needs provider setup, a confirmed sending identity, the public verification widget and a real end-to-end acceptance test.

## Changes

- Reviewed editor updates: real delivery-state labels, file read operations inside the shared busy lock, checked attachment downloads, restoration of deleted content and optional PDF/About fields. Join accepts DOCX.
- Version A has the approved pixel pond on phone screens only. Desktop and version B remain separate. Empty project lists retain their navigation target.
- Incoming replies trust only Cloudflare’s first authentication result; appended forged results, quoted text and comments cannot grant access.
- Word attachment extraction requires UTF-8 XML and rejects alternate encodings, invalid bytes and document/entity declarations. Existing processing limits remain.
- The shared-inbox regression test signs in as two different members, verifies shared replies and rejects reuse of one member’s session under another identity.
- A reply with uncertain delivery can be retried through an authenticated API only after explicit duplicate-risk confirmation. Repeated requests return the same retry, and the original reply text is preserved. The retry button still needs frontend integration.
- Session responses include deployment (hosted/local). The older mode field remains temporarily for compatibility with access-management controls.

## Verification - November 16, 2026

231 tests passed with PostgreSQL 17, with zero failures and zero skipped tests. Checks include real published PDF/video builds, private-file access, malicious Word files, forged authentication results and retry behavior with a simulated provider. The hosted public build and four Case Study build scenarios passed. Both standalone exports contain 26 pages. Ten targeted tests passed inside the final Docker image. Syntax checks and the dependency audit passed with zero known vulnerabilities. The inbound Worker bundled successfully. Chromium checks at 390 and 1440 pixels verified A/B layout, the confirmed Contact link, closed forms and reduced motion; there was no horizontal overflow or script error. No physical-device test is claimed. No production messages were sent by these tests.

## Open items

No Resend account or sending identity is configured. Notification recipients remain unset. The owner confirmed frogpondboys@gmail.com as the public Contact fallback. The one-time migration fills only empty addresses and preserves existing custom addresses and unrelated drafts. Turnstile’s public widget and build-time key still need frontend integration. Before enabling real mail, change the review_required text to say delivery is uncertain and make the unknown-status fallback neutral; neither should assert whether a message was sent. Safe attachment downloads are available; inline private PDF viewing is not promised.

Rollout requires owner approval, a fresh encrypted live backup, deployment monitoring and a migration check preserving customer-edited records. The prior verified restoration drill is documented in BACKUPS.md; it does not replace the fresh pre-deployment backup. Real Cloudflare email routing, provider delivery, mobile-device acceptance and authenticated production Desk acceptance remain unverified for this release.
