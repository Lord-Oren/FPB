# Site wording API — 0.20.0

Status: the 65-field Site wording screen and both public variants are integrated for local release review. Save keeps a draft; Publish updates the site. Public forms and notifications remain disabled.

## Data contract

`wording` is a regular private page resource. Keys are **flat dotted strings**, for example `fields["home.title"]` and `site.wording["home.title"]`, not nested objects. The canonical 65 keys and English original texts are exported from `src/data/wording.js` as `wordingDefaults`; `wordingLimits` provides each maximum length. Existing page titles and editorial settings keep their own API.

- `GET /api/v2/pages/wording` returns `{revision, fields, live, defaults, limits, media, files}`. `fields` is the draft, `live` the published overrides. Empty values mean “use the original”. `defaults` and `limits` have exactly the same 65 keys.
- `PUT /api/v2/pages/wording` accepts `{revision, fields}` and returns `{revision}`. Send the whole form. Missing keys reset to empty; unknown keys are rejected. Trimmed empty strings reset to the original. Stale revision: 409, rejected input: 422 with field diagnostics. The page size ceiling is 60,000 UTF-8 bytes.
- Values are plain, single-line text; no HTML, angle brackets, control characters, Unicode line/paragraph separators (U+2028/U+2029), or direction overrides. Most fields allow 240 UTF-16 code units. The 600-unit fields are `events.none`, `about.ctaText`, `form.closedWithEmail`, `join.spontaneous`, `join.fileHelp`, `join.linkHelp`, `join.fileType`, `join.fileTooLarge`, `legal.pending`. The input limit is checked before trimming.
- `POST /api/v2/pages/wording/publish` accepts `{}` after a successful save in the same editing session. A newer save by another session invalidates publication with 409. A build failure keeps the previous website and draft.
- Standard Desk authentication, origin checks, request serialization and session-bound publish rules apply. No public edit endpoint is added.

## Public rendering and restoration

The stored public snapshot has `site.wording` overrides. `prepareSiteContent(snapshot).wording` resolves every empty/missing value to its original, returning all 65 effective strings. Components using `public-site-content.js` can read `site.wording["home.title"]` directly. Use Astro's normal escaped interpolation or browser `textContent`; never use HTML injection. Encoded entities remain literal text and must not be decoded as markup.

An old database gains an empty wording page without publishing unrelated drafts or rewriting publication history. Old snapshots without wording remain valid. Restoring such a publication restores the original public wording and keeps the newer draft; restoring a newer publication restores its saved wording. Restart preserves both versions. Defaults do not overwrite owner text.

Changing attachment instructions does not alter the actual 10 MiB limit or accepted formats. Updating closed-form wording does not activate a form. Keep technical controls and accessibility-only labels outside this editorial resource.

## Interface integration checklist

Group keys by page in Site wording, show the original beside each override, and reset by setting an empty string. Use the existing common writer lock for Save and Publish. Keep failed/stale form contents visible, apply field diagnostics, and keep the revision associated with the displayed field values. Publishing does not change the draft revision. Never adopt a newer revision without refreshing its fields; doing so can overwrite another member’s work. Connect each of the 65 public texts in both variants, including dynamic motion and form messages. Keep existing published wording until Publish succeeds. Verify escaping, keyboard use, empty fallbacks, desktop/mobile layout, multiple tabs and publication failure.

## Retired Contact field (0.23.0)

The old `contact.emailLabel` field is no longer editable or rendered. Old snapshots and open editor tabs may still submit this key: its former plain-text/240-character constraint is checked, then the key is discarded. Unknown keys still fail. No other Contact wording is removed.
