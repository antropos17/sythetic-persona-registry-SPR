# SPR demonstration release readiness

Prepared on 2 November 2026 for the existing `0.1.0` demonstration scope. This document describes checked behavior and the remaining deployment decisions; it does not assert production readiness for real identity or consent evidence.

## Included in this preparation

- Self-hosted pinned application scripts and fonts, with upstream licences, script SRI and a SHA-256 manifest verified without network access. Script, style and font CSP directives allow local resources only.
- Reviewer credentials fail at startup if their characters cannot be represented by the supported bearer format.
- Evidence source statements accept the multiline text offered by the form and reject unsafe control characters.
- A saved review decision remains confirmed when the subsequent queue refresh fails. File decisions have feedback beside their controls. Case selection and sign-out are disabled during a pending decision or case load.
- A truthful four-step process illustration replaces the proposed passport-issuance process. The new illustration was informed by Stageshow; its specific visual verification is recorded in [the rehearsal](demo/REHEARSAL.md).
- A SQLite online backup command validates the completed snapshot and refuses existing destinations and sidecars. It includes committed WAL transactions; copying only the database file while the service runs is not a supported substitute.

## Verification

- `npm run check`: passed, including source syntax, public media hashes, runtime asset hashes, local font references and script SRI.
- `npm test`: 64 tests passed. API cases cover token isolation, private evidence, final-state transitions, likeness consent gating, persistence/migration, simultaneous submission limits and public media integrity. New cases cover multiline evidence, invalid reviewer configuration, post-save refresh failure, local runtime assets and online WAL/BLOB backup.
- Current in-app Chromium browser: catalog search, saving, selection of two records, comparison swap/differences/reload, profile risk deep-link/reload, image dialog/Escape, form errors, application draft/reload, application submission, evidence upload, authenticated evidence download, acceptance, review and final approval. The approved owner page showed the final message and removed the upload form. A separate report was submitted at 390 px.
- The browser used synthetic submissions in a separate in-memory instance. Existing local cases, drafts and evidence were not used as fixtures. Downloaded synthetic evidence was 44 KiB and its digest matched the original fixture.
- Native mobile hardware, Safari, a screen reader, production load, host restore and a public deployment have not been qualified by these checks. A static illustration check does not qualify the actual case workflow.
- The browser tool rejected direct `file://` navigation under its URL security policy; that preview is not browser-qualified. Raw HTML keeps plain local script tags for file compatibility, while HTTP responses receive the pinned SRI attributes. All supported release workflow checks use HTTP.

The first local `npm run check` attempt encountered a Windows child-shell PATH issue. A process-only minimal PATH resolved it; no global shell or npm settings changed. The final check and suite passed. The first backup test exposed a test cleanup-order error on Windows, which was corrected before the successful run. Neither failure is counted as acceptance evidence.

## Release procedure

1. Merge the reviewed preparation PR only after its current GitHub CI passes, including the container build and smoke check.
2. Keep the `0.1.0` release labelled as a demonstration. Use the exact tested commit as the target; do not represent sample notices as a new verification or public passport issuance.
3. On the intended host, keep `SPR_DB_PATH` on persistent private storage, configure the exact HTTPS `PUBLIC_ORIGIN`, and set a generated URL-safe reviewer token through a secret manager if review is needed. The application does not load `.env` automatically.
4. Before moving an existing database, take an online snapshot with `npm run backup -- <source.sqlite> <new-snapshot.sqlite>`. Protect the snapshot as sensitive data. Stop the destination service before restoring into a fresh database path; verify the copied snapshot and existing cases before routing traffic to it.
5. The manual **Publish container** workflow tests the exact image before publishing its immutable commit tag to GHCR. Publishing the container does not deploy the service. Select and verify a host before promoting traffic.
6. Check the root page, catalog, public lookup and a synthetic private-case cycle on the chosen host. Record the deployed revision and image digest. Keep synthetic and real-data operational records private.

## Rollback

Keep the previous immutable image and a verified private snapshot. Stop the service before switching database paths. Restore a snapshot to a new path, never over an active database or existing backup; retain the original files until verification is complete. Run SQLite integrity checking and inspect an existing case and evidence after restart. This release does not change the database schema.

## Remaining decisions before a public service

No deployment host, public domain or maintainer licence for SPR has been selected. The shared reviewer key, in-memory per-process submission limits, no email delivery, and absent retention/deletion and malware-scanning operations remain demonstration boundaries. Real submissions require individual reviewer authentication, privacy/retention operations, durable quotas and host-specific backup/restore verification. These are not silently activated by publishing a demonstration release.
