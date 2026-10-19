# Synthetic Persona Registry

SPR is a demonstration registry for synthetic personas. It presents eight example records, colour-coded notices, and a 3D passport. It is an independent prototype, not a government or police service. Every listed persona and notice is demonstration data.

## Run locally

Requires Node.js 24.11 or later in the 24.x line. No npm dependencies or build step are required.

```bash
npm start
```

Open `http://127.0.0.1:4176/`. The server creates `var/spr.sqlite` on first start. Set `HOST`, `PORT`, `SPR_DB_PATH`, and, for a public reverse-proxy deployment, `PUBLIC_ORIGIN` through the process environment. `.env.example` is a reference; the application does not load `.env` files automatically.

For a standalone visual preview, open `site/index.html` directly. In that mode submissions receive a clearly labelled demo number and are not saved.

```bash
npm run check
npm test
```

## Architecture

| Path | Purpose |
| --- | --- |
| `site/index.html` | Existing React, htm, and three.js interface. No bundler. |
| `assets/` | Registry emblem, fictional full-length catalog photos, and matching passport portraits. |
| `data/personas.json` | Canonical source for the eight public demo records. |
| `data/persona-passport.v0.1.json` | Example evidence and model bill of materials, not a validation schema. |
| `server/` | Zero-dependency Node HTTP API and SQLite submission storage. |
| `tests/` | API, security boundary, and persistence tests. |

The frontend fetches public records from the API when the server is available. Its embedded records remain a fallback for the standalone preview. Images are loaded from `assets/`: catalog cards use full-length images, compact table rows use headshots, and each record explains and displays both image types beside its sample passport. The images are illustrations, not identity or review evidence.

## API

| Method | Path | Result |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Process health. |
| `GET` | `/api/v1/personas` | Public demo register. |
| `GET` | `/api/v1/personas/:id` | One demo record. |
| `GET` | `/api/v1/passports/:id/check` | Demo record lookup and its limits. |
| `POST` | `/api/v1/applications` | Validate and store an application. |
| `POST` | `/api/v1/reports` | Validate and store a report. |

Writes accept JSON up to 16 KiB and return a random case/reference ID. Submissions are stored only in the local SQLite database; there is no public endpoint to read them. For example:

```bash
curl -X POST http://127.0.0.1:4176/api/v1/reports \
  -H 'Content-Type: application/json' \
  -d '{"who":"Example persona","what":"other","details":"A sufficiently detailed example report.","email":""}'
```

## Data and security boundaries

- The check endpoint confirms only that a demonstration record exists and returns its stored notice and risk count. It does **not** verify a signature, perform a new face comparison, prove ownership, or issue a passport.
- Submitting a form stores its answers. There is no email delivery, examiner assignment, admin review UI, automatic notice update, or public production registry yet.
- The application uses same-origin browser requests, strict server-side validation, a 16 KiB request limit, and a basic in-memory per-IP write limit. The rate limit resets on restart and is not suitable as the sole abuse control for a public launch.
- Application email addresses and report details are personal data. Protect and back up the database when operating the service. Establish an access, deletion, and retention process before accepting real submissions.
- `var/`, `.env*` (except `.env.example`), SQLite databases, logs, test output, and `node_modules/` are ignored by Git. Do not put credentials or real submissions in tracked files. CI uses no repository secrets. The manual container-publish workflow uses GitHub's scoped `GITHUB_TOKEN`.
- The eight fictional catalog images and matching passport portraits were generated for this prototype. They illustrate the records and are not identity, likeness-consent, or review evidence. See `assets/full-body/README.md` and `assets/portraits/README.md`. No licence has been selected for the project's code.

## Container and CI/CD

```bash
docker build -t spr:local .
docker run --rm -p 4176:4176 -v spr-data:/app/var spr:local
```

The named volume retains SQLite data across container replacement. The image runs as an unprivileged user and includes a health check.

`.github/workflows/ci.yml` runs syntax and API tests on pushes and pull requests, then builds and smoke-tests the runtime image. `.github/workflows/release.yml` is a manual workflow that repeats validation, tests the **same image** it publishes, and pushes it to GHCR under the immutable commit SHA. It does not deploy to a host; no host has been selected. Both workflows pin GitHub Actions to commit SHAs and use limited token permissions. Dependabot proposes updates to Docker and workflow dependencies.

## Continuing development

Keep the interface's current hierarchy, colour system, and passport animation. Preserve the visible independent-registry and demo-data disclosures. Before a public launch, add a real evidence review and signature model, authenticated back office, privacy operations, abuse protection, monitoring, and a deployment-specific backup and restore test.

The original handoff, continuation prompt, and exploratory market notes remain in the local workspace under `research/` and `CHATGPT-PROMPT.md`. They are excluded from the public repository. See `docs/DESIGN.md` for the product rules needed during development.
