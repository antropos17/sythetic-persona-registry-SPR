# Synthetic Persona Registry

SPR is a demonstration registry for synthetic personas. It presents eight example records, colour-coded notices, and a 3D passport. It is an independent prototype, not a government or police service. Every listed persona and notice is demonstration data.

## Run locally

Requires Node.js 24.11 or later in the 24.x line. No npm dependencies or build step are required.

```bash
npm start
```

Open `http://127.0.0.1:4176/`. The server creates `var/spr.sqlite` on first start. Set `HOST`, `PORT`, `SPR_DB_PATH`, and, for a public reverse-proxy deployment, `PUBLIC_ORIGIN` through the process environment. The proxy must forward the public `Host` header. Literal IP addresses and `localhost` remain available for local access and health checks; other domain hosts are rejected unless they match `PUBLIC_ORIGIN`. `.env.example` is a reference; the application does not load `.env` files automatically.

For a standalone visual preview, open `site/index.html` directly. In that mode submissions receive a clearly labelled demo number and are not saved.

```bash
npm run check
npm test
```

## Architecture

| Path | Purpose |
| --- | --- |
| `site/index.html` | Existing React, htm, and three.js interface. No bundler. |
| `assets/` | Registry emblem, fictional full-length studio images, and matching face portraits. |
| `data/personas.json` | Canonical source for the eight public demo records. |
| `data/persona-passport.v0.1.json` | Example evidence and model bill of materials, not a validation schema. |
| `data/media-provenance.json` | Pinned SHA-256 digests and explicit origin claims for the 16 demo images. |
| `scripts/media-manifest.mjs` | Rebuild or check the image digest manifest. |
| `server/` | Zero-dependency Node HTTP API and SQLite submission storage. |
| `tests/` | API, security boundary, and persistence tests. |

The frontend fetches public records from the API when the server is available. Its embedded records remain a fallback for the standalone preview. Images are loaded from `assets/`: catalog cards and table rows lead with headshots, while each record shows its full-length image below the passport and details. The images are illustrations, not identity or review evidence.

Each demo record has a short description. Catalog cards show a compact description and channel handle, including on narrow screens; the record page shows the full description and a platform icon where the platform is known. A `socials` entry may include a full profile `url`; it stays `null` until an exact address is supplied. The interface links only to HTTPS URLs on the named platform whose path matches the declared handle (YouTube channel paths are allowed). It does not construct live profile addresses from fictional handles. A profile link by itself is not evidence of ownership.

**Basis of the record** expands each existing demo endorsement into its recorded statement, basis, related event date when available, and unresolved issue. Dates refer only to corresponding fictional history events; absent dates are shown as not supplied. These public descriptions do not expose private case files or establish a new verification. Public profiles do not include invented posts or text standing in for portfolio media.

Open `/#compare` from the catalog, a record, the footer, or registry search to compare two distinct personas. The comparison includes notices, listed rights holders, claims, channels, risks and dates. Selection and **Swap sides** update a shareable route such as `/#compare/PP-AZ-0001/PP-TR-0004`; **Copy comparison link** copies that pair. Unknown or duplicate IDs fall back to the home page. Changing the pair retains keyboard focus and scroll position. All comparison data remains demonstration data.

The catalog combines notice, language, occupation and proof-level filters with text search and saved records. Compact portraits place the name and notice together near the top of each card. Select up to two personas from cards or table rows, then use **Compare selected**. Selection is kept within the current tab across filter and layout changes; the tray provides remove and clear actions. It is not persisted across reloads. **Clear filters** resets all catalog filters without changing the selected pair.

Profiles have a sticky section menu and a link beside the notice showing the number of unresolved issues. Section routes such as `/#PP-AZ-0001/risks` and `/#PP-AZ-0001/basis` support direct links, reloads and keyboard focus on the destination. Legacy `/examples` section links open the profile overview. Sticky offsets follow the actual header and section-menu heights, including wrapped mobile layouts. Comparison names remain visible during scrolling; **Show differences only** hides rows whose displayed values match. Different rows are identified with text and a subtle background. Risk and claim ordering does not create artificial differences.

Visitors can save records from cards, the table, or a record page and filter the catalog to those saved records. The saved list contains only demonstration passport IDs and stays in that browser's local storage; it is not an account or a server-side watchlist.

An unfinished application is saved in that browser's local storage so it can be resumed. The form includes **Clear draft**, and a successful submission removes the draft. Reports are not stored in browser local storage.

After submission, the visitor receives a case number and a private link. The link contains a 256-bit random access token in the URL fragment; only its SHA-256 hash is stored in SQLite. A case number alone cannot read the case. The private page shows status, reviewer messages, evidence metadata, and a timeline. The visitor can attach up to five JPEG, PNG, or PDF files, each at most 5 MiB, with a source or issuer statement. Files are stored as private SQLite blobs and are never served through the public static-file route. A reviewer can download them only through an authenticated endpoint. Keep the private link secure: it grants case access, and the service does not send it by email.

Set a `SPR_REVIEWER_TOKEN` of at least 32 random characters in the process environment to enable the local review console at `/#review`. The key is held only in the browser tab's memory. The reviewer can inspect submissions, mark evidence accepted or rejected with a reason, request more evidence, and close a case with a message visible to the submitter. An application cannot be approved without accepted uploaded evidence; a licensed likeness also requires accepted consent evidence. Approval is a case decision, not public registration or passport issuance. See [review and provenance operations](docs/REVIEW-AND-PROVENANCE.md).

