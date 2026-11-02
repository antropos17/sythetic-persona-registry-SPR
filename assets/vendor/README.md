# Self-hosted runtime assets

SPR serves its pinned React 18.3.1, React DOM 18.3.1, htm 3.1.1, three.js 0.158.0 and font files from this directory. Loading a public or private page does not require a third-party CDN or font service. The original script SRI hashes are applied to HTTP responses by the server. The raw HTML uses ordinary local script tags so a direct file preview does not require file-origin CORS.

`data/runtime-assets.json` records the downloaded source URLs and exact SHA-256 digests, including each upstream licence. `npm run check` verifies these files and the script SRI values without network access. Preserve the licence files when distributing the container. These dependency licences do not select a licence for SPR itself.

To update a dependency, review its upstream release and licence, replace the versioned file, and update both the digest manifest and script SRI intentionally. Fonts are the Archivo variable family, IBM Plex Mono, and Mrs Saint Delafield, distributed under their included SIL Open Font Licences. Font source URLs are recorded for reproducibility; use the stored bytes for release builds.
