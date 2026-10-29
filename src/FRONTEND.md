# Front-end guide — Frog Pond Boys site and Pond Desk

See `../README.md` and `../docs/DEPLOYMENT.md` for development and hosting.

## Two presentations, one site

`FPB_VARIANT=a|b` selects the presentation; `src/data/presentation.js` turns it into `look`:

| Command | `look` | What it is |
| --- | --- | --- |
| `npm run dev:a` (port 4321) | `pixel` | **A — Ruben's pixel version**, the client's own identity: Ruben's pixel pack, original colours, frogs facing the pond. |
| `npm run dev:b` (port 4322) | `modern` | **B — our modern version**: Ruben's curved drawings, brand-coloured frogs, home page with content under the pond. |

Routes, data and scripts are shared. Code should test `look`, never the letters. The fly cursor is shown in both versions. It falls back to the normal cursor on touch screens, with reduced motion, and in text fields.

## Where things are

| Path | Role |
| --- | --- |
| `pages/index.astro` | Home: `Pond.astro` (A) or `PondB.astro` + `home/HomeSections.astro` (B). |
| `pages/[page].astro` | The section pages defined in `data/pages.js`. Picks a component by section: `content/Works`, `content/Events`, `content/Press`, or a single page (`pages/about`, `contact`, `join`, `case-studies`). Each page header can show an intro sentence from Pond Desk. |
| `pages/case-study-[slug].astro` | One page per published case study. |
| `components/pond/` | The pond: frogs and tongue menus, TV screens (`ScreenContent.astro`), stones, artwork library (`RubenArtwork.astro`). |
| `components/content/` | Lists for works, events and press, plus `Empty.astro` (never a blank page). |
| `components/home/HomeSections.astro` | Both versions, under the pond (pixel style in A via `home-retro-a.css`): latest work (each card opens the work itself), news, team, direct contact. |
| `layouts/SiteLayout.astro` | Page shell: fonts, styles, fly cursor, sample-content note. |
| `scripts/motion.js` + `styles/motion.css` | Motion for both versions: links to a section glide there with an eased scroll and move the keyboard focus; page changes use the browser's View Transitions (B: soft fade and lift, A: an iris opening from the click); B cards sway gently on hover, A's stones, cards and team frogs drift on their own. All of it stops under prefers-reduced-motion. `scripts/reveal.js` fades sections and cards in once. |
| `assets/pixel-pond-a.svg` | A's pixel pond (uneven shape, dithered shore). |
| `styles/` | `site.css` (A home and shared), `variant-b.css` (B home), `home-sections.css` (B under the pond), `content.css` (section pages, both skins), `interior-variants.css` (skins via `[data-skin=pixel\|modern]`), `original-artwork.css` (A pond proportions), `retro-a.css` (A interior pages: retro pixel style with Ruben's pixel frog, stones and lily, no TV frame), `home-retro-a.css` (A home: pixel pond under the TV pads and the sections below in pixel style, stepped reveal), `fly-cursor.css`. |

## Content

- **`data/site-content.json`**: everything the owners edit in Pond Desk except case studies (home announcement and Gram, section intros, works, events, press, about, contact, join, images). Pond Desk publishes it; do not edit by hand on a live site.
- **`data/site-content.js`** validates it at build time and fails the build on anything unsafe or incomplete: lengths, required fields, HTTPS links, allowed video and audio hosts, image signatures, unexpected fields, bidi control characters, duplicate ids. Astro escapes all text; no field is ever rendered as HTML.
- **`data/case-studies-public.json`** + `case-studies.js`: case studies, same principles.
- **Sample content**: `site-content.json` currently holds sample content (`"demo": true`). While it is there, every page shows a small "Sample content for review" note (`isDemo` in `public-site-content.js`). Sample navigation uses local section pages; sample content remains explicitly labeled and must be replaced before public launch.

## Navigation rule (A and B)

**One door per destination.** The pond is the menu: frogs lead to sections; stones lead to Contact, Join Us and About. Below the pond, show only what the pond does not show, and never two links to the same place at the same level. Interior pages: the wordmark leads home, the header to About, Contact and Join Us, the bottom navigation to the sibling pages of the section.

## Pond Desk v2 (owners' console)

- Files: `../editor/v2/index.html`, `app.js` (plain JavaScript, no dependencies), `style.css`, `fonts/`.
- Served by the back-end at `/v2/`. API implementation: `../editor/backend/api.mjs`.
- Without a reachable API (for example when opened by double-click), the app runs in a flagged demonstration mode that saves nothing. In local mode, a banner states that e-mails are simulated.
- Conventions:
  - text is always set with `textContent`, never parsed as HTML;
  - no inline styles or scripts (strict CSP);
  - English UI and server messages, with dates formatted for en-US;
  - targets of at least 24 px (44 px for main actions on phones);
  - every field has a label;
  - errors appear under the field and focus moves to the first one.

## Checks

`npm test` (unit and build tests, including `scripts/site-content.test.mjs` and `scripts/variant-isolation.test.mjs`, which fails if a page of A loads B styles, if B loads the retro A styles, if a page links to the other variant or to a placeholder domain such as example.com, or if a link names an internal page that does not exist) and `npm run export:client` (with `FPB_VARIANT=b` for B).

## 0.13.0 design update (28 October 2026)

B uses `styles/neo-b.css`, included only for `look === modern` after the shared styles. It contains the v7 brand palette, square labels, hard shadows and static staircase pond masks (desktop and mobile). `neo-b-cream.css` is an optional preview, not loaded in this release; the approved surface is deep-sea. `PondB.astro` includes a logo placeholder and three title spans. Frog menu behavior is unchanged. The sample-content strip occupies its own grid row. Pond Desk keeps its four workspaces with warm dark surfaces and dandelion actions.

The announcement model has no timestamp: an unconditional NEW stamp would make an unsupported freshness claim, so it is omitted. No content migration or security change is part of this visual release.

## 0.14.0 — Client-selected A and shared editorial changes

`client-meeting.css` follows the variant styles. B’s neo-brutalist palette, typography and animation remain. Static route definitions in `data/pages.js` are separate from build-time owner labels in `data/public-pages.js`. `editorial.js` supplies backward-compatible defaults; saved fields take precedence. Legacy routes remain available while menus hide retired sections.

Navigation, Brand and Footer are now Astro components. Gram is a works gallery; Croak and Legal use dedicated page components and editable home fields. The fourth TV and Legal stone must be checked at narrow widths. The footer motion control also pauses interior-page ripples.
