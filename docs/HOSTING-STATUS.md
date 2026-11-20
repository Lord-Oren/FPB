# Hosting status - checked November 20, 2026

The live Render service runs 4c3d473 / 0.23.1. The Starter service (0.5 CPU / 512 MB) and original PostgreSQL Basic-256mb database are available in Virginia. The database has no expiration date and the application connection matches the provider's internal connection for that database. No replacement or migration is required. Earlier free-plan warnings do not describe the current provider state.

Read-only comparison against the authenticated and locally restored November 19 backup confirmed preserved binary files, metadata, wording and retained public snapshots. The site structure has since been published twice. The history retains ten entries; three older entries have rotated out following three new publications. Temporary database network access was closed and the original restrictions verified. No editorial data was modified by these checks.

27 HTTP checks passed: A/B public pages, redirect, closed forms, protected Desk and rejected direct/forged-token access. Historical logs on November 16-17 include POND_WRITER_BUSY startup failures. Version 0.23.1 already contains the published-only handover correction, and its November 19 rollout successfully served public pages before acquiring the writer lock. No new stop event appeared on November 19-20 in the available service events/logs. The email-reported exit at 7:03 could not be matched conclusively without its full timestamp/timezone; its exact cause and outage duration remain unverified. Do not treat generic status 1 as proof of a particular defect.

0.24.0 is prepared locally and requires separate written deployment approval. Forms and notifications stay closed. No new hosting charge, account or DNS change is included.

---

## Earlier status records (historical)

# Current routing — 0.21.0

The owner approved public A on https://frogpondboys.com, public B on https://b.frogpondboys.com, and the existing private Pond Desk on https://desk.frogpondboys.com. Version 0.21.0 implements this configuration using the existing Render Starter service and Basic-256mb database. Published content is shared; drafts and private inbox data remain protected. Forms and notifications stay closed. Earlier status entries below are historical; consult the deployment receipt for the completed rollout.

---

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

## November 16 live release and local follow-up

Commit 1b45277 (0.18.0) was approved and deployed on November 16. CI passed and Render reported the deployment live. The encrypted pre-deployment backup was restored into isolated PostgreSQL 17 and compared; the content migration removed unchanged examples and preserved edited content. Contact displays frogpondboys@gmail.com. Forms and notifications stay closed.

The first startup failed at 21:07:42 UTC and the service was ready at 21:07:59. Transient 502/503 responses were observed during rollout; subsequent HTTP checks and Chromium checks passed. The generic startup log does not identify the cause. Do not promise interruption-free upgrades with the single-writer handover.

Local 0.19.0 adds Site wording backend support, the reviewed interface changes, an icon and runtime diagnostics/connection tuning. It has not been deployed. Existing Access members, DNS, provider plans and email settings are unchanged. Human acceptance of authenticated editing/publication is still required.

## November 17, 2026 - 0.20.0 prepared locally

Site wording is integrated across Desk and both variants. The review corrected a concurrent-save overwrite and Unicode single-line validation. The existing Starter web service and Basic-256mb database remain available; the database has no expiry. Latest live deployment still points to 1b45277 / 0.18.0. Publication requires owner approval after the backup and local release checks. No DNS, Access list, analytics setting or email configuration is changed by this preparation. Forms and notifications stay closed.
