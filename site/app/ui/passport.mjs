import { loadThree } from '../passport/library.mjs';
import { React, html, useEffect, useRef, useState } from '../runtime.mjs';
import { fontsReady } from '../passport/fonts.mjs';
import { loadPhoto } from '../passport/photo.mjs';
import { TEX } from '../passport/pages.mjs';
import { PASSPORT_SPREADS, createViewer } from '../passport/renderer.mjs';

function Viewer({ person, label }) {
  const box = useRef(null),
    api = useRef(null),
    widget = useRef(null),
    expandButton = useRef(null),
    closeButton = useRef(null),
    slotHeight = useRef(0);
  const latest = useRef(person);
  latest.current = person;
  const uid = React.useId();
  const [state, setState] = useState('loading'),
    [fb, setFb] = useState(''),
    [expanded, setExpanded] = useState(false);
  const [controls, setControls] = useState({
    zoom: 100,
    spread: 0,
    open: true,
    busy: false,
    framing: 'spread',
    mode: 'rotate',
  });
  useEffect(() => {
    let dead = false;
    let started = false;
    const start = async () => {
      if (started || dead) return;
      started = true;
      await fontsReady();
      while (!dead) {
        const selected = latest.current;
        await loadPhoto(selected);
        if (selected === latest.current) break;
      }
      if (dead) return;
      const fallback = () => {
        if (dead) return;
        api.current?.dispose();
        api.current = null;
        setFb(TEX.dataPage(latest.current).toDataURL('image/jpeg', 0.95));
        setState('fallback');
      };
      try {
        await loadThree();
        if (dead) return;
        api.current = createViewer(
          box.current,
          (value) => {
            if (!dead) setControls(value);
          },
          fallback,
        );
        api.current.setPersona(latest.current);
        setState('ready');
      } catch (error) {
        console.warn('Passport 3D could not start:', error);
        fallback();
      }
    };
    let observer;
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            start();
          }
        },
        { rootMargin: '200px' },
      );
      observer.observe(box.current);
    } else start();
    return () => {
      observer?.disconnect();
      dead = true;
      api.current?.dispose();
      api.current = null;
    };
  }, []);
  useEffect(() => {
    if (!api.current && state !== 'fallback') return;
    let cancelled = false;
    loadPhoto(person).then(() => {
      if (cancelled || latest.current !== person) return;
      if (api.current) api.current.setPersona(person);
      else if (state === 'fallback') setFb(TEX.dataPage(person).toDataURL('image/jpeg', 0.95));
    });
    return () => {
      cancelled = true;
    };
  }, [person.id]);
  useEffect(() => {
    if (!expanded) return;
    const previous = document.activeElement,
      hidden = [];
    // Keep the viewer's ancestor path active while making every other branch inert.
    for (let node = widget.current; node && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement?.children || []) {
        if (sibling !== node && sibling instanceof HTMLElement) {
          hidden.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      }
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    api.current?.setInspection(true);
    const frame = requestAnimationFrame(() => closeButton.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      for (const [node, inert] of hidden) node.inert = inert;
      document.body.style.overflow = overflow;
      api.current?.setInspection(false);
      const target = expandButton.current || previous;
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [expanded]);
  const toggle = () => api.current?.setOpen(!controls.open);
  const key = (e) => {
    if (!api.current || e.ctrlKey || e.metaKey || e.altKey) return;
    const move = {
      ArrowLeft: [-0.15, 0],
      ArrowRight: [0.15, 0],
      ArrowUp: [0, -0.1],
      ArrowDown: [0, 0.1],
    }[e.key];
    if (move) {
      e.preventDefault();
      api.current.nudge(...move);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      api.current.setZoom(controls.zoom + 10);
    } else if (e.key === '-') {
      e.preventDefault();
      api.current.setZoom(controls.zoom - 10);
    } else if (e.key === 'Home' || e.key === '0') {
      e.preventDefault();
      api.current.reset();
    } else if (e.key === 'PageDown' || e.key === 'PageUp') {
      e.preventDefault();
      api.current.setSpread(controls.spread + (e.key === 'PageDown' ? 1 : -1));
    }
  };
  const modalKey = (e) => {
    if (!expanded) return;
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      setExpanded(false);
    } else if (e.key === 'Tab') {
      const items = [
        ...widget.current.querySelectorAll(
          'button:not(:disabled),select:not(:disabled),input:not(:disabled),summary,[tabindex="0"]',
        ),
      ].filter((node) => node.getClientRects().length);
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  };
  return html`<div
    className="passport-widget"
    style=${expanded ? { height: slotHeight.current + 'px' } : undefined}
  >
    <div
      ref=${widget}
      className=${'vbox' + (expanded ? ' is-expanded' : '')}
      role=${expanded ? 'dialog' : 'group'}
      aria-modal=${expanded ? 'true' : undefined}
      aria-label=${'Interactive passport of ' + person.name}
      onKeyDown=${modalKey}
    >
      ${
        expanded &&
        html`<div className="vtitle">
          <div><b>${person.name}</b><span className="mono">${person.id} · Demo passport</span></div>
          <button
            className="vbtn"
            type="button"
            ref=${closeButton}
            onClick=${() => setExpanded(false)}
          >
            Close enlarged view
          </button>
        </div>`
      }
      <div
        className=${'viewer' + (controls.mode === 'pan' ? ' pan-mode' : '')}
        ref=${box}
        tabindex="0"
        role="img"
        onKeyDown=${key}
        aria-label=${label || 'Passport ' + person.id + ' of ' + person.name}
        aria-describedby=${uid + '-help'}
      >
        ${state === 'loading' && html`<div className="vmsg" role="status">Loading the passport</div>`}
        ${state === 'fallback' && html`<div className="vmsg"><img src=${fb} alt=${'Data page of demo passport ' + person.id} /></div>`}
      </div>
      <div className="vpanel">
        <fieldset className="vtools" disabled=${state !== 'ready'} aria-label="Passport controls">
          <div className="vpages">
            <button
              className="vbtn"
              type="button"
              aria-label="Previous pages"
              disabled=${controls.busy || controls.spread === 0}
              onClick=${() => api.current.setSpread(controls.spread - 1)}
            >
              Previous</button
            ><span className="vpage-status" role="status"
              >${controls.busy ? 'Turning pages…' : PASSPORT_SPREADS[controls.spread]}<small
                >Spread ${controls.spread + 1} of ${PASSPORT_SPREADS.length}</small
              ></span
            ><button
              className="vbtn"
              type="button"
              aria-label="Next pages"
              disabled=${controls.busy || controls.spread === PASSPORT_SPREADS.length - 1}
              onClick=${() => api.current.setSpread(controls.spread + 1)}
            >
              Next
            </button>
          </div>
          <div className="vtoolbar">
            ${
              !expanded &&
              html`<button
                className="vbtn"
                type="button"
                ref=${expandButton}
                aria-label="Enlarge passport"
                onClick=${() => {
                  slotHeight.current = widget.current.getBoundingClientRect().height;
                  setExpanded(true);
                }}
              >
                Enlarge
              </button>`
            }
            <details className="vsettings">
              <summary>Adjust view</summary>
              <div className="vsettings-body">
                <div className="voptions">
                  <label className="vframe"
                    >View<select
                      value=${controls.framing}
                      onChange=${(e) => api.current.setFraming(e.target.value)}
                    >
                      <option value="spread">Whole passport</option>
                      <option value="left">Left page</option>
                      <option value="right">Right page</option>
                    </select></label
                  >
                  <div className="vzoom">
                    <button
                      className="vbtn"
                      type="button"
                      aria-label="Zoom out"
                      disabled=${controls.zoom <= 100}
                      onClick=${() => api.current.setZoom(controls.zoom - 10)}
                    >
                      −</button
                    ><label
                      ><span className="sr">Passport zoom</span
                      ><input
                        type="range"
                        min="100"
                        max="250"
                        step="1"
                        value=${controls.zoom}
                        aria-valuetext=${controls.zoom + ' percent'}
                        onChange=${(e) => api.current.setZoom(Number(e.target.value))} /></label
                    ><output>${controls.zoom}%</output
                    ><button
                      className="vbtn"
                      type="button"
                      aria-label="Zoom in"
                      disabled=${controls.zoom >= 250}
                      onClick=${() => api.current.setZoom(controls.zoom + 10)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="vactions">
                  <div className="vmodes" role="group" aria-label="Drag action">
                    <button
                      className="vbtn"
                      type="button"
                      aria-pressed=${controls.mode === 'rotate'}
                      onClick=${() => api.current.setMode('rotate')}
                    >
                      Rotate</button
                    ><button
                      className="vbtn"
                      type="button"
                      aria-pressed=${controls.mode === 'pan'}
                      onClick=${() => api.current.setMode('pan')}
                    >
                      Move
                    </button>
                  </div>
                  <button className="vbtn" type="button" onClick=${toggle}>
                    ${controls.open ? 'Close passport' : 'Open passport'}</button
                  ><button className="vbtn" type="button" onClick=${() => api.current.reset()}>
                    Straighten
                  </button>
                </div>
              </div>
            </details>
          </div>
        </fieldset>
        <p className="vhint" id=${uid + '-help'}>
          ${state === 'fallback' ? '3D is unavailable. Showing the data page.' : expanded ? 'Drag to rotate. Escape closes this view.' : 'Drag to rotate. Use the arrows to turn pages.'}
          <span className="sr"
            >Arrow keys rotate, +/− zoom, Page Up/Down turn pages. Adjust view contains zoom,
            framing and movement controls.</span
          >
        </p>
      </div>
    </div>
  </div>`;
}

export { Viewer };
