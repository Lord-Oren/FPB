# Hosting status - November 16, 2026

## Live addresses

- Public version A: https://frogpondboys.com
- www redirects to the main address: https://www.frogpondboys.com
- Private editor: https://desk.frogpondboys.com

Cloudflare manages DNS, HTTPS and the Worker routes for these three hosts. The domain remains registered at Namecheap. Some networks may temporarily retain the old DNS response after the change.

## Application and database

Render runs `frog-pond-boys` on Starter (0.5 CPU, 512 MB) Docker hosting in Virginia, with one instance. The existing `frog-pond-boys-db` PostgreSQL 17 database was upgraded in place to Basic-256mb in Virginia. External database access is disabled. Internal TLS is configured as described in DEPLOYMENT.md.

The provider reports **no database expiration date**. A private backup was created and fully decoded before the upgrade. Starter does not sleep when idle; the Worker still provides an unavailable page for transient upstream failures. No keep-alive schedule is needed. After the restart, the public home page, About and readiness returned200; www returned308 to the main address, and Desk returned302 to Cloudflare Access. Temporary502/503 responses occurred during the transition. No new authenticated owner session was tested in this check.

## Private access

Cloudflare Access permits the four explicitly approved owner/tester email addresses, using email one-time PIN only and seven-day sessions. Render verifies the signed Access token and the same email allowlist independently. The maintainer confirmed receiving a code and opening Pond Desk on the new hostname. Publication and recovery still need a complete owner acceptance test.

workers.dev access and preview URLs are disabled. Preview B has no route. The public site does not expose editor APIs, outgoing mail or working submission forms.

## Source and deployments

Migration pull request #1 was merged into `main`. Render now tracks `main` and deploys after GitHub checks pass. Automatic deployment was verified on migration commit `094adc2` before cutover. Worker routing changes require a separate controlled upload; normal application pushes deploy only the Render application.

GitHub Pages retains only a redirect to the official website. `_config.yml` excludes application source from its legacy Jekyll build. The original website source remains on `archive/original-site` at `279b88c12117941acb41f63f4f8c3b0bfc6bdc8c`.

## Data and verification

The new database started from the repository snapshot. No private messages, previous trial drafts, history or sessions were copied from the old trial, which remains intact. This cutover does not represent a private-data migration.

At the October 29 migration, 195 local tests passed, including PostgreSQL persistence and access controls. CI passed before that migration. External checks through the new Cloudflare addresses returned 200 for A, About, Contact and Join; www returned 308 to the main domain; Desk returned 302 to Access; public editor API and environment-file paths returned 404. Anonymous direct-origin and forged-token Desk requests returned 403.

## Recovery

The old GitHub IPs and www CNAME were retained underneath the Cloudflare proxy. Before restoring old public traffic, restore GitHub Pages from the archived source, then remove only the public apex/www Worker routes and switch those records to DNS only. Keep Desk protection in place. Changing source or DNS does not restore the database: use a separately verified backup for data recovery. Never delete the current database as a rollback step.

## Local integration release 0.17.0

The November 16 backend/form changes are local only. They have not changed the live application, owner allowlist, DNS or email configuration. A fresh encrypted production backup was restored to a disposable local database with exact table-content comparisons; see BACKUPS.md. Sending remains unconfigured and public forms remain closed. See RELEASE-0.17.0.md and MAIL-AND-FORMS.md before the final rollout. New CI changes have been checked locally and still require their first authorized push to run on GitHub.

## Local review release 0.18.0

The next application release remains local and awaits explicit rollout approval. It includes the reviewed editor/file controls and the version A mobile pond from the November 16 interface pass, plus stricter inbound email authentication and Word attachment parsing. A shared-inbox PostgreSQL regression test now verifies two members and rejects cross-identity session reuse. The retry API requires explicit confirmation of possible duplicate delivery.

No Render setting, DNS record, Access member, email account or production data was changed for this release. Public submissions and notifications remain disabled. The approved public Contact fallback is frogpondboys@gmail.com; this does not enable email notifications. See RELEASE-0.18.0.md.
