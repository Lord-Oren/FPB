# Deployment checklist

## Reference procedure and current status

The public cutover was approved and completed on October 29, 2026. See [HOSTING-STATUS.md](HOSTING-STATUS.md) for current resources and routing. The checklist below records the preparation and cutover procedure; do not repeat provisioning on the existing account. The archived branch preserves the old source; it does not back up any application database.

## Accounts and US region

The owners should control the GitHub repository, Render and Cloudflare accounts. Invite the maintainer with the permissions needed for setup. Enter credentials directly into the providers' secret settings; do not put them in issues, commits, or chat.

1. Connect Render's GitHub integration to `Lord-Oren/FPB`. A connected Git provider is needed for automatic deploys. The prepared `render.yaml` selects the free plan and `virginia`; it does not create a service until applied. Do not apply it against the old `main` source. Use a separate temporary service connected to the migration branch for acceptance testing.
2. Reuse the client-owned `frog-pond-boys-db` Render PostgreSQL database in Virginia. Keep the web service in the same workspace and region and external database access disabled. Set its internal connection URL as `DATABASE_URL`, `DATABASE_TLS_MODE=render-internal`, and its exact internal hostname as `DATABASE_RENDER_INTERNAL_HOST`. This requires TLS with Render's self-signed certificate on its private network; certificate authenticity is not verified in this explicit mode. The application rejects this mode outside Render or for an unpinned/public hostname. External endpoints retain verified TLS by default (`verify-full`, optional `DATABASE_CA`). Use a direct connection because the app holds a session-level writer lock. The runtime creates its tables. Never point tests at the client database.
3. Create a Cloudflare Access self-hosted application for the eventual private Desk hostname. Restrict it to explicitly authorized owner/maintainer emails and email one-time passcodes only. Record the application audience and team issuer URL. Set `ACCESS_AUDIENCE`, `ACCESS_ISSUER`, and `POND_TESTER_EMAILS` on Render. Every private request is verified again by the origin.
4. The Worker configuration now contains the approved production routes; use a separate route-free configuration for future staging. Set its `RENDER_ORIGIN_HOST` to the new Render hostname. Match all four `POND_*_HOST` values and `POND_PUBLIC_SITE` between Render and the Worker. Use separate test hostnames for future staging rather than changing the live production routes.
5. Leave `POND_PUBLIC_SITE=false` during private acceptance. Protect all test hostnames with Access. Before the approved public launch, set it to `true` in both services: A and www become public, preview B returns 404, and Desk remains private. Public forms are disabled in this mode.

Cloudflare routing ultimately requires an active DNS zone. On this account, the API also rejects creation of the Desk application while the zone is pending. Prepare and review the full DNS inventory before activation; do not bypass this by weakening origin authentication. Inventory and preserve existing mail and DNS records before any future nameserver change. Do not add custom-domain routes, change nameservers, or disable the existing site during this preparation.

## Acceptance checks

- Install dependencies, pass CI, and build the Docker image.
- Check authenticated Desk access, rejection of anonymous access, saving drafts, publishing A, media, logout, and persistence across restart.
- Check the public-mode tests: anonymous A works, Desk and its APIs remain protected, www redirects to A, and preview B is unavailable.
- Review all public copy, artwork, contact details, links, and sample content with the owners.
- Contact/Join submissions, real outbound email, and PDF scanning need a separate implementation and review before being enabled publicly. Do not accept real resumes in the meantime.
- Record the selected database region and recovery procedure. A US origin/database does not guarantee all edge processing or provider metadata stays in the US.

## Existing content and backups

Do not deploy a blank database over an existing editorial workspace. Determine which published content, drafts, media, people, and settings should move. The repository carries a public snapshot only; it does not include private runtime data.

For a transfer, make an encrypted database backup outside Git, verify a restore into an isolated database, and deliberately decide whether private test messages and sessions should be discarded. Stop the old writer before connecting a new service to the same database. Run only one writer instance. The application uses a PostgreSQL advisory lock and can briefly be unavailable during a deployment handover.

## After separate approval to cut over

1. Confirm the archive branch still references the original commit and the old site is recoverable.
2. Merge the reviewed migration into `main`; connect the production service to `main` and enable deployment after checks pass. GitHub Actions runs tests; Render builds the Docker image and starts the service.
3. Apply the approved data transfer and verify the service before routing public traffic.
4. Configure the agreed Cloudflare DNS/routes and Access policies. Only now replace existing GitHub Pages routing for the public domain. Preserve mail records. Use `frogpondboys.com`, `www.frogpondboys.com`, and `desk.frogpondboys.com`; do not expose preview B.
5. Enable public mode in the origin and Worker and verify HTTPS, redirects, anonymous public pages, protected Desk, publication, and restart durability from an external browser.

## Costs and remaining latency

The templates select free services and do not authorize a paid purchase. Confirm current plan allowances in each owner's account before provisioning. Render Free can sleep when idle; waking and the first build remain slow. A paid always-on instance may be considered after measuring real use. No artificial keep-alive schedule is configured.

The current database stores one JSON state record including media/history, with a 16 MiB application limit. This is suitable for a bounded trial, not an unlimited inbox or media library. Plan separate object storage and a more granular persistence model before increasing volume.

## Free database deadline

The client trial database expires on **November 28, 2026**. Upgrade it to a paid database before that date or export and verify a restore elsewhere beforehand. The free database is a temporary trial, not permanent free storage. No paid upgrade or backup automation is included in this preparation. Keep encrypted backups outside Git and test recovery before relying on this service for production content.

Provider reference: [Render PostgreSQL connections](https://render.com/docs/postgresql-creating-connecting).
