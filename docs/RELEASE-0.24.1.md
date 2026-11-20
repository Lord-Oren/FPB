# Frog Pond Boys 0.24.1

Prepared November 20, 2026. This release supersedes the unpublished 0.24.0 candidate. The owner authorized deployment after independent review and a new archive. The preparation archive is immutable; the deployment receipt records the eventual live revision and checks.

## What changes

Version B receives the new outlined layout on the home and inner pages: frog panels, tongue menus, a full-width pond and lily-pad television links. Existing Pond Desk content feeds both designs. Version A receives only the previously approved tongue-and-fly phone menu with 44-pixel touch targets.

On any B page, visitors can select Standard or Cream in the header. The choice is applied before the page is painted and remembered in that browser, across B pages and reloads. It does not change the published content or another visitor's choice. It is no longer a Pond Desk setting. If browser storage is blocked, switching still works for the current page; without JavaScript the control is hidden and the published default is displayed. Unrecognized saved values are ignored. Version A is unaffected by the switch.

The existing server contract remains compatible: standard and cream are the only accepted values, Standard is the default for older publications, and a previously published Cream value still supplies the starting value when no browser preference exists. Old clients that omit look_bBackground preserve it. No data migration or history rewrite is introduced by this release. Screen messages remain optional and limited to 14 visible characters, including spaces.

## Independent verification

302 tests passed with PostgreSQL 17, none skipped; 114 JavaScript files passed syntax/conflict checks. Real builds covered an absent background value, Standard and Cream. All 26 A pages were byte-identical to the previous candidate in every case; all 26 B pages included the correctly scoped styles and expected starting value.

Sixteen browser scenarios used the actual hosted response and its Content Security Policy at 360, 390, 768 and 1440 pixels, covering home, cases, about and contact. Switching, reloads, page navigation, Enter/Space, pressed states and touch targets passed without script errors, horizontal overflow or server writes. Invalid storage, unavailable storage, JavaScript disabled and a legacy Cream default passed. Inline scripts use exact CSP hashes; script-src does not allow unsafe-inline. Final standalone export, archive and PDF verification are recorded in the accompanying report.

## Deployment and recovery

Deploy the frontend and compatible server together, after a fresh encrypted backup has been authenticated, restored and compared. The existing Starter server and original paid Basic-256mb database remain in Virginia. No account, DNS change or new hosting charge is included. Forms and email notifications remain disabled.

Once a publication contains home.look, the 0.23.1 parser is not a compatible rollback target. Keep compatible server code and preserve newer owner content; never replace a current database with an older backup merely to roll back the website. See B-BACKGROUND.md and HOSTING-STATUS.md. The older 0.24.0 notes and archive are historical: their Desk-based background instructions have been superseded.
