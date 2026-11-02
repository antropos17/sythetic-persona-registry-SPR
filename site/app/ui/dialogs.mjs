import { React, html, useEffect, useRef, useState } from '../runtime.mjs';
import { PEOPLE } from '../domain/registry.mjs';
import { normalizeSearch, searchPeople } from '../domain/search.mjs';
import { navigate } from '../domain/routing.mjs';
import { comparisonRoute } from '../domain/comparison.mjs';

function Dialog({ title, className = '', onClose, onKeyDown, children }) {
  const ref = useRef(null),
    closeAction = useRef(onClose),
    heading = React.useId();
  closeAction.current = onClose;
  React.useLayoutEffect(() => {
    const dialog = ref.current,
      previous = document.activeElement,
      overflow = document.body.style.overflow;
    const position = { top: scrollY, left: scrollX, behavior: 'instant' };
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    (dialog.querySelector('[data-initial-focus]') || dialog.querySelector('button'))?.focus({
      preventScroll: true,
    });
    window.scrollTo(position);
    const leave = () => closeAction.current();
    window.addEventListener('hashchange', leave);
    return () => {
      window.removeEventListener('hashchange', leave);
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const key = (e) => {
    e.stopPropagation();
    if (e.key === 'Tab') {
      const nodes = [
        ...ref.current.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary,[tabindex="0"]',
        ),
      ].filter((node) => node.getClientRects().length);
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    onKeyDown?.(e);
  };
  return html`<dialog
    ref=${ref}
    className=${'ui-dialog ' + className}
    aria-labelledby=${heading}
    onCancel=${(e) => {
      e.preventDefault();
      onClose();
    }}
    onKeyDown=${key}
  >
    <header className="dialog-head">
      <h2 id=${heading}>${title}</h2>
      <button type="button" className="btn line" onClick=${onClose}>Close</button>
    </header>
    <div className="dialog-body">${children}</div>
  </dialog>`;
}

function NameSuggestions({ people, onSelect }) {
  if (!people.length) return null;
  return html`<div className="search-suggestions">
    <b>Did you mean?</b>
    <p>Similar names. Choose a suggestion to continue.</p>
    <ul>
      ${people.map((p) => html`<li key=${p.id}>${onSelect ? html`<button type="button" className="tlink" onClick=${() => onSelect(p)}>${p.name}</button>` : html`<a href=${'#' + p.id}>${p.name}</a>`}</li>`)}
    </ul>
  </div>`;
}

function ComparePicker({ person, onClose }) {
  const [q, setQ] = useState('');
  const pool = PEOPLE.filter((p) => p.id !== person.id),
    result = searchPeople(q, pool);
  const rows = normalizeSearch(q)
    ? result.matches.length
      ? result.matches
      : result.suggestions
    : pool;
  const approximate = !result.matches.length && result.suggestions.length > 0;
  const choose = (p) => {
    onClose();
    navigate(comparisonRoute([person.id, p.id]));
  };
  return html`<${Dialog} title="Choose a second persona" onClose=${onClose}>
    <div className="compare-anchor"><img src=${person.src} alt="" /><div><small>First persona</small><b>${person.name}</b><small className="mono">${person.id}</small></div></div>
    <label className="picker-label" htmlFor="compare-search">Find the second persona</label><input className="in" id="compare-search" type="search" autoComplete="off" data-initial-focus value=${q} onChange=${(e) => setQ(e.target.value)} placeholder="Name, handle or passport number" aria-describedby="compare-picker-count" />
    <p className="picker-count" id="compare-picker-count" role="status">${approximate ? 'No exact match. Similar names (' + rows.length + ').' : rows.length + ' persona' + (rows.length === 1 ? '' : 's') + ' available.'} ${rows.length ? 'Choose one to open the comparison.' : 'Try another name or show all choices.'}</p>
    <ul className="persona-picks">${rows.map(
      (p) =>
        html`<li key=${p.id}>
          <button
            className="persona-pick"
            type="button"
            onClick=${() => choose(p)}
            aria-label=${'Compare ' + person.name + ' with ' + p.name}
          >
            <img src=${p.src} alt="" /><span
              ><b>${p.name}</b><small>${p.role}</small><small className="mono">${p.id}</small></span
            ><span className="pick-action" aria-hidden="true">Compare</span>
          </button>
        </li>`,
    )}</ul>
    ${
      !rows.length &&
      html`<p>
        No matching persona.
        <button
          type="button"
          className="tlink"
          onClick=${() => {
            setQ('');
            document.getElementById('compare-search')?.focus();
          }}
        >
          Show all choices
        </button>
      </p>`
    }
  </Dialog>`;
}

function ImageViewer({ person, initialIndex, onClose }) {
  const [index, setIndex] = useState(initialIndex),
    [zoom, setZoom] = useState(100),
    [bounds, setBounds] = useState({ width: 0, height: 0 }),
    [natural, setNatural] = useState(null),
    [error, setError] = useState(false),
    [dragging, setDragging] = useState(false);
  const stage = useRef(null),
    drag = useRef(null);
  const images = [
      { src: person.src, label: 'Face portrait' },
      { src: person.bodySrc, label: 'Full-length image' },
    ],
    selected = images[index];
  const select = (value) => {
    if (value === index) return;
    setIndex(value);
    setZoom(100);
    setNatural(null);
    setError(false);
  };
  const scale = (value) =>
    setZoom((current) =>
      Math.max(100, Math.min(300, typeof value === 'function' ? value(current) : value)),
    );
  useEffect(() => {
    const node = stage.current;
    const measure = () =>
      setBounds({
        width: Math.max(1, node.clientWidth - 32),
        height: Math.max(1, Math.floor(node.getBoundingClientRect().height) - 32),
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const dimensions = natural || {
    width: index === 0 ? 800 : 1000,
    height: index === 0 ? 1000 : 1500,
  };
  const fit = Math.min(bounds.width / dimensions.width, bounds.height / dimensions.height);
  const width = Math.floor((dimensions.width * fit * zoom) / 100),
    height = Math.floor((dimensions.height * fit * zoom) / 100);
  React.useLayoutEffect(() => {
    const node = stage.current;
    if (node) {
      node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2;
      node.scrollTop = (node.scrollHeight - node.clientHeight) / 2;
    }
  }, [zoom, index]);
  const key = (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      scale((value) => value + 25);
    } else if (e.key === '-') {
      e.preventDefault();
      scale((value) => value - 25);
    } else if (e.key === '0') {
      e.preventDefault();
      scale(100);
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault();
      select(1 - index);
    }
  };
  const start = (e) => {
    if (zoom <= 100 || e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      left: e.currentTarget.scrollLeft,
      top: e.currentTarget.scrollTop,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const move = (e) => {
    if (!drag.current) return;
    e.currentTarget.scrollLeft = drag.current.left + drag.current.x - e.clientX;
    e.currentTarget.scrollTop = drag.current.top + drag.current.y - e.clientY;
  };
  const end = () => {
    drag.current = null;
    setDragging(false);
  };
  return html`<${Dialog} title=${'Images of ' + person.name} className="image-dialog" onClose=${onClose} onKeyDown=${key}>
    <div className="image-tools">
    <div className="image-toolbar"><div className="image-tabs" role="group" aria-label="Choose image">${images.map((item, i) => html`<button type="button" key=${item.label} aria-pressed=${index === i} onClick=${() => select(i)}>${item.label}</button>`)}</div>
      <div className="image-zoom" role="group" aria-label="Image zoom"><button type="button" aria-label="Zoom out" disabled=${zoom <= 100} onClick=${() => scale((value) => value - 25)}>−</button><output aria-label="Zoom level" aria-live="polite">${zoom}%</output><button type="button" aria-label="Zoom in" disabled=${zoom >= 300} onClick=${() => scale((value) => value + 25)}>+</button><button type="button" onClick=${() => scale(100)}>Fit image</button></div>
    </div>
    <div className="image-caption"><p role="status"><b>${index + 1} of 2 · ${selected.label}.</b> AI-generated fictional illustration. Not identity evidence.</p><details className="image-help"><summary>Controls and shortcuts</summary><p id="image-help">Zoom with +/−, then scroll or drag to explore. Page Up/Down switches images. 0 fits the image. Esc closes.</p></details></div>
    </div>
    <div ref=${stage} className="image-stage" role="region" aria-label="Image area" aria-describedby="image-help" tabIndex="0" data-zoomed=${zoom > 100} data-dragging=${dragging} onPointerDown=${start} onPointerMove=${move} onPointerUp=${end} onPointerCancel=${end} onLostPointerCapture=${end}>
      <div className="image-canvas" style=${{ width: width + 32, height: height + 32 }}>${error ? html`<p role="status">This image could not load. Try the other image or close and reopen this viewer.</p>` : html`<img key=${selected.src} src=${selected.src} alt=${selected.label + ' of ' + person.name} draggable="false" style=${{ width, height }} onLoad=${(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} onError=${() => setError(true)} />`}</div>
    </div>
  </Dialog>`;
}

export { Dialog, NameSuggestions, ComparePicker, ImageViewer };
