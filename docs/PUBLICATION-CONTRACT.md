# Passport publication contract

This release adds a versioned publication workflow to the demonstration service. Operator review and possession of a private case link do not independently verify identity, ownership or legal rights. Real-data operational qualification remains separate.

## Invariants

- Only an approved application with an owner token or linked owner account can receive a publication draft. Reports, rejected and legacy cases without either authorization cannot publish.
- Approval alone never publishes. A reviewer prepares/approves a public revision; the authorized case owner previews its exact content and explicitly consents before publishing.
- Public content is an explicit whitelist: `name`, `handle`, `nature`, `holder`, `languages`, `occupation`, `description`, `usageTerms`. Never copy submission objects, email, case ID, tokens, evidence metadata/files or private review notes into public responses.
- `nature` and `holder` must match the approved application. Ownership transfer is outside this workflow.
- Revisions have increasing integer versions and a server-computed SHA-256 digest of normalized content. Content of an existing revision is immutable. Editing creates another revision and invalidates any prior pending consent.
- Draft/review/publication mutations use the expected latest version. Revocation instead checks the current published version so it remains available during a pending update, atomically invalidating every pending revision. Publishing additionally requires the exact digest, literal `consent: true`, and `awaiting_consent` status. Stale operations fail with 409; wrong owners receive 404. Check all preconditions inside the same write transaction. Writes require same-origin browser requests.
- An update remains private until reviewer approval and fresh owner consent. The current public version remains unchanged meanwhile.
- Revocation is durable and terminal for this passport ID. Its public URL remains a minimal tombstone; former content is removed from public responses/catalog, and pending revisions cannot resurrect it.
- Public registry reads are fresh (`no-store`). Database migration, audit events and revision persistence must work across restart and backup/restore.
- Each passport allows 30 new revisions per rolling hour, counted persistently in SQLite. Exhaustion returns 429 and expires with time; publication and revocation remain available. This is a write-burst limit, not a lifetime revision limit or an automatic history deletion policy.

## Data

New IDs use `PP-SPR-` plus 12 uppercase hexadecimal characters. Existing fictional `PP-CC-0000` records remain unchanged.

`content` contains all eight fields above as strings. `nature` is `synthetic` or `likeness`. Limits: name 1–120, handle 2–80 (existing handle rules), holder 1–160, languages 0–160, occupation 1–80, description 20–600, usageTerms 20–1500 characters. Reject unknown fields and unsafe control characters. Normalize whitespace around fields; allow line breaks in description/terms.

Private publication state:

```json
{
  "passportId": "PP-SPR-012345ABCDEF",
  "latestVersion": 1,
  "current": null,
  "draft": {
    "version": 1,
    "digest": "64 lowercase hexadecimal characters",
    "status": "awaiting_consent",
    "content": {},
    "createdAt": "ISO date",
    "reviewedAt": "ISO date",
    "reviewNote": "Private reviewer message"
  }
}
```

Before any draft: `passportId: null`, `latestVersion: 0`, `current: null`, `draft: null`. Draft status is `pending_review`, `awaiting_consent` or `rejected`; after publication the current public DTO is returned and draft is null. Expose older revision metadata privately if useful, never through the public DTO.

Published DTO: `id`, `recordType: 'published'`, `version`, `status: 'published'`, the eight whitelisted content fields, `createdAt`, `publishedAt`, `updatedAt`, `reviewedAt`, `registryMode: 'demonstration'`. No shared/private case identifiers or documents. Revoked DTO: only `id`, `recordType`, `version`, `status: 'revoked'`, `revokedAt`, `updatedAt`, `revocationReason`, `registryMode`.

## HTTP

Owner endpoints require the existing case bearer token or the session cookie of the account linked to that case. Claiming invalidates the former bearer token. Cookie-authenticated writes additionally require `X-SPR-Owner: 1` and the account origin checks described in [owner accounts](OWNER-ACCOUNTS.md):

- `GET /api/v1/cases/:id/publication`: private publication state; case-owner authorization required even before a draft exists.
- `POST /api/v1/cases/:id/publication/updates`: `{content, expectedVersion}` creates a `pending_review` revision after a passport draft exists, including a request to correct an unpublished first draft. Returns private publication state, 201.
- `POST /api/v1/cases/:id/publication/publish`: `{version, digest, consent: true}` atomically records consent and publishes the latest approved revision. Returns private publication state, 200. Repeating the identical current publication is idempotent when no newer revision exists.
- `POST /api/v1/cases/:id/publication/revoke`: `{version, reason, confirmed: true}` revokes the current version; reason is explicitly public, 10–300 characters. Reject stale versions and unpublished records. Repeating the same revocation is idempotent. Returns private publication state, 200.

Reviewer endpoints use the existing reviewer authorization:

- `GET /api/v1/review/cases/:id/publication`: private publication state.
- `POST /api/v1/review/cases/:id/publication/drafts`: `{content, expectedVersion}` creates an operator-reviewed `awaiting_consent` revision. Any prior active draft is superseded. Returns private publication state, 201.
- `POST /api/v1/review/cases/:id/publication/review`: `{version, digest, decision: 'approve'|'reject', note}` reviews the latest pending owner update. Approval produces `awaiting_consent`; rejection leaves the current publication unchanged. Note required on rejection. Returns private publication state, 200.

Public endpoints:

- `GET /api/v1/passports/:id`: published DTO or minimal revoked DTO; unknown/unpublished IDs return 404.
- Existing `GET /api/v1/personas` merges fictional fixtures with active published DTOs; no drafts or revoked records. The frontend adapts published DTOs to its catalog/comparison view model. New public profiles use a dedicated page reading the passport endpoint, including revoked URLs absent from the catalog.
- Existing lookup/check endpoints should support published IDs consistently without implying cryptographic or identity verification. No demo media provenance is fabricated for new records.

## Interface

Keep the simplified interface: a publication panel in the private case and reviewer case, one public passport page, and no new global tabs. Reviewer prepares concise public fields after approval; owner sees the exact preview and unchecked consent for that version. A version change resets consent. A failed refresh after a successful write must not claim the write failed. Preserve unsent content on failure and make stale-version recovery explicit.

The authorized case owner can propose an update, follow its review, approve its exact preview and revoke the public passport. Publicly label the service preview and the scope of operator review. Do not describe newly submitted public records as fictional generated examples. Use neutral initials/emblem when no public image exists; evidence uploads are never public portraits.
