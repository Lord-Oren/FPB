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
| `components/pond/` | The pond: frogs and tongue menus, TV screens (`ZoneScreen.astro`: only an arrow, the block title above is the link; `screen-href.js`), stones, artwork library (`RubenArtwork.astro`). |
| `components/content/` | Lists for works, events and press, plus `Empty.astro` (never a blank page). |
| `components/home/HomeSections.astro` | Both versions, under the pond (pixel style in A via `home-retro-a.css`): latest work (each card opens the work itself), news, team, direct contact. |
| `layouts/SiteLayout.astro` | Page shell: fonts, styles, fly cursor. |
| `scripts/motion.js` + `styles/motion.css` | Motion for both versions: links to a section glide there with an eased scroll and move the keyboard focus; page changes use the browser's View Transitions (B: soft fade and lift, A: an iris opening from the click); B cards sway gently on hover, A's stones, cards and team frogs drift on their own. All of it stops under prefers-reduced-motion. `scripts/reveal.js` fades sections and cards in once. |
| `assets/pixel-pond-a.svg` | A's pixel pond (uneven shape, dithered shore). |
| `styles/` | `site.css` (A home and shared), `variant-b.css` (B home), `home-sections.css` (B under the pond), `content.css` (section pages, both skins), `interior-variants.css` (skins via `[data-skin=pixel\|modern]`), `original-artwork.css` (A pond proportions), `retro-a.css` (A interior pages: retro pixel style with Ruben's pixel frog, stones and lily, no TV frame), `home-retro-a.css` (A home: pixel pond under the TV pads and the sections below in pixel style, stepped reveal), `fly-cursor.css`. |

## Content

- **`data/site-content.json`**: everything the owners edit in Pond Desk except case studies (home announcement and Gram, section intros, works, events, press, about, contact, join, images). Pond Desk publishes it; do not edit by hand on a live site.
- **`data/site-content.js`** validates it at build time and fails the build on anything unsafe or incomplete: lengths, required fields, HTTPS links, allowed video and audio hosts, image signatures, unexpected fields, bidi control characters, duplicate ids. Astro escapes all text; no field is ever rendered as HTML.
- **`data/case-studies-public.json`** + `case-studies.js`: case studies, same principles.
- **No demonstration content (V1, 16 November 2026)**: the seed is empty and nothing on the site or in Pond Desk is marked as a demo. An empty field shows a short neutral line ("New work is on its way.") or nothing, never invented text. `scripts/front-no-demo.test.mjs` builds A and B and fails on demo, sample, lorem, fictional, made-up or example.com wording, in the site and in Pond Desk.
- **Files**: case studies (`documentId`, PDF), Legal (`documentId`, PDF) and works (`videoId`, MP4 or WebM) point to `files/<id>`, served by the back-end only once a publication references them. Pond Desk uploads them through `POST /api/v2/files` (contract `interne/design/v2/API-V1.md`).

## Navigation rule (A and B)

**One door per destination.** The pond is the menu: frogs lead to sections; stones lead to Contact, Join Us and About. Below the pond, show only what the pond does not show, and never two links to the same place at the same level. Interior pages: the wordmark leads home, the header to About, Contact and Join Us, the bottom navigation to the sibling pages of the section.

## Pond Desk v2 (owners' console)

- Files: `../editor/v2/index.html`, `app.js` (plain JavaScript, no dependencies), `style.css`, `fonts/`.
- Served by the back-end at `/v2/`. API implementation: `../editor/backend/api.mjs`.
- Without a reachable API, the app says so and retries every 10 seconds; opened as a file (double-click), it explains that `npm run dev:editor` is needed. It never shows invented content. In local mode, a band states that e-mails are not sent.
- One shared lock (`busy()` in `app.js`, tested by `scripts/front-desk-lock.test.mjs`): while Save, Publish, a file upload or any other write runs, every other write control is disabled and a second click only shows "Please wait".
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

B uses `styles/neo-b.css`, included only for `look === modern` after the shared styles. It contains the v7 brand palette, square labels, hard shadows and static staircase pond masks (desktop and mobile). `neo-b-cream.css` is an optional preview, not loaded in this release; the approved surface is deep-sea. `PondB.astro` includes a logo placeholder and three title spans. Frog menu behavior is unchanged. Pond Desk keeps its four workspaces with warm dark surfaces and dandelion actions.

The announcement model has no timestamp: an unconditional NEW stamp would make an unsupported freshness claim, so it is omitted. No content migration or security change is part of this visual release.

## 0.14.0 — Client-selected A and shared editorial changes

`client-meeting.css` follows the variant styles. B’s neo-brutalist palette, typography and animation remain. Static route definitions in `data/pages.js` are separate from build-time owner labels in `data/public-pages.js`. `editorial.js` supplies backward-compatible defaults; saved fields take precedence. Legacy routes remain available while menus hide retired sections.

Navigation, Brand and Footer are now Astro components. Gram is a works gallery; Croak and Legal use dedicated page components and editable home fields. The fourth TV and Legal stone must be checked at narrow widths. The footer shows the logo variants and only the links that have an address.

## V1 — 16 November 2026

Presentations are gone from Case Studies and Pond Desk. Case studies are a thumbnail grid (cover, brand logo, one sentence; the PDF opens in a new tab). About, Contact and Legal read every field from Pond Desk. Ribbit and Croak have their own bands on the home page. On phones, the inner pages have no ripple layer behind the text and the home keeps only the pixel rings under the pads (F4).

### T4 — phone pond, Desk send states, archive

- **Phone pond (A only, ≤600 px, `src/styles/pond-mobile-a.css`).** One column on a pixel water tile: title, the three frogs on Ruben's log, the tagline, then the four pads in a zigzag with the section name inside each TV, then the stones in a 2 × 2 grid. Sprites live in `src/assets/pond-mobile/` and are inlined as data URIs (`--pm-*` variables in `SiteLayout.astro`) because the CSP only allows `data:` and same-origin images. One art pixel is 3 CSS px. Site fonts are kept. Desktop and B are untouched.
- **Phone ergonomics (A only, `src/styles/mobile-a.css`).** Menu panel, compact inner header, form fields at 16 px with 50 px targets, footer.
- **Page change in A** is the same iris, now moving in visible steps (`steps()` in `motion.css`). Reduced motion still turns it off.
- **Home news band.** The announcement card only shows when its title or text is filled. When there is no announcement, event or press, the band says "News is on its way." The `#news` anchor always stays.
- **Desk.** Files are read inside the shared lock (`readBase64` inside `busy`). Message lines show the real send state (test, sending, sent, trying again, held for review). Attachments show kind, size and the checked copy; the unchecked original needs a confirmation. Settings → Deleted brings items back as drafts. Case context and work are optional when a PDF is attached; announcement, story and ethos are optional.
