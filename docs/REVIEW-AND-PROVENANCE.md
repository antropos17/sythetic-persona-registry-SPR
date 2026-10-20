# Review and provenance operations

## Local operator setup

The console at `/#review` is disabled unless `SPR_REVIEWER_TOKEN` is set to a random value of at least 32 characters. Keep the value outside the repository, process arguments, browser bookmarks, and screenshots. On PowerShell, generate a key locally and store it in a password manager or local secret manager before setting the process environment. Start the server with that environment variable present; do not add the key to `.env.example` or GitHub Actions variables for a local demonstration.

The console uses a single shared operator key. It has no account recovery, staff identity, or fine-grained roles. The key remains in browser memory for the active page session; closing reviewer access or reloading the page clears it. Run the console over HTTPS if it is ever exposed beyond loopback. A public deployment needs individual authenticated reviewers, least-privilege roles, session management, and an external audit sink before processing real cases.

## Case workflow

1. A visitor submits an application or report. The response contains a random case ID and an independent 256-bit access token. SQLite stores the token's SHA-256 hash; the browser displays a private URL fragment containing the token. The link is shown once in the confirmation screen and is not emailed or stored in local storage.
2. A holder of that link can read status, evidence metadata, and public reviewer messages, and can upload up to five evidence files while the case remains open. The case endpoint never returns the original application or report payload.
3. A reviewer opens the private queue, reads the submission, downloads evidence, and records a reason when accepting or rejecting each file. Reviewer messages and decisions appear in the case history. The UI labels these messages as visible to the submitter.
4. The reviewer changes the case status through the allowed transitions. Closing or requesting evidence requires a message. An application approval requires at least one accepted uploaded file; a likeness application requires an accepted consent file. Approval does not publish a record or alter a demonstration notice.

Allowed application flow: `received → reviewing / needs_evidence / rejected`; `reviewing → needs_evidence / approved / rejected`; `needs_evidence → reviewing / rejected`. Allowed report flow: `received → reviewing / needs_evidence / dismissed`; `reviewing → needs_evidence / resolved / dismissed`; `needs_evidence → reviewing / resolved / dismissed`. Final decisions are closed in this version.

Old submissions migrate in place. Since the previous API never issued owner tokens, their public case page remains inaccessible. They are visible to a configured reviewer. Do not infer ownership from a case number alone.

## Evidence handling

The upload endpoint requires the owner's bearer token and a same-origin browser request. It accepts only JPEG, PNG, and PDF, with an allowed extension, matching media type and file signature, a 5 MiB per-file limit, a five-file per-case limit, and a 10–500 character source statement. That statement is a submitter claim for the reviewer to assess. Large model binaries are outside this upload channel; attach a hash manifest or documentation instead. Never submit passwords, session tokens, or access keys as channel-control evidence. The original file name is checked and recorded only as metadata. Contents live as SQLite BLOBs under the ignored `var/` database location. The only download endpoint is reviewer-authenticated and uses `Content-Disposition: attachment`, `application/octet-stream`, `nosniff`, and a generated download name. The server computes SHA-256 at upload and checks it again on download.

These checks establish byte integrity within the local database, not authorship, authenticity, consent, copyright ownership, or safety. They do not scan for malware or disarm active PDF content. Review files in an isolated environment. A public service needs malware scanning, durable rate and storage quotas, deletion and retention schedules, access logs with individual actors, and a restore-tested encrypted backup. See the [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) and [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

## Public demo media

`data/media-provenance.json` records the SHA-256 digest of each public portrait and full-length illustration. `npm run check` regenerates those values in memory and fails if a checked-in file differs. `npm run media:update` intentionally replaces the manifest after asset review. The provenance API recomputes each file's hash when requested and returns `matches_manifest`, `mismatch`, or `missing`.

The manifest records the project's claim that the images are fictional AI-generated illustrations. The original generation event, model and prompt, upstream licences, consent materials, and C2PA manifest were not captured in a verifiable chain. A matching SHA-256 shows that a file matches this repository's manifest; it cannot confirm the claim's truth. [C2PA](https://spec.c2pa.org/specifications/) could provide signed media assertions in a later release if a trustworthy generation and key-management process is established. A valid provenance assertion would still require human review of its claims.

## Data lifecycle before accepting real submissions

- Set a retention period by case type and evidence category, then implement deletion and export requests before collecting real personal material.
- Restrict SQLite database and backup access to the service and approved operators. Treat WAL and SHM files as part of the database lifecycle.
- Test backup and restore on the selected host, including private evidence and case events. Keep credentials and backups outside Git.
- Replace the shared operator key with named reviewer accounts and auditable authorization decisions. Keep public case tokens separate from reviewer credentials.
