# Frog Pond Boys 0.24.2

Prepared November 20, 2026. The owner authorized publication after independent review, a new archive/PDF and a fresh encrypted backup restored and compared. This preparation record precedes deployment; the deployment receipt records the live result separately.

## Readable team cards and complete Recent captions

In version B, team names and roles now use dark text on cream cards on both the home and About pages. Phone portraits keep their intended size. This works in Standard and Cream without changing the visitor background choice or the shared content in Pond Desk.

Recent cards now grow to accommodate their captions. Old fixed-height phone cards and scroll clipping no longer hide the text. Phones and tablets use a large 16:9 image and smaller 4:3 images; desktop rows grow with long titles. Images retain their proportions using cover cropping, so a portrait or panoramic source can still lose edges. Ribbit keeps its square tiles.

Version A is unchanged. The backend, dependencies, publication workflow and content model are unchanged. No data migration is introduced. Contact and Join forms and email notifications remain disabled.

## Independent checks

Before version changes, 304 tests passed with PostgreSQL 17, none skipped, and 115 JavaScript files passed syntax/conflict checks. Real seed and representative-content builds produced 26 byte-identical A pages against 0.24.1 in each case.

The representative content includes four team members, eight projects, a long name and role, a long project title, missing photos, and square, portrait, landscape and panoramic images. Sixteen browser scenarios covered home and About, Standard and Cream, at 360, 390, 768 and 1440 pixels, through the actual hosted security policy. All five Recent captions were complete; all four members were readable on both pages with minimum text contrast 15.37:1. Images loaded, Ribbit tiles stayed square, no page overflow or JavaScript/security-policy errors occurred, and all 48 menus passed keyboard opening, navigation, closing and focus return. Background selection persisted after reload. Final export/archive checks are recorded with the package.

## Delivery and recovery

The package contains exact committed source, 52 standalone seed-content HTML pages, a SHA-256 manifest and the English PDF. Synthetic test content and private owner data are excluded from the HTML and source package. Screenshots of synthetic content in the review report are explicitly labelled.

Before publishing, authenticate and restore a fresh encrypted backup into an isolated database and compare every table. After deployment, verify the real public content in both backgrounds, protected Pond Desk, closed forms and unchanged database contents. Keep the existing Starter server, Basic-256mb database and DNS configuration. No new account or hosting cost is included.

Rollback to 0.24.1 is compatible with the current content model but brings back the B readability defects. Do not use the older 0.23.1 parser for publications containing home.look, and do not overwrite newer owner content with an old backup merely to roll back code.
