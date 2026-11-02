import { refreshPeople } from './domain/registry.mjs';
import { ReactDOM, html } from './runtime.mjs';
import { App } from './shell.mjs';

async function boot() {
  if (location.protocol !== 'file:') {
    try {
      await refreshPeople();
    } catch (e) {
      /* The standalone demo remains available if no backend is present. */
    }
  }
  ReactDOM.createRoot(document.getElementById('app')).render(html`<${App} />`);
}

boot();

export { boot };
