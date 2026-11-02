import { html, useEffect, useRef, useState } from '../runtime.mjs';
import { searchPeople } from '../domain/search.mjs';
import { PEOPLE } from '../domain/registry.mjs';
import { navigate } from '../domain/routing.mjs';
import { NOTICE, nvars } from '../domain/notices.mjs';

function Palette({ onClose }) {
  const [q, setQ] = useState('');
  const [act, setAct] = useState(0);
  const inp = useRef(null);
  const close = useRef(null);
  const prev = useRef(document.activeElement);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inp.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      if (prev.current?.isConnected) prev.current.focus({ preventScroll: true });
    };
  }, []);
  const result = searchPeople(q),
    approximate = !result.matches.length && result.suggestions.length > 0;
  const people = q.trim() ? (approximate ? result.suggestions : result.matches) : PEOPLE;
  const actions = [
    ['Browse all notices', 'notices'],
    ['Compare personas', 'compare'],
    ['Register a persona', 'apply'],
    ['Report a persona', 'report'],
    ['Registry home', 'home'],
  ].filter((a) => !q.trim() || a[0].toLowerCase().includes(q.trim().toLowerCase()));
  const items = [
    ...people.map((p) => ({ k: p.id, go: p.id, p })),
    ...actions.map((a) => ({ k: a[1], go: a[1], label: a[0] })),
  ];
  const go = (it) => {
    onClose();
    navigate(it.go);
  };
  const key = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAct((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAct((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[act] && go(items[act]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };
  useEffect(() => {
    document
      .getElementById(items[act] ? 'pi-' + items[act].k : '')
      ?.scrollIntoView({ block: 'nearest' });
  }, [act, q]);
  const dialogKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
    if (e.key === 'Tab') {
      const nodes = e.currentTarget.querySelectorAll('input,button,a[href]'),
        first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  let idx = -1;
  const row = (it) => {
    idx++;
    const i = idx;
    const sel = i === act;
    return it.p
      ? html`<li
          key=${it.k}
          id=${'pi-' + it.k}
          role="option"
          aria-selected=${sel ? 'true' : 'false'}
          onMouseMove=${() => setAct(i)}
          onMouseDown=${(e) => {
            e.preventDefault();
            go(it);
          }}
          style=${nvars(it.p.status)}
        >
          <img src=${it.p.src} alt="" /><span className="t"
            ><b>${it.p.name}</b><span className="mono">${it.p.id} ${it.p.handle}</span></span
          ><span className="sw" aria-hidden="true"></span
          ><span className="sr">${NOTICE[it.p.status].name}</span>
        </li>`
      : html`<li
          key=${it.k}
          id=${'pi-' + it.k}
          role="option"
          aria-selected=${sel ? 'true' : 'false'}
          onMouseMove=${() => setAct(i)}
          onMouseDown=${(e) => {
            e.preventDefault();
            go(it);
          }}
        >
          <span className="t"><b>${it.label}</b></span>
        </li>`;
  };
  return html`<div
    className="pal-bg"
    onMouseDown=${(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <div
      className="pal"
      role="dialog"
      aria-modal="true"
      aria-label="Search the registry"
      onKeyDown=${dialogKey}
    >
      <input
        ref=${inp}
        value=${q}
        onChange=${(e) => {
          setQ(e.target.value);
          const result = searchPeople(e.target.value);
          setAct(result.suggestions.length || result.matches.length > 1 ? -1 : 0);
        }}
        onKeyDown=${key}
        placeholder="Name, handle, passport number or a page"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls="pal-list"
        aria-describedby="pal-status"
        aria-activedescendant=${items[act] ? 'pi-' + items[act].k : undefined}
        aria-label="Search the registry"
      />
      <button className="close" type="button" ref=${close} onClick=${onClose}>Close</button>
      <p className="sr" id="pal-status" role="status">
        ${approximate ? people.length + ' similar name suggestion' + (people.length === 1 ? '' : 's') + '. Use the arrow keys to choose a suggestion.' : items.length + ' result' + (items.length === 1 ? '' : 's') + '.'}
      </p>
      <ul id="pal-list" role="listbox" aria-label="Results">
        ${people.length > 0 && html`<li className="grp" role="presentation">${approximate ? 'Did you mean? Similar names — choose one to open.' : 'Personas'}</li>`}
        ${items.filter((i) => i.p).map(row)}
        ${actions.length > 0 && html`<li className="grp" role="presentation">Pages</li>`}
        ${items.filter((i) => !i.p).map(row)}
        ${!items.length && html`<li className="grp" role="presentation">Nothing matches “${q}”. Try a passport number like PP-AZ-0001.</li>`}
      </ul>
      <div className="pal-browse">
        <a href="#notices" onClick=${onClose}>Browse all personas</a>
      </div>
      <div className="foot">
        <span><span className="kbd">↑</span> <span className="kbd">↓</span> to move</span
        ><span><span className="kbd">Enter</span> to open</span
        ><span><span className="kbd">Esc</span> to close</span>
      </div>
    </div>
  </div>`;
}

export { Palette };
