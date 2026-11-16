# Version 0.16.0 - local backend review

This is an intermediate implementation for review, not the completed public release. Deployment of the new content model remains scheduled for the final rollout.

## Implemented

- About and Contact titles and texts, preserving saved owner edits and unpublished drafts.
- Case Study thumbnail, brand logo, summary and checked PDF reference; one Legal PDF with a short introduction.
- Authenticated PDF/video uploads with a 10 MiB limit, binary storage outside the state JSON, and public access only after publication.
- PDF rendering to an image-only document (up to 100 pages). Selectable text, interactive links, signatures and accessibility tags are not retained. Word files are rejected clearly.
- MP4 H.264/AAC and WebM VP8/VP9 with Opus/Vorbis, up to 60 seconds and 4K. Files are inspected and remuxed; streaming range requests are not implemented.
- Pristine shipped example records removed; edited records retained and reported. Retired Presentations content is preserved privately, including edited records found only in older publications. Old publications are cleaned on restore.
- Publication history limited to 10 entries with shared image bytes. Restored images do not overwrite the bytes used by newer drafts.
- Server-provided public variant visibility and the 10 MiB Join attachment validation policy.

## Next integration work

Connect the new fields and uploads to the editor and public pages; finish removing old interface messages. Public Contact/Join submission and outgoing mail remain disabled until their separate integration and acceptance checks. Word intake is not available. Uploaded files have no deletion UI yet and remain private when unreferenced, so history can still restore them.

## Local requirements

Node 24, npm, PostgreSQL 17 for persistence tests, Poppler (pdfinfo/pdftoppm), FFmpeg (ffprobe/ffmpeg), and util-linux (prlimit). Install JavaScript dependencies with npm ci. The Dockerfile and CI install the file-processing tools explicitly.

Use npm test for the automated suite, npm run test:public-build for the hosted build, npm run test:case-studies-build for publication/export scenarios, and FPB_VARIANT=a or b with npm run export:client for the standalone pages. Test data remains in scripts/fixtures and must never be used as production content.

Backups must include pond_state, pond_sessions and pond_files. Upgrading hosting is separate from deploying this code.
