import { Emblem, useMeasuredHeight, useToast } from './ui/common.mjs';
import { React, ReactDOM, html, useEffect, useRef, useState } from './runtime.mjs';
import { handleRouteLink, navigate, parse } from './domain/routing.mjs';
import { SAVED_KEY, restoreSaved, store } from './domain/storage.mjs';
import { catalogRoute, readCatalogQuery, writeCatalogHistory } from './domain/catalog.mjs';
import { toggleComparisonSelection } from './domain/comparison.mjs';
import { byId } from './domain/registry.mjs';
import { Record } from './pages/record.mjs';
import { Compare } from './pages/compare.mjs';
import { Apply } from './pages/application.mjs';
import { Report } from './pages/report.mjs';
import { CaseAccess, CasePage } from './pages/cases.mjs';
import { ReviewConsole } from './pages/review.mjs';
import { Home } from './pages/home.mjs';
import { Palette } from './ui/palette.mjs';

function App() {
  useMeasuredHeight('.hdr', '--header-height');
  const menuButton = useRef(null);
  const [route, setRoute] = useState(parse);
  const routeRef = useRef(route);
  const prevRef = useRef(null);
  const [pal, setPal] = useState(false);
  const [menu, setMenu] = useState(false);
  const [msg, toast] = useToast();
  const [savedRecords, setSavedRecords] = useState(() => restoreSaved(store.get(SAVED_KEY)));
  const [comparisonIds, setComparisonIds] = useState([]);
  const [catalog, setCatalogState] = useState(() => ({
    ...readCatalogQuery(route.catalogQuery),
    view: store.get('spr-view')?.view === 'list' ? 'list' : 'grid',
    mobileView: store.get('spr-view-mobile')?.view === 'list' ? 'list' : 'grid',
    filtersOpen: false,
  }));
  const catalogRef = useRef(catalog),
    handledHash = useRef(location.hash);
  const setCatalog = (update, options) => {
    const current = catalogRef.current,
      next = typeof update === 'function' ? update(current) : update;
    catalogRef.current = next;
    setCatalogState(next);
    if (catalogRoute(current) === catalogRoute(next)) return;
    writeCatalogHistory(next, options);
    handledHash.current = location.hash;
    const nextRoute = { ...parse(), preserveScroll: true };
    routeRef.current = nextRoute;
    setRoute(nextRoute);
  };
  const catalogPosition = useRef(null);
  const toggleComparison = (id) =>
    setComparisonIds((current) => toggleComparisonSelection(current, id));
  useEffect(() => {
    store.set(SAVED_KEY, savedRecords);
  }, [savedRecords]);
  const toggleSaved = (id) =>
    setSavedRecords((current) =>
      current.includes(id) ? current.filter((saved) => saved !== id) : [...current, id],
    );
  useEffect(() => {
    const previousRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    const on = (event) => {
      // A Back/Forward traversal may emit both popstate and hashchange.
      if (event.isTrusted && location.hash === handledHash.current) return;
      let r = parse();
      handledHash.current = location.hash;
      const current = routeRef.current;
      if (event.isTrusted && current.name === 'notices' && r.name === 'notices')
        r.preserveScroll = true;
      if (
        (current.name === 'home' || current.name === 'notices') &&
        r.name !== 'home' &&
        r.name !== 'notices'
      ) {
        const bounds = document.getElementById('notices')?.getBoundingClientRect();
        catalogPosition.current =
          bounds && bounds.top < innerHeight && bounds.bottom > 0
            ? {
                top: scrollY,
                source: current.name,
                record:
                  document.activeElement?.closest('[data-catalog-record]')?.dataset.catalogRecord,
              }
            : null;
      }
      routeRef.current = r;
      ReactDOM.flushSync(() => {
        if (r.name === 'notices') {
          const next = { ...catalogRef.current, ...readCatalogQuery(r.catalogQuery) };
          catalogRef.current = next;
          setCatalogState(next);
        }
        setRoute(r);
      });
    };
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    const k = (e) => {
      const typing =
        /input|textarea|select/i.test((document.activeElement || {}).tagName || '') ||
        document.activeElement?.isContentEditable;
      if (e.defaultPrevented || e.isComposing || typing) return;
      if (
        (e.key === 'k' && (e.metaKey || e.ctrlKey)) ||
        (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey)
      ) {
        e.preventDefault();
        setPal(true);
      }
    };
    window.addEventListener('keydown', k);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
      window.removeEventListener('keydown', k);
      history.scrollRestoration = previousRestoration;
    };
  }, []);
  useEffect(() => {
    setMenu(false);
  }, [route.name, route.id]);
  useEffect(() => {
    if (!menu) return;
    const k = (e) => {
      if (e.key === 'Escape') {
        setMenu(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [menu]);
  React.useLayoutEffect(() => {
    const prev = prevRef.current;
    prevRef.current = route;
    routeRef.current = route;
    document.title =
      route.name === 'record'
        ? byId(route.id).name + ' | Synthetic Persona Registry'
        : route.name === 'compare'
          ? 'Compare personas | Synthetic Persona Registry'
          : route.name === 'apply'
            ? 'Register a persona | Synthetic Persona Registry'
            : route.name === 'report'
              ? 'Report a persona | Synthetic Persona Registry'
              : route.name === 'notices'
                ? 'Notices | Synthetic Persona Registry'
                : route.name === 'case' || route.name === 'case-status'
                  ? 'Case status | Synthetic Persona Registry'
                  : route.name === 'review'
                    ? 'Review console | Synthetic Persona Registry'
                    : 'Synthetic Persona Registry';
    if (route.preserveScroll) return;
    if (prev && prev.name === 'compare' && route.name === 'compare') return;
    if (route.name === 'record' && route.section) return;
    const position = catalogPosition.current;
    if (
      prev &&
      prev.name !== 'home' &&
      prev.name !== 'notices' &&
      position &&
      (route.name === 'notices' || (route.name === 'home' && position.source === 'home'))
    ) {
      const target =
        (position.record &&
          document.querySelector('[data-catalog-record="' + position.record + '"]')) ||
        document.getElementById('n-h');
      target?.focus({ preventScroll: true });
      window.scrollTo({ top: position.top, behavior: 'instant' });
      return;
    }
    if (route.name === 'notices') {
      const el = document.getElementById('notices');
      el && el.scrollIntoView({ behavior: 'instant' });
      document.getElementById('n-h')?.focus({ preventScroll: true });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    const h = document.getElementById('h1');
    if (h && route.name !== 'home') h.focus({ preventScroll: true });
  }, [route]);
  const onReport = (p) => navigate('report/' + p.id);
  const view =
    route.name === 'record'
      ? html`<${Record}
          key="rec"
          person=${byId(route.id)}
          route=${route}
          toast=${toast}
          onReport=${onReport}
          savedRecords=${savedRecords}
          toggleSaved=${toggleSaved}
        />`
      : route.name === 'compare'
        ? html`<${Compare}
            ids=${route.ids}
            onlyDifferences=${route.differences === true}
            toast=${toast}
          />`
        : route.name === 'apply'
          ? html`<${Apply} toast=${toast} />`
          : route.name === 'report'
            ? html`<${Report}
                key=${route.id || 'general'}
                prefill=${byId(route.id)}
                toast=${toast}
              />`
            : route.name === 'case-status'
              ? html`<${CaseAccess} />`
              : route.name === 'case'
                ? html`<${CasePage}
                    key=${route.id}
                    caseId=${route.id}
                    accessToken=${route.accessToken}
                    toast=${toast}
                  />`
                : route.name === 'review'
                  ? html`<${ReviewConsole} />`
                  : html`<${Home}
                      savedRecords=${savedRecords}
                      toggleSaved=${toggleSaved}
                      comparisonIds=${comparisonIds}
                      toggleComparison=${toggleComparison}
                      catalog=${catalog}
                      setCatalog=${setCatalog}
                    />`;
  const cur = route.name === 'record' || route.name === 'notices' ? 'notices' : route.name;
  return html`<div onClick=${(event) => handleRouteLink(event, catalogRoute(catalog))}>
    <a
      className="skip"
      href="#main"
      inert=${pal ? '' : undefined}
      aria-hidden=${pal ? 'true' : undefined}
      onClick=${(e) => {
        e.preventDefault();
        const m = document.getElementById('main');
        m && m.focus();
      }}
      >Skip to main content</a
    >
    <div className="util" inert=${pal ? '' : undefined} aria-hidden=${pal ? 'true' : undefined}>
      <div className="wrap">
        <span
          ><span className="u-long"
            >Independent registry of AI personas. Not a government or police body.</span
          ><span className="u-short"
            >Independent registry, not a government body. Demo data.</span
          ></span
        ><span>Demo data</span>
      </div>
    </div>
    <header className="hdr" inert=${pal ? '' : undefined} aria-hidden=${pal ? 'true' : undefined}>
      <div className="wrap">
        <a
          className="brand"
          href="#home"
          onClick=${() => {
            catalogPosition.current = null;
          }}
          aria-label="Synthetic Persona Registry, home"
          ><${Emblem} size=${50} color="#fff" /><span className="wm" aria-hidden="true"
            ><b>SPR</b><small>SYNTHETIC PERSONA REGISTRY</small></span
          ></a
        >
        <div className="hbtns">
          <button
            type="button"
            className="ibtn"
            onClick=${() => {
              setMenu(false);
              setPal(true);
            }}
            aria-label="Search the registry"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="10.5" cy="10.5" r="6.5"></circle>
              <path d="M20 20l-4.6-4.6"></path>
            </svg>
          </button>
          <button
            type="button"
            className="ibtn menu"
            ref=${menuButton}
            aria-label=${menu ? 'Close menu' : 'Open menu'}
            aria-expanded=${menu ? 'true' : 'false'}
            aria-controls="mainnav"
            onClick=${() => setMenu((m) => !m)}
          >
            ${
              menu
                ? html`<svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M6 6l12 12M18 6L6 18"></path>
                  </svg>`
                : html`<svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M4 7h16M4 12h16M4 17h16"></path>
                  </svg>`
            }<span>Menu</span>
          </button>
        </div>
        <nav className=${'nav' + (menu ? ' open' : '')} id="mainnav" aria-label="Main">
          <a href="#notices" aria-current=${cur === 'notices' ? 'page' : undefined}>Notices</a>
          <a href="#apply" aria-current=${cur === 'apply' ? 'page' : undefined}
            >Register a persona</a
          >
          <a href="#report" aria-current=${cur === 'report' ? 'page' : undefined}>Report</a>
          <a
            href="#case-status"
            aria-current=${cur === 'case-status' || cur === 'case' ? 'page' : undefined}
            >Case status</a
          >
          <button
            type="button"
            className="kbtn"
            onClick=${() => setPal(true)}
            aria-label="Search the registry"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="10.5" cy="10.5" r="6.5"></circle>
              <path d="M20 20l-4.6-4.6"></path></svg
            >Search<span className="kbd" aria-hidden="true">/</span>
          </button>
        </nav>
      </div>
    </header>
    <main
      id="main"
      tabIndex="-1"
      style=${{ outline: 'none' }}
      inert=${pal ? '' : undefined}
      aria-hidden=${pal ? 'true' : undefined}
    >
      ${view}
    </main>
    <footer inert=${pal ? '' : undefined} aria-hidden=${pal ? 'true' : undefined}>
      <div className="wrap">
        <div className="fbrand">
          <${Emblem} size=${56} color="#B9C6DC" />
          <p style=${{ maxWidth: '52ch' }}>
            The Synthetic Persona Registry is an independent register of AI personas. It is not part
            of, or endorsed by, any government, police or intergovernmental body. Every entry on
            this site is demonstration data. Portraits are AI-generated fictional illustrations, not
            identity or review evidence.
          </p>
        </div>
        <ul>
          <li><a href="#notices">Notices</a></li>
          <li><a href="#compare">Compare personas</a></li>
          <li><a href="#apply">Register a persona</a></li>
          <li><a href="#report">Report a persona</a></li>
          <li><a href="#case-status">Case status</a></li>
          <li>
            <a
              href="#home"
              onClick=${() => {
                catalogPosition.current = null;
              }}
              >Registry home</a
            >
          </li>
        </ul>
      </div>
    </footer>
    ${pal && html`<${Palette} onClose=${() => setPal(false)} />`}
    <div className=${'toast' + (msg ? ' show' : '')} role="status" aria-live="polite">${msg}</div>
  </div>`;
}

export { App };
