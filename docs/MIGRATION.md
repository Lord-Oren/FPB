# Migration and performance

## Branches

- `archive/original-site`: original main commit `279b88c12117941acb41f63f4f8c3b0bfc6bdc8c`.
- `migration/pond-desk`: application source, dependency lockfile, tests, and deployment templates.
- `main`: unchanged until the migration is reviewed and the cutover is approved.

The public case-study seed is empty: a legacy internal test study and its media were excluded. They remain in the original local workspace. The other labeled sample content is retained for review.

## Pond Desk changes

Read-only requests for navigation, counts, settings, people, publication history, journal, item lists/details/history, pages, and media can read the last committed state while a publication is building. They no longer wait in the mutation queue or clone and persist the entire state.

Sessions are updated only when their page-editing context changes. Opening a conversation still uses the mutation queue because it can mark messages as read; attachments and exports keep their existing safety rules. Writes and publications remain serialized.

The initial screen opens before inbox badges load. One aggregate counts request replaces two full inbox downloads. Public mode builds only version A; private comparison mode can still build A and B. The View on Site link uses version A.

These changes reduce avoidable application work. They do not eliminate free-host cold starts, database/network latency, or the Astro build needed to publish. No production latency guarantee is implied by local tests.

## Editable public headings

In Pond Desk, open **The site → Home titles & text, Croak and Legal**. The home page headings, labels above them, contact heading, Gram introduction, and Croak link text can now be edited and published. Existing sites keep their current default text until edited. Technical zone labels such as “Stone links” are no longer displayed above public page titles; the actual navigation links remain.

## Regression coverage

`scripts/migration.test.mjs` holds a simulated publication open and checks that seven authenticated reads finish without session/state writes. It verifies anonymous access is rejected for Desk, public A stays separate from editor APIs, public forms are disabled, and www redirects correctly. Existing tests cover persistence, conflicts, publication failures, private data isolation, and real static builds. CI also runs the PostgreSQL integration tests with a disposable local database.

Old-language strings in the message migration adapter and Unicode test fixtures are intentional compatibility data. Client documentation, UI, new test descriptions, and deployment instructions are English.

## Rollback boundaries

The archive branch can restore the original source. Application database changes require a verified backup/restore plan of their own. No private database, keys, internal coordination files, or local workspace history is part of this branch.
