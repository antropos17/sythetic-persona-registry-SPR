# Process illustration rehearsal

Gold: Stageshow `static-card`. The editable adaptation in `spr-case/` uses its Stage, Window, Row, crop, sidebar and satellite composition, with SPR navy, case wording and a compact layout. The MIT licence is included beside the source. To regenerate, place that source in a Stageshow installation as `examples/spr-case`, run its preview, and capture the `.ss-stage` at device scale 2 at 1200 and 390 viewport widths. The host displays the resulting stills from `assets/demo/`; no Stageshow runtime is shipped.

Story: a fictional private case has evidence, an assessment and a recorded outcome. It is explicitly labelled an illustration and does not imply passport issuance or a public notice change. No animation, cursor or loop is used; reduced motion displays the same still.

Gold film: `film.mjs --still --gate` reported complete one-frame coverage and `rehearsal passed`, with a non-gating lopsided-row warning in the original selected customer row.

Adapted Stage: `film.mjs --still --gate` at viewport widths 1200 and 390 reported complete one-frame coverage, `no-issues-detected`, and `rehearsal passed` for both. An initial near-alignment finding in the sidebar was resolved by aligning the text. `stage-desktop.png` and `stage-compact.png` retain the film output. The actual 400 × 300 wide and 358 × 300 compact stages were exported at 2× to the production PNGs and visually inspected. They retain the gold's focal satellite and crop; the case outcome is the strongest element. This is a still-frame check, not a motion rehearsal.

Earlier plain-markup host checks are superseded by the Stage export. The old static-server layout check was inconclusive because it found no supported controls and the server returned a 404 for `/api/v1/personas`; it did not test a live workflow.

Setup: the first project-local `npm ci` failed when its esbuild child could not find `node`; `npm ci --ignore-scripts` allowed the preview and film tools to run. The disposable preview and npm cache are in `var/stageshow-rehearsal`; retain for at most 30 days, then remove only after confirming no process uses them. Keep the editable adaptation, licence, accepted assets and this verification evidence.

Not checked: other browsers, physical devices and assistive technology. This is an illustration rehearsal, not acceptance of the case workflow.

Final host: fresh final-host-390.png and final-host-1200.png show the installed image after integration. Browser checks confirmed the compact (716px source) and desktop (800px source) images load at the intended breakpoints; process layout scroll width equalled client width at each viewport (343 and 1153px).
