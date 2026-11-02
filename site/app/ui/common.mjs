import { React, html, useCallback, useMemo, useRef, useState } from '../runtime.mjs';
import { EMB } from './emblem-data.mjs';
import { NOTICE, nvars } from '../domain/notices.mjs';

function useMeasuredHeight(selector, property) {
  React.useLayoutEffect(() => {
    const element = document.querySelector(selector);
    if (!element) return;
    const update = () =>
      document.documentElement.style.setProperty(
        property,
        Math.ceil(element.getBoundingClientRect().height) + 'px',
      );
    update();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(element);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      document.documentElement.style.removeProperty(property);
    };
  }, [selector, property]);
}

let embN = 0;

function Emblem({ size, color }) {
  const E = EMB;
  const id = useMemo(() => 'emb' + ++embN, []);
  const star = [];
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 1.5 : 4.4,
      a = -Math.PI / 2 + (i * Math.PI) / 4;
    star.push(
      (E.cx + r * Math.cos(a)).toFixed(2) + ',' + (E.cy - E.gr - 8 + r * Math.sin(a)).toFixed(2),
    );
  }
  return html`<svg width=${size} height=${size} viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <clipPath id=${id}><circle cx=${E.cx} cy=${E.cy} r=${E.gr}></circle></clipPath>
    </defs>
    <g fill="none" stroke=${color} strokeWidth="1.5">
      <circle cx=${E.cx} cy=${E.cy} r=${E.gr}></circle>
      <g clipPath=${'url(#' + id + ')'} strokeWidth="0.9">
        <ellipse cx=${E.cx} cy=${E.cy} rx=${E.gr * 0.5} ry=${E.gr}></ellipse>
        <ellipse cx=${E.cx} cy=${E.cy} rx=${E.gr * 0.87} ry=${E.gr}></ellipse>
        <line x1=${E.cx} y1=${E.cy - E.gr} x2=${E.cx} y2=${E.cy + E.gr}></line>
        ${[-0.5, 0, 0.5].map((k) => html`<line key=${k} x1=${E.cx - E.gr} y1=${E.cy + E.gr * k} x2=${E.cx + E.gr} y2=${E.cy + E.gr * k}></line>`)}
      </g>
      <path d=${E.stemL} strokeWidth="1.1"></path>
      <path d=${E.stemR} strokeWidth="1.1"></path>
    </g>
    <g fill=${color}>
      ${E.leaves.map((l, i) => html`<ellipse key=${i} cx="0" cy="0" rx=${4.4 * l.s} ry=${1.75 * l.s} transform=${'translate(' + l.x.toFixed(2) + ' ' + l.y.toFixed(2) + ') rotate(' + l.rot.toFixed(1) + ')'}></ellipse>`)}
      <polygon points=${star.join(' ')}></polygon>
    </g>
  </svg>`;
}

function Globe() {
  const R = 48,
    c = 50,
    mer = [0.18, 0.42, 0.64, 0.82, 0.95],
    par = [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75];
  return html`<svg
    className="globe"
    viewBox="0 0 100 100"
    preserveAspectRatio="xMidYMid meet"
    aria-hidden="true"
  >
    <g fill="none" stroke="#fff" strokeWidth="0.18">
      <circle cx=${c} cy=${c} r=${R}></circle>
      ${mer.map((k) => html`<ellipse key=${k} cx=${c} cy=${c} rx=${R * k} ry=${R}></ellipse>`)}
      <line x1=${c} y1=${c - R} x2=${c} y2=${c + R}></line>
      ${par.map((k) => {
        const y = c + R * k,
          w = R * Math.sqrt(1 - k * k);
        return html`<line key=${k} x1=${c - w} y1=${y} x2=${c + w} y2=${y}></line>`;
      })}
    </g>
  </svg>`;
}

const NTag = ({ status }) =>
  html`<span className="ntag" style=${nvars(status)}
    ><i aria-hidden="true"></i>${NOTICE[status].name}</span
  >`;

function useToast() {
  const [msg, setMsg] = useState('');
  const t = useRef(0);
  const show = useCallback((m) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = setTimeout(() => setMsg(''), 2600);
  }, []);
  return [msg, show];
}

async function copy(text, label, toast) {
  try {
    await navigator.clipboard.writeText(text);
    toast(label + ' copied');
  } catch (e) {
    toast('Copying is blocked here. Select it by hand: ' + text);
  }
}

export { useMeasuredHeight, embN, Emblem, Globe, NTag, useToast, copy };
