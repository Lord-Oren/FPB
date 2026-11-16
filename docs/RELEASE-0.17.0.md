# Version 0.17.0 - local integration review

This release prepares the shared inbox and completes the server-side file workflow. It has not been deployed. Live mail and public submissions remain disabled pending provider setup, interface integration and owner acceptance.

## Delivered

- Individual team sign-ins share the same private conversations. Notification recipients remain unset.
- Public Contact/Join intake with explicit activation, same-origin and proxy checks, Turnstile verification, rate limits and durable save before the received response.
- Optional Join attachment and portfolio link; bounded PDF, DOCX, image and video processing. Originals and sanitized previews are private binary records outside the state JSON.
- Plain-text Resend adapter, durable outbox, bounded retries, idempotency and authenticated incoming replies. Provider latency does not block editor saves. Real provider operation remains unverified.
- Published PDF/video links now pass the real A/B export checks only when authorized by the published snapshot and checked file metadata. PDF display is inline; draft-only files remain private.
- File names/kinds/sizes returned to the editor; archived content can be restored as a private draft. Conversation removal is reversible until the retention deadline.
- Empty announcement defaults and optional About story/ethos; a Case Study with a PDF may leave context/work empty. The editor must align its validation and hide empty announcements during the next interface pass.
- Encrypted backup commands and a successful restoration drill against a fresh live snapshot. No private backup or encryption key is included in this release.
- CI adds syntax/whitespace checks and dependency audit; action versions are pinned. Astro was updated to 7.4.12 to address the previously identified advisories.

## Verification - November 16, 2026

224 automated tests passed with PostgreSQL 17, none skipped. This includes real A/B PDF/video builds, DOCX rejection/preview, mail failure limits, authenticated inbound replies, file privacy, shared inbox visibility, and concurrent edits while mail delivery waits. The hosted public build and four Case Studies build scenarios passed. Both standalone exports contain 26 pages. Dependency audit reported zero known vulnerabilities at verification time.

Docker built successfully and six file-processing/build tests passed inside the image. The email Worker bundled successfully for a browser/Worker target; this is not a Cloudflare deployment test. Four Chromium viewports (A/B at 390 and 1440 pixels) showed no horizontal overflow or script errors and kept Contact/Join closed. Full authenticated Desk and physical-device acceptance remain outstanding.

The fresh encrypted production backup restored to disposable PostgreSQL 17 with matching row counts/content hashes for both existing tables. Temporary database network access was removed. See BACKUPS.md for recovery limits and MAIL-AND-FORMS.md for configuration and operating limits.

## Required before launch

Approve and verify the sending identity, configure Resend and inbound email routing, connect Turnstile and delivery states in the interface, complete archive/file controls, then run a real visitor-to-team-and-back acceptance test. Review the rolling deployment startup/lock transition during the final rollout. Keep the current production configuration until that release is approved. The local API and synthetic tests do not demonstrate real email delivery.