## API

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Process health. |
| `GET` | `/api/v1/personas` | Public demo register. |
| `GET` | `/api/v1/personas/:id` | One demo record. |
| `GET` | `/api/v1/passports/:id/check` | Demo record lookup and its limits. |
| `POST` | `/api/v1/applications` | Validate and store an application. |
| `POST` | `/api/v1/reports` | Validate and store a report. |
| `GET` | `/api/v1/cases/:id` | Private case status with owner bearer token. |
| `POST` | `/api/v1/cases/:id/evidence` | Add a private evidence file with owner bearer token. |
| `GET` | `/api/v1/personas/:id/provenance` | Compare demo image hashes with the checked-in manifest. |
| `GET` | `/api/v1/review/cases` | Reviewer queue with operator bearer token. |
| `GET` | `/api/v1/review/cases/:id` | Full reviewer case detail. |
| `POST` | `/api/v1/review/cases/:id/status` | Record a status decision and submitter message. |
| `POST` | `/api/v1/review/evidence/:id/decision` | Record an evidence decision and reason. |
| `GET` | `/api/v1/review/evidence/:id/file` | Private evidence download. |

JSON writes accept up to 16 KiB. Submissions and evidence are stored in the local SQLite database. Private case reads require the access token; reviewer reads require the operator token. For example:

```bash
curl -X POST http://127.0.0.1:4176/api/v1/reports \
  -H 'Content-Type: application/json' \
  -d '{"who":"Example persona","what":"other","details":"A sufficiently detailed example report.","email":""}'
```

## Data and security boundaries

- The check endpoint confirms only that a demonstration record exists and returns its stored notice and risk count. It does **not** verify a signature, perform a new face comparison, prove ownership, or issue a passport.
- The provenance endpoint verifies SHA-256 file integrity against a manifest stored in the same repository. That manifest contains a **project declaration**, not independent evidence of image origin, model lineage, consent, or identity. No C2PA assertion or cryptographic issuer signature is verified. Use `npm run media:update` only after reviewing intentional image changes; `npm run check` fails on a mismatch.
- The review console provides one environment-configured operator key and records decisions and messages. It does not provide individual staff accounts, independent audit-log anchoring, email delivery, automatic public notice updates, or a production registry. Existing cases created before private tokens were introduced remain reviewable by an operator but have no owner-access link.
- The application uses same-origin browser requests, Host-header validation, strict server-side validation, a 16 KiB request limit, and a basic in-memory per-IP write limit. The rate limit resets on restart and is not suitable as the sole abuse control for a public launch.
- Application email addresses, report details, and evidence files are sensitive data. Protect and back up the database when operating the service. Establish access, deletion, retention, malware scanning, and a tested backup/restore process before accepting real submissions. Serve the review console only over HTTPS outside loopback.
- `var/`, `.env*` (except `.env.example`), SQLite databases, logs, test output, and `node_modules/` are ignored by Git. Do not put credentials or real submissions in tracked files. The standard CI uses no repository secrets. The optional AI reviewer sends eligible diffs to OpenAI using `OPENAI_API_KEY`; see [AI review setup and limits](docs/AI-REVIEW.md). The manual container-publish workflow uses GitHub's scoped `GITHUB_TOKEN`.
- The eight fictional full-length images and matching face portraits were generated for this prototype. They illustrate the records and are not identity, likeness-consent, or review evidence. See `assets/full-body/README.md` and `assets/portraits/README.md`. No licence has been selected for the project's code.

## Container and CI/CD

```bash
docker build -t spr:local .
docker run --rm -p 4176:4176 -v spr-data:/app/var spr:local
```

The named volume retains SQLite data across container replacement. The image runs as an unprivileged user and includes a health check.

`.github/workflows/ci.yml` runs syntax and API tests on pushes and pull requests, then builds and smoke-tests the runtime image. `.github/workflows/release.yml` is a manual workflow that repeats validation, tests the **same image** it publishes, and pushes it to GHCR under the immutable commit SHA. It does not deploy to a host; no host has been selected. Both workflows pin GitHub Actions to commit SHAs and use limited token permissions. Dependabot proposes updates to Docker and workflow dependencies.

`.github/workflows/ai_review.yml` provides advisory comments on internal PRs when opened or updated. It requires the `OPENAI_API_KEY` secret and `AI_REVIEW_MODEL` variable, skips forks and Dependabot, and tolerates reviewer failures. Keep its job out of required merge checks. See [AI review setup and limits](docs/AI-REVIEW.md).

## Continuing development

Keep the interface's current hierarchy, colour system, and passport animation. Preserve the visible independent-registry and demo-data disclosures. Before a public launch, replace the shared operator key with individual accounts and authorization, define a real evidence and consent policy, add privacy operations and durable abuse protection, and test monitoring plus backup/restore in the chosen deployment. Issuer signatures and independent provenance assertions need an external trust and key-management plan.

The focused audit and current verification boundary are recorded in [`docs/AUDIT-2026-10-19.md`](docs/AUDIT-2026-10-19.md).

The original handoff, continuation prompt, and exploratory market notes remain in the local workspace under `research/` and `CHATGPT-PROMPT.md`. They are excluded from the public repository. See `docs/DESIGN.md` for the product rules needed during development.
