# Frog Pond Boys

The Frog Pond Boys website and Pond Desk, the private content editor. Version A is the pixel presentation selected for the public website. Version B remains available for local review.

This branch prepares a migration. The original website is preserved on [`archive/original-site`](https://github.com/Lord-Oren/FPB/tree/archive/original-site). Do not merge until the [deployment checklist](docs/DEPLOYMENT.md) is complete. No domain or live hosting change is made by this branch.

## Local development

Install Node.js 24 and Poppler (`poppler-utils` on Debian/Ubuntu; used to validate PDF attachments), then run:

```sh
npm ci
npm run dev:a
# In a second terminal:
npm run dev:editor
```

Open `http://127.0.0.1:4321` for the website and `http://127.0.0.1:4323/v2/` for Pond Desk. Local data stays in `.local-editor/`, outside Git. Local email is simulated. Use fictional submissions only.

```sh
npm test
npm run test:case-studies-build
FPB_VARIANT=a npm run export:client
```

The static website is exported to `exports/`. GitHub Pages can serve that export, but cannot run Pond Desk, its database, or its publication service. Do not configure Pages to publish this source repository as an application.

## Hosting

The proposed setup is a Node service on Render in Virginia, PostgreSQL in the US, and Cloudflare routing and Access for Pond Desk. See [Deployment](docs/DEPLOYMENT.md), [Configuration](.env.example), and [Migration and performance](docs/MIGRATION.md).

Dependencies are declared in `package.json` and locked in `package-lock.json`; `npm ci` installs them during CI and the Docker build. Do not commit `node_modules`, credentials, database copies, or local editor data.

CI checks pull requests and pushes to `main`. The Render template requests deployment after `main` checks pass, once the owners connect and provision the service. This is separate from the Publish button in Pond Desk, which rebuilds the public pages from saved editorial content.

## Current limits

The repository contains sample public content. Review it before launch. The initial public configuration serves version A with Contact and Join submission disabled. Email replies and notifications are simulated; uploaded PDFs remain quarantined until a scanning service is connected. Hosting configuration alone does not complete these features.

Pond Desk and its data must remain private. Never publish the editor state, sessions, incoming messages, resumes, or database backups to GitHub Pages or Git.
