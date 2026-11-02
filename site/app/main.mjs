import { BODY_PHOTOS, PEOPLE, PHOTOS } from './domain/registry.mjs';
import { ReactDOM, html } from './runtime.mjs';
import { App } from './shell.mjs';

async function boot() {
  if (location.protocol !== 'file:') {
    try {
      const response = await fetch('/api/v1/personas', { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.personas))
          PEOPLE.splice(
            0,
            PEOPLE.length,
            ...data.personas.map((p) => ({ ...p, src: PHOTOS[p.id], bodySrc: BODY_PHOTOS[p.id] })),
          );
      }
    } catch (e) {
      /* The standalone demo remains available if no backend is present. */
    }
  }
  ReactDOM.createRoot(document.getElementById('app')).render(html`<${App} />`);
}

boot();

export { boot };
