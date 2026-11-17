# Frog Pond Boys 0.21.0

Version B can now be public on b.frogpondboys.com while version A keeps frogpondboys.com. Both use the existing private Pond Desk and one shared set of published content. No additional account, server or database is introduced.

Public B is explicitly enabled in both routing layers. Saving retains a private draft; publishing builds both designs before installing the release. Existing B-specific fields in Pond Desk become visible when both variants are enabled. The design and existing A address are unchanged.

Pond Desk keeps its individual Access logins. Editor APIs, drafts and private attachments remain unavailable from both public hosts. Contact and Join forms and email notifications remain disabled. The old private ccgcorp.app preview is a separate environment and is not modified by this rollout.

Verification covers default A-only and private-preview configurations, public A/B routing, private Desk, rejected public API and form calls, shared publication without draft leakage, and a real public build of both designs. Database backup/restoration, browser checks and deployment results are recorded with the release delivery. Startup can still cause a temporary interruption during a Render container replacement; this release does not redesign that process.
