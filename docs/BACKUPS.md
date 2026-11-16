# Encrypted database backups

Back up all application tables, including pond_files once uploads are deployed. The public content download is not a private-data backup.

The operator supplies DATABASE_URL privately and POND_BACKUP_KEY_FILE pointing to a 32-byte random binary key with mode 0600, outside this repository. Keep a second protected copy of the key separately from the encrypted backup. Losing the key makes recovery impossible. No key, database URL, database contents or private backup belongs in Git, the client package or logs.

Use PostgreSQL 17 client tools with trusted CA certificates:

```sh
node scripts/backup.mjs create /private/backups/database.fpb.enc
node scripts/backup.mjs verify /private/backups/database.fpb.enc
```

The create command connects with verified TLS, creates a custom-format PostgreSQL dump in a private temporary directory, encrypts it with AES-256-GCM and removes plaintext temporary files. Existing backup files are never overwritten. Verify authenticates/decrypts and decodes the full dump, not just its table of contents. Passwords are passed through environment variables, not command-line arguments. Keep encrypted files private as well.

For a restoration drill, create an empty disposable loopback PostgreSQL database named fpb_restore_<label>, set DATABASE_URL to that database, then run:

```sh
node scripts/backup.mjs restore-test /private/backups/database.fpb.enc
```

This command refuses remote hosts and other database names. Compare table row counts and content hashes with the backup's consistent source snapshot, then remove the disposable database. A successful decryption alone is not a restoration test. The tool deliberately does not restore to production; production recovery requires a reviewed procedure, current backup and explicit authorization.

On November 16, 2026, a fresh encrypted backup of the existing live database was restored to disposable PostgreSQL 17. Both existing tables (pond_state and pond_sessions) matched row counts and content hashes from the same exported transaction snapshot. pond_files does not exist in the current live version; separate-file persistence is covered by local PostgreSQL integration tests and will be included in subsequent full dumps. The temporary network allowlist entry was removed and the original restriction list restored. The test database was removed.

This is a verified manual backup, not a scheduled off-site backup service. Define retention, protected off-device storage and recurring restoration drills before relying on this as the only recovery method. Provider backups complement, rather than replace, an independently tested recovery path.

On November 17, 2026, the 0.20.0 preparation produced another authenticated encrypted backup. Restoring it to disposable PostgreSQL 17 matched all three tables (pond_state, pond_sessions and pond_files) against the same consistent source snapshot. The wording migration on that copy added 66 fields while preserving every existing page, other state fields and publication history; an actual public A build succeeded. The temporary single-IP network rule was removed and the original restrictions verified. No production content was changed.
