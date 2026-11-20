# Frog Pond Boys 0.24.0

Prepared November 20, 2026. Local release candidate; not deployed. The last confirmed live revision is 4c3d473 (0.23.1).

Version B has a new layout on the home page and all inner pages: outlined headings, frog panels, tongue menus, a full-width pond and lily-pad television links. Existing Pond Desk text and content feed both designs. Version A changes only its phone frog menu, which now uses a tongue and winged links with 44-pixel touch targets.

In Pond Desk, choose The site > Home titles & text, and Croak > Background of the site (version B). Select Standard or Cream, then Publish to the site. The choice applies to all B pages and leaves A unchanged. Restoring a previous site version restores its published background without replacing the current draft. Existing publications with no choice use Standard. Screen messages remain optional and limited to 14 visible characters, including spaces.

Independent review passed 300 tests with PostgreSQL 17, none skipped. Actual A/B builds covered an absent choice, Standard and Cream. All 26 A pages matched the previous version byte for byte outside the authorized phone-menu stylesheet. All 26 B pages reflected their selected background. Browser checks covered 78 pages, 20 keyboard/touch menu scenarios, reduced motion and real Desk publication/restoration. The immutable delivery report records the remaining build, archive and PDF checks. Dependency audit reported no known advisories on November 20; this is not a guarantee of complete security.

Render was checked before preparation: Starter service, the original Basic-256mb database with no expiration, and a matching internal database connection. An authenticated T16 backup was restored locally and compared with read-only live data. Stored files and retained historical snapshots were preserved. Recent structure publications and normal history retention explain the observed differences. No migration, new account or additional charge was needed. Current HTTP checks passed. The precise email-reported restart could not be matched to a provider event; see HOSTING-STATUS.md.

Deploy the frontend and server together only after written approval of the exact release and a fresh, restored-and-verified encrypted backup. Once a publication contains home.look, the older 0.23.1 parser is not a compatible rollback target, even after selecting Standard. Keep compatible server code and preserve newer owner data; do not restore an old database merely to roll back the website. See B-BACKGROUND.md.

Forms and email notifications remain disabled. Live B V3 and the phone menu still need post-deployment checks with the owners' actual content. The owners already confirmed Save/Publish on the previous live release; that acceptance is not being requested again as an unmet prerequisite. Historical release notes remain dated records.
