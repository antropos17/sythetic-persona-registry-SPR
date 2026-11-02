# Client architecture

The entry page is `site/index.html`. Client source is organized under `site/app/`:

- `domain/` contains registry data access, routing, validation, and other shared behavior.
- `pages/` contains the page-level interfaces; `ui/` contains reusable controls and the passport viewer component.
- `passport/` contains passport drawing, image and font loading, Three.js loading, and the renderer. `shell.mjs` coordinates navigation and page state.
- `site/styles/` contains the stylesheet source.

`data/personas.json` is the canonical source for the eight demonstration records. The client build embeds those records as a fallback and replaces them with the API response when available.

After `npm ci`, run `npm run build` to bundle client JavaScript and CSS with esbuild into the committed `site/dist/` files, including gzip and Brotli variants. Commit updated build output with source changes. Run `npm run check:client` to check client source and verify that the committed output and compressed variants match the build. `npm run check` includes that check and the server and asset checks; `npm test` runs the test suite. The server can run from the committed output without installing the development dependencies.

The passport viewer waits until it is near the viewport before loading its portrait and Three.js and initializing the renderer. If IntersectionObserver is unavailable, initialization starts immediately. Font readiness is awaited with a bounded timeout and shared across viewers; a static passport image is used if 3D initialization fails. The server negotiates the checked-in Brotli, gzip, or uncompressed client files using `Accept-Encoding`.

The bundle uses classic scripts so the entry page can be opened directly without a module loader. Direct `file://` behavior has not been qualified across browsers. In standalone mode, submissions are marked as demo submissions and are not saved.
