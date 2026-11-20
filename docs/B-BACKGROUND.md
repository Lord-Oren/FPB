# Version B background setting

Local backend preparation for B V3, November 20, 2026. The current public release remains 0.23.1. This change supplies the content contract; the selector and page styling are a subsequent frontend change. It does not make the cream theme visible on its own.

## Content contract

The published setting is `site.home.look.bBackground`. Its only accepted values are `standard` and `cream`, with `standard` as the default. It describes version B only. The public content adapter (`prepareSiteContent`, also exposed through `src/data/public-site-content.js`) always returns a resolved `site.home.look.bBackground` for every page. The frontend must apply it only when rendering B. No change to A is intended.

Missing `home.look`, an empty look object, or a missing `bBackground` resolves to `standard`. Explicit null, non-string values, whitespace, different casing, arbitrary colors, CSS, URLs, and extra keys inside `home.look` are rejected. The setting is an enum, never executable style text.

## Pond Desk API

The existing authenticated home page API is used; no extra route or access permission is added.

- `GET /api/v2/pages/home`: both `fields.look_bBackground` (draft) and `live.look_bBackground` (published) are returned with their defaults resolved, along with the existing revision.
- `PUT /api/v2/pages/home`: send the current `revision` and `fields.look_bBackground`, using the exact string `standard` or `cream`. Existing home fields can be included as usual. An older editor omitting this field preserves the stored draft choice.
- `POST /api/v2/pages/home/publish`: publish the saved home draft using the normal editor session and operation flow. A revision saved by another session is refused until the page has been saved again. Saving alone never changes the public background; publishing another page or the navigation uses the home page's published value.
- An invalid choice returns HTTP 422 with an English message and `diagnostics[0].field = "look_bBackground"`. It changes neither the revision nor the saved data. Existing authentication, 409 conflicts and publication failure handling remain in place.

For the frontend: add a two-option **Standard / Cream** control to the home settings. Send the flat API field above; consume the nested public field when rendering. Preserve the normal dirty-state warning, save/publish lock, conflict handling and response confirmation. Applying the background to all B pages, including interiors, belongs in the common B layout. Do not expose raw CSS editing.

## Existing content and restoration

Compatibility is handled on read, without a new persistent migration. Existing content without the setting retains its original stored shape. Opening an old page does not change its revision, publish its draft, add a history entry, or rewrite historical snapshots to insert a default. The adapter supplies `standard` only in the read result. An explicit save of the new setting stores it like other page fields.

An old publication without the field restores to standard. A newer publication restores its recorded standard/cream choice. Restoration changes the live page while preserving the current draft. Both draft and live choices survive a server restart. A failed build keeps the previous public choice and the saved draft.

The return to standard is an ordinary save and publication. This is different from downgrading the application: the 0.23.1 content validator does not understand `home.look` in newer publications. Deploy the matching server and frontend together, and retain a compatible server when reverting a design. Do not downgrade to the older validator after storing the new field, or strip newer customer data from history to force a downgrade.

## Verification and next step

`node --test scripts/back-b-background.test.mjs` covers strict API/build validation, legacy defaults without mutation, snapshot round trips, authentication, revisions, two editing sessions, unpublished drafts, old clients, publication failure, historical restoration and restart durability. The full suite also exercises PostgreSQL persistence and server handover.

Local real builds compare the legacy, explicit standard and cream snapshots against all 52 baseline A/B pages. At this backend-only stage, both variants remain byte-identical: the new visual behavior is intentionally left for the frontend integration. The final frontend acceptance must additionally demonstrate that cream changes every B page while A stays identical.

Next: approve the interior-page mockup, integrate the B V3 frontend and Desk selector, then perform the complete release review. No deployment, DNS change, new service or subscription is part of this preparation. Forms and notifications remain disabled.

## Change of November 20, 2026: the visitor chooses

The owner decided that the B background is chosen by each visitor, not in Pond Desk. Pond Desk no longer shows `look_bBackground`. The server contract above is unchanged: the value stays validated, defaults to `standard`, and is only the starting value of the page. The visitor's switch in the B header stores `standard` or `cream` in that browser's `localStorage` (`fpb-b-background`); nothing is sent to the server and version A is unaffected. Existing drafts keep their value because editors that omit the field preserve it.
