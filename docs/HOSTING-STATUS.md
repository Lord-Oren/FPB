# Hosting setup — October 29, 2026

## Prepared infrastructure

- Render web service: `frog-pond-boys`, Free, Virginia (US), Docker, one instance.
- Render PostgreSQL: `frog-pond-boys-db`, Free, PostgreSQL 17, Virginia; external connections disabled. The trial expires on November 28, 2026. Upgrade or complete a verified migration before expiration.
- Source: `Lord-Oren/FPB`, branch `migration/pond-desk`. The desired Render deployment trigger is after GitHub checks pass; the Git deployment credential connection still needs to be completed and verified. The production `main` branch and `archive/original-site` still contain the original website.
- Cloudflare Access: `Pond Desk` at `desk.frogpondboys.com`, email one-time PIN only, seven-day sessions. Only the two owner email addresses explicitly approved during setup are allowed. The Render allowlist matches Access.
- Cloudflare Worker: `frog-pond-boys-router`. Only `desk.frogpondboys.com/*` is routed to it. Both workers.dev access and preview URLs are disabled. No keep-alive schedule is configured.

## Current routing

The apex domain and `www` continue to point to the original GitHub Pages website with DNS-only records. The domain remains registered at Namecheap; authoritative DNS is now Cloudflare.

The Desk hostname uses a proxied placeholder A record (`192.0.2.1`), intercepted by its Worker route. The Worker forwards to `frog-pond-boys.onrender.com`; the origin independently verifies the Access JWT. Do not replace the placeholder with a public application server or remove Access. The placeholder deliberately has no functional fallback when the Worker route is absent.

Public mode is prepared in Render and the Worker, but no apex or www Worker route has been attached. The new public version is therefore not the website currently reached by visitors. The site hostname and Desk hostname will stay separate.

## Verification and pending acceptance

The migration passed 195 local tests, including PostgreSQL durability and access controls, and GitHub CI passed on commit `9b548da`. The initial Render deployment reports live and `/healthz` reports ready. Anonymous requests to its direct URL are rejected.

Cloudflare HTTPS now redirects unauthenticated visitors to Access when using up-to-date DNS. Google and Cloudflare resolvers return the Desk address; the setup workstation still has a stale Namecheap DNS response. Browser access must be confirmed after that cache expires or through an up-to-date resolver. A real owner must then verify email-code delivery, login, draft saving, publishing and sign-out. Never record their code or session token in Git or chat.

This new database starts from the repository snapshot. No private messages, draft history or sessions from the previous trial have been migrated. The old trial has not been changed or deleted.

## Deployment scope

Automatic deployments are not verified yet: the documentation push passed CI, but no new Render deployment appeared. Connect the owner's GitHub deployment credentials in Render, authorize `Lord-Oren/FPB`, and confirm a subsequent push deploys after checks pass. After the separately approved cutover, switch Render to `main`. Worker changes need a separate controlled upload; the application pipeline does not deploy edge routing or DNS. `hosting/wrangler.jsonc` remains a route-free preparation template to prevent accidental changes to the live site.

## Before the public cutover

Agree on the content to transfer, retain a restorable backup, complete authenticated acceptance, and approve the migration pull request. Only then merge into `main` and change public routing. Contact and Join forms remain disabled publicly; outgoing application mail and attachment scanning are not production services yet.
