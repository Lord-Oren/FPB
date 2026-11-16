# 0.20.0 - local release review

Site wording now offers 66 editable texts grouped by page in Pond Desk. Save keeps a private draft; Publish updates both supported variants. Each field shows its original text and can be reset by leaving it empty. Public output uses escaped text, including dynamic form and motion messages. Existing page titles and editorial settings retain their own controls.

A concurrent-edit defect found during review has been corrected: after publication, the screen retains the revision matching its displayed fields. A later save from another member is rejected as a conflict instead of being silently overwritten. The user's inputs remain available. Single-line validation also rejects Unicode line and paragraph separators before trimming.

This release includes the previously reviewed editor delivery labels and retry confirmation, social-link accessibility, the phone-only version A emblem and shoreline, hosted favicon and startup/HTTP reliability changes. It does not claim to identify the cause of the earlier hosting interruption.

Verification: 247 tests with PostgreSQL 17, eight targeted Docker tests, syntax checks for 94 JavaScript files, no known dependency vulnerabilities at review time, public and Case Study builds, 52 standalone HTML previews, Chromium at 390 and 1440 pixels. Local Desk checks exercise actual A/B builds, private Save, Publish, failed-build preservation, conflict handling, Unicode field diagnostics and keyboard reset. They are not owner acceptance of the authenticated live editor.

Prepared locally for owner approval. The live deployment remains 0.18.0 until the reviewed commit is explicitly approved and pushed. Forms, actual email delivery and notifications remain disabled. Contact displays frogpondboys@gmail.com. A current browser check did not reproduce Cloudflare analytics injection or a script error; no Cloudflare setting or CSP was changed.

See SITE-WORDING.md for the data contract and HOSTING-STATUS.md for deployment boundaries.
