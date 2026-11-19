# Frog Pond Boys 0.23.1

Prepared November 19, 2026. Local release candidate; deployment needs owner approval after the backup restoration check. The last confirmed live revision is dfbee4a (0.21.0).

This bundle includes the previously reviewed screen messages (14 visible characters), measured operation progress, client layout changes, team photos, 65 editable text fields and published-only server handover. Pond Desk now confirms a write only when the response contains the expected fields. Incomplete responses, including a completed job without its result, show Result unknown, retain the text and never repeat the write automatically. Finishing a publication after opening another screen preserves that screen and its unsaved changes.

During server handover, simultaneous public readiness checks share the pending database read. Results are not cached after completion, preserving immediate checks for removed publications. Public file authorization, writer exclusion and private Desk access are unchanged. No additional account, subscription, DNS change or environment variable is needed.

Validation: 293 entry tests and 294 final tests with PostgreSQL 17, none skipped. The final suite adds the concurrent-read regression. Four real builds passed in the deployment image at 512 MB / 0.5 CPU; all 52 standalone A/B pages opened without script errors or horizontal overflow. Independent checks used the real server, real A/B builds, 26 write operations and 12 browser scenarios at 1440 and 390 pixels. The full verification report and immutable package record the final results.

Some legacy writes still intentionally return an empty object (people, conversation state, draft deletion). Adding explicit acknowledgements and requiring them in the interface is a separate coordinated enhancement. Forms and email notifications remain disabled. Human acceptance of live Save/Publish and observation of the real Render handover are still required; local tests do not prove provider routing.

Deploy the frontend and server together. Restore-check a fresh encrypted database backup before rollout. Do not roll back to 0.21.0 after saving screen-message fields; use compatible application code and preserve newer customer data. See RENDER-HANDOVER.md and SCREEN-MESSAGES-AND-PROGRESS.md for operational constraints.
