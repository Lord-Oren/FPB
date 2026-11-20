# Frog Pond Boys

The Frog Pond Boys website and Pond Desk, the private content editor. Version A is the pixel presentation on frogpondboys.com. Version B is the modern presentation on b.frogpondboys.com. Both use the same published content and the same private Pond Desk at desk.frogpondboys.com.

Version 0.24.2 fixes version B's Recent captions and team readability on the home and About pages, in both Standard and Cream. Long captions remain fully visible on phones, tablets and desktop. Version A and the shared Pond Desk are unchanged. The original website is preserved on [`archive/original-site`](https://github.com/Lord-Oren/FPB/tree/archive/original-site). A push to main can deploy the application; publish only after the owner approves the reviewed release. See [release notes](docs/RELEASE-0.24.2.md).

## Local development

Install Node.js 24, Poppler, FFmpeg, Python 3, util-linux and DejaVu fonts (the Dockerfile installs them), then run:

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

The live setup uses Render Starter and PostgreSQL Basic-256mb in Virginia, plus Cloudflare routing and individual Access logins for the shared Pond Desk. See [Deployment](docs/DEPLOYMENT.md), [Configuration](.env.example), and [Migration and performance](docs/MIGRATION.md).

Dependencies are declared in `package.json` and locked in `package-lock.json`; `npm ci` installs them during CI and the Docker build. Do not commit `node_modules`, credentials, database copies, or local editor data.

CI checks pull requests and pushes to `main`. The Render template requests deployment after `main` checks pass, using the existing authorized GitHub connection. This is separate from the Publish button in Pond Desk, which rebuilds the public pages from saved editorial content.

## Current limits

The application integrates the 65-text Site wording editor and both public variants, with concurrent-edit protection, the reviewed editor and mobile version A updates, a production seed without demonstration content and migration rules that preserve edited owner content. Contact and Join remain closed pending email and verification-widget setup. Public PDF/video publication and private Join attachment processing are integrated. Incoming email authentication, Word XML validation and confirmed manual retry have regression tests. Read docs/RELEASE-0.24.2.md and docs/MAIL-AND-FORMS.md for the remaining launch requirements.

Pond Desk and its data must remain private. Never publish the editor state, sessions, incoming messages, resumes, or database backups to GitHub Pages or Git.

The Site wording backend supports 65 editable strings. The editor screen and both page designs are integrated; see [the API contract](docs/SITE-WORDING.md).

Screen messages and the opt-in operation API are described in [the integration contract](docs/SCREEN-MESSAGES-AND-PROGRESS.md). The readability fixes passed independent review with representative content at four screen widths and in both backgrounds. The owner authorized this release on November 20, 2026; deployment verification is recorded separately from the immutable preparation archive.
