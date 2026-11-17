# Version 0.23.0 - client feedback and server handover

Local review release, November 17, 2026. Not deployed and not yet approved for rollout. It includes the previously unshipped 0.22.0 work plus the subsequent interface updates. The last confirmed live release is 0.21.0.

## Included

- Optional screen messages, up to 14 visible characters including spaces; server validation, private drafts and shared A/B publication. Screen fitting fixes and actual server progress are connected to Pond Desk, including processed PDF page counts and lost-response guidance.
- Client feedback: footer artwork and URL-based social icons, alphabetical screens, the simpler Contact page, updated phone pond, team-photo controls and Magazine content included in Photography.
- The default team title is The Frogs. A one-time migration replaces only the stored former default Our Team; custom titles remain intact. Fields and published versions are handled separately, and changed draft revisions invalidate stale edit sessions.
- 65 editable wording strings. The unused Contact email label is retired with compatibility for older snapshots. Legacy history remains readable and is not rewritten by this migration.
- The canonical footer Legal link and Magazine menu entry start hidden, without deleting either page, content or address. Owners can turn them back on in Site layout; later deliberate edits are not overwritten at restart.
- About publication errors identify a missing role/name or an unavailable photo. A draft may remain incomplete. Team pictures use the existing checked image pipeline and are embedded in generated pages; they are not separate public file URLs.
- A published-only startup mode reduces the known Render handover gap. It preserves the single writer lock, latest-state reconciliation and private routes. See RENDER-HANDOVER.md.

## Review still required

The editor can still accept an empty-but-valid JSON success body as confirmation, and a done job without its required result. This reproduced interface issue must be fixed and rechecked before approving the bundle.

The new server handover needs independent review and observation during an authorized Render rollout. Human live Save/Publish acceptance is still separate from the earlier successful login. Forms, outbound notifications and incoming mail remain closed pending their own configuration and approval.

## Upgrade and rollback

Take an encrypted database backup and verify a restore before any approved push. Deploy the server and interface together. Migrations preserve private drafts, customized titles and uploaded content. They hide links without deleting records. Historical screen messages require a compatible parser; clearing only the current message does not make a rollback to 0.21.0 safe. Preserve data and use a compatible application rollback.

Tests and browser evidence for this exact package are listed in its verification report and manifest. No production database migration, DNS change or new supplier cost is included in this local review.
