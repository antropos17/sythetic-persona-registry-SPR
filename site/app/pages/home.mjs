import { REDUCED, html, useEffect, useMemo, useRef, useState } from '../runtime.mjs';
import { normalizeSearch, searchPeople } from '../domain/search.mjs';
import { LEVELS, PEOPLE, byId } from '../domain/registry.mjs';
import { navigate } from '../domain/routing.mjs';
import { NOTICE, ORDER, nvars, recordAdvice } from '../domain/notices.mjs';
import { Globe, NTag } from '../ui/common.mjs';
import { NameSuggestions } from '../ui/dialogs.mjs';
import { Viewer } from '../ui/passport.mjs';
import { store } from '../domain/storage.mjs';
import { withoutCatalogFilters } from '../domain/catalog.mjs';
import { CardChannel } from '../ui/channels.mjs';
import { CompareChoice } from './compare.mjs';

function Hero() {
  const [q, setQ] = useState('');
  const [tried, setTried] = useState(false);
  const result = searchPeople(q),
    res = result.matches;
  const top = res.length === 1 ? res[0] : null;
  const featured = PEOPLE[0];
  const submit = (e) => {
    e.preventDefault();
    if (top) navigate(top.id);
    else if (res.length > 1) {
      const heading = document.getElementById('vresults-label');
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
    } else {
      setTried(true);
      document.getElementById('vq')?.focus();
    }
  };
  return html`<section className="hero" aria-labelledby="h1">
    <div className="wrap">
      <div>
        <h1 id="h1" tabindex="-1">Check an AI persona before you work with it.</h1>
        <p className="lede">
          Explore fictional personas, listed rights holders and sample notices. This demo does not
          verify identity or evidence.
        </p>
        <a className="hero-browse" href="#notices">Browse all personas</a>
        <form className="verify" role="search" onSubmit=${submit}>
          <label htmlFor="vq">Passport number, handle or name</label>
          <div className="row">
            <input
              id="vq"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="PP-AZ-0001"
              value=${q}
              onChange=${(e) => {
                setQ(e.target.value);
                setTried(false);
              }}
              aria-invalid=${tried ? 'true' : undefined}
              aria-describedby="vres"
            />
            <button className="btn" type="submit">
              ${res.length > 1 ? 'Show matches' : 'Check'}
            </button>
          </div>
          <div className="try">
            <span>Try</span>${['PP-AZ-0001', '@leyla.kaya', 'Elin Berg'].map(
              (t) =>
                html`<button
                  key=${t}
                  type="button"
                  onClick=${() => {
                    setQ(t);
                    setTried(false);
                  }}
                >
                  ${t}
                </button>`,
            )}
          </div>
          <div id="vres" aria-live="polite">
            ${
              tried &&
              !q.trim() &&
              html`<div className="vres" style=${{ '--nc': 'var(--focus)' }}>
                <div className="t"><b>Enter a passport number, handle or name.</b></div>
              </div>`
            }
            ${
              res.length > 1 &&
              html`<p className="lookup-heading" id="vresults-label" tabindex="-1">
                  ${res.length} personas match<span>Choose a persona to open its record.</span>
                </p>
                <ul className="lookup-results" aria-labelledby="vresults-label">
                  ${res.map(
                    (p) =>
                      html`<li key=${p.id}>
                        <a
                          className="lookup-result"
                          href=${'#' + p.id}
                          style=${nvars(p.status)}
                          aria-label=${'Open record for ' + p.name + ', ' + p.id}
                          ><img src=${p.src} alt="" /><span className="lookup-identity"
                            ><b>${p.name}</b><span className="mono">${p.id}</span
                            ><${NTag} status=${p.status} /></span
                        ></a>
                      </li>`,
                  )}
                </ul>`
            }
            ${
              q.trim() &&
              res.length <= 1 &&
              (top
                ? html`<div className="vres" style=${{ '--nc': NOTICE[top.status].nc }}>
                    <img src=${top.src} alt="" />
                    <div className="t">
                      <b>${top.name}</b
                      ><span>${NOTICE[top.status].name}. ${recordAdvice(top)}</span>
                    </div>
                    <a className="btn light" href=${'#' + top.id}>Open record</a>
                  </div>`
                : html`<div className="vres" style=${{ '--nc': '#fff' }}>
                    <div className="t">
                      <b>No exact match</b
                      ><span
                        >No demo record matches “${q.trim()}”. Check the spelling or the
                        number.</span
                      >
                    </div>
                  </div>`)
            }
            <${NameSuggestions} people=${result.suggestions} />
          </div>
        </form>
      </div>
      <div className="stage">
        <p className="passport-demo-note">
          Sample passport · Endorsements are fictional and do not verify evidence.
        </p>
        <${Globe} /><${Viewer}
          person=${featured}
          label=${'Sample passport ' + featured.id + ' of ' + featured.name + '. Arrow keys turn it.'}
        />
      </div>
    </div>
  </section>`;
}

function Notices({
  savedRecords,
  toggleSaved,
  comparisonIds,
  toggleComparison,
  catalog,
  setCatalog,
}) {
  const [filterMessage, setFilterMessage] = useState('');
  const [compact, setCompact] = useState(() => matchMedia('(max-width:640px)').matches);
  const refineRef = useRef(null);
  const { notice, q, sort, savedOnly, language, occupation, proof, filtersOpen } = catalog;
  const view = compact ? catalog.mobileView : catalog.view;
  useEffect(() => {
    const media = matchMedia('(max-width:640px)');
    const update = () => {
      if (media.matches && !filtersOpen && refineRef.current?.contains(document.activeElement))
        refineRef.current.querySelector('summary')?.focus({ preventScroll: true });
      setCompact(media.matches);
    };
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, [filtersOpen]);
  const field = (key) => (value) =>
    setCatalog(
      (current) => ({
        ...current,
        [key]: typeof value === 'function' ? value(current[key]) : value,
      }),
      { replace: key === 'q' },
    );
  const setNotice = field('notice'),
    setQ = field('q'),
    setSort = field('sort'),
    setView = field(compact ? 'mobileView' : 'view'),
    setSavedOnly = field('savedOnly'),
    setLanguage = field('language'),
    setOccupation = field('occupation'),
    setProof = field('proof');
  const languages = [...new Set(PEOPLE.map((p) => p.lang))].sort();
  const occupations = [...new Set(PEOPLE.map((p) => p.role))].sort();
  useEffect(() => {
    store.set('spr-view', { view: catalog.view });
    store.set('spr-view-mobile', { view: catalog.mobileView });
  }, [catalog.view, catalog.mobileView]);
  const counts = {};
  PEOPLE.forEach((p) => {
    counts[p.status] = (counts[p.status] || 0) + 1;
  });
  const search = useMemo(
    () => (normalizeSearch(q) ? searchPeople(q) : { matches: PEOPLE, suggestions: [] }),
    [q],
  );
  const matches = search.matches;
  const rows = useMemo(() => {
    let r = matches.filter(
      (p) =>
        (notice === 'All' || p.status === notice) &&
        (!savedOnly || savedRecords.includes(p.id)) &&
        (!language || p.lang === language) &&
        (!occupation || p.role === occupation) &&
        (!proof || p.level === proof),
    );
    const cmp = {
      recent: (a, b) => b.sort - a.sort,
      name: (a, b) => a.name.localeCompare(b.name),
      notice: (a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.sort - a.sort,
    }[sort];
    return r.slice().sort(cmp);
  }, [notice, matches, sort, savedOnly, savedRecords, language, occupation, proof]);
  const suggestions = rows.length
    ? []
    : search.suggestions.filter(
        (p) =>
          (notice === 'All' || p.status === notice) &&
          (!savedOnly || savedRecords.includes(p.id)) &&
          (!language || p.lang === language) &&
          (!occupation || p.role === occupation) &&
          (!proof || p.level === proof),
      );
  const filtered = notice !== 'All' || q.trim() || savedOnly || language || occupation || proof;
  const activeFilters = [
    notice !== 'All' && {
      key: 'notice',
      label: 'Notice: ' + NOTICE[notice].name,
      reset: 'All',
      control: 'notice-' + NOTICE[notice].key,
    },
    q.trim() && { key: 'q', label: 'Search: “' + q.trim() + '”', reset: '', control: 'nq' },
    savedOnly && {
      key: 'savedOnly',
      label: 'Saved records',
      reset: false,
      control: 'catalog-saved',
    },
    language && {
      key: 'language',
      label: 'Language: ' + language,
      reset: '',
      control: 'catalog-language',
    },
    occupation && {
      key: 'occupation',
      label: 'Occupation: ' + occupation,
      reset: '',
      control: 'catalog-occupation',
    },
    proof && { key: 'proof', label: 'Proof level: ' + proof, reset: '', control: 'catalog-proof' },
  ].filter(Boolean);
  const removeFilter = (filter, index) => {
    setCatalog((current) => ({ ...current, [filter.key]: filter.reset }));
    setFilterMessage(filter.label + ' filter removed.');
    requestAnimationFrame(() => {
      const chips = document.querySelectorAll('[data-filter-chip]');
      const control = document.getElementById(filter.control);
      const target =
        chips[Math.min(index, chips.length - 1)] ||
        (control && !control.closest('details:not([open])')
          ? control
          : document.getElementById('catalog-refine-toggle')) ||
        document.getElementById('nq');
      target?.focus({ preventScroll: true });
    });
  };
  const clearFilters = () => {
    setCatalog((current) => ({ ...withoutCatalogFilters(current), q: '' }));
    setFilterMessage('All filters and search cleared.');
    requestAnimationFrame(() => document.getElementById('nq')?.focus({ preventScroll: true }));
  };
  const showMatches = () => {
    setCatalog(withoutCatalogFilters);
    setFilterMessage('Filters removed. Search kept.');
    requestAnimationFrame(() => document.getElementById('nq')?.focus({ preventScroll: true }));
  };
  const removeComparison = (id) => {
    toggleComparison(id);
    requestAnimationFrame(() => {
      const target =
        comparisonIds.length > 1
          ? document.querySelector('.compare-tray-list button')
          : document.getElementById('nq');
      target?.focus();
    });
  };
  const clearComparison = () => {
    comparisonIds.forEach(toggleComparison);
    requestAnimationFrame(() =>
      (
        document.querySelector('.compare-choice input:not(:disabled)') ||
        document.getElementById('nq')
      )?.focus(),
    );
  };
  return html`<section id="notices" className="sec" aria-labelledby="n-h">
    <div className="wrap">
      <div className="sec-h">
        <div>
          <h2 className="h2" id="n-h" tabindex="-1">Notices</h2>
          <p className="sub">Browse demo personas. Filter by notice, name or handle.</p>
        </div>
        <a className="btn line" href="#compare">Compare personas</a>
      </div>
      <div className="catalog-search">
        <label htmlFor="nq">Find a persona</label
        ><input
          id="nq"
          className="field-in"
          type="search"
          maxlength="200"
          placeholder="Name, handle, passport or rights holder"
          value=${q}
          onChange=${(e) => setQ(e.target.value)}
        />
      </div>
      <div className="key" role="group" aria-label="Filter by notice">
        ${ORDER.map(
          (s) =>
            html`<button
              key=${s}
              id=${'notice-' + NOTICE[s].key}
              type="button"
              style=${nvars(s)}
              aria-pressed=${notice === s ? 'true' : 'false'}
              onClick=${() => setNotice((n) => (n === s ? 'All' : s))}
            >
              <span className="nm"
                ><span>${NOTICE[s].name}</span><span className="ct">${counts[s] || 0}</span></span
              >
              <span className="ad"
                >${NOTICE[s].meaning}<span className="notice-advice"
                  >. ${NOTICE[s].advice}</span
                ></span
              >
            </button>`,
        )}
      </div>
      <details
        className="catalog-refine"
        ref=${refineRef}
        open=${!compact || filtersOpen}
        onToggle=${(e) => {
          if (compact && e.currentTarget.open !== filtersOpen)
            field('filtersOpen')(e.currentTarget.open);
        }}
      >
        <summary id="catalog-refine-toggle">
          Filters <span>${activeFilters.length} active</span>
        </summary>
        <div className="catalog-refine-body">
          <div className="tools">
            <div className="l">
              <label htmlFor="ns">Sort by</label>
              <select
                id="ns"
                className="sel"
                value=${sort}
                onChange=${(e) => setSort(e.target.value)}
              >
                <option value="recent">Newest first</option>
                <option value="name">Name A to Z</option>
                <option value="notice">Notice colour</option>
              </select>
            </div>
            <div className="viewsw" role="group" aria-label="Layout">
              <button
                type="button"
                aria-pressed=${view === 'grid' ? 'true' : 'false'}
                onClick=${() => setView('grid')}
              >
                Cards
              </button>
              <button
                type="button"
                aria-pressed=${view === 'list' ? 'true' : 'false'}
                onClick=${() => setView('list')}
              >
                Table
              </button>
            </div>
            <button
              type="button"
              id="catalog-saved"
              className="saved-filter"
              aria-pressed=${savedOnly ? 'true' : 'false'}
              onClick=${() => setSavedOnly((value) => !value)}
            >
              Saved in this browser (${savedRecords.length})
            </button>
          </div>
          <div className="catalog-filters">
            <div>
              <label htmlFor="catalog-language">Language</label
              ><select
                className="sel"
                id="catalog-language"
                value=${language}
                onChange=${(e) => setLanguage(e.target.value)}
              >
                <option value="">All languages</option>
                ${languages.map((value) => html`<option key=${value} value=${value}>${value}</option>`)}
              </select>
            </div>
            <div>
              <label htmlFor="catalog-occupation">Occupation</label
              ><select
                className="sel"
                id="catalog-occupation"
                value=${occupation}
                onChange=${(e) => setOccupation(e.target.value)}
              >
                <option value="">All occupations</option>
                ${occupations.map((value) => html`<option key=${value} value=${value}>${value}</option>`)}
              </select>
            </div>
            <div>
              <label htmlFor="catalog-proof">Proof level</label
              ><select
                className="sel"
                id="catalog-proof"
                value=${proof}
                onChange=${(e) => setProof(e.target.value)}
              >
                <option value="">All proof levels</option>
                ${LEVELS.filter((value) => PEOPLE.some((p) => p.level === value)).map((value) => html`<option key=${value} value=${value}>${value}</option>`)}
              </select>
            </div>
          </div>
          <details className="notice-guide">
            <summary>What the notices mean</summary>
            <dl>
              ${ORDER.map(
                (s) =>
                  html`<div key=${s}>
                    <dt>${NOTICE[s].name}: ${NOTICE[s].meaning}</dt>
                    <dd>${NOTICE[s].advice}</dd>
                  </div>`,
              )}
            </dl>
          </details>
        </div>
      </details>
      ${
        activeFilters.length > 0 &&
        html`<div className="active-filters" role="group" aria-label="Active filters">
          <b>Active filters</b>
          <ul className="filter-chips">
            ${activeFilters.map(
              (filter, index) =>
                html`<li key=${filter.key}>
                  <button
                    type="button"
                    className="filter-chip"
                    data-filter-chip=${filter.key}
                    aria-label=${'Remove filter: ' + filter.label}
                    onClick=${() => removeFilter(filter, index)}
                  >
                    <span>${filter.label}</span><span aria-hidden="true">×</span>
                  </button>
                </li>`,
            )}
          </ul>
        </div>`
      }
      <p className="sr" role="status">${filterMessage}</p>
      <p className="status-line" aria-live="polite" style=${{ marginBottom: '16px' }}>
        ${rows.length + ' of ' + PEOPLE.length + ' personas' + (notice !== 'All' ? ' with a ' + NOTICE[notice].name.toLowerCase() : '') + (q.trim() ? ' matching “' + q.trim() + '”' : '') + (savedOnly ? ' in your saved records' : '') + '.' + (suggestions.length ? ' ' + suggestions.length + ' similar name suggestion' + (suggestions.length === 1 ? '' : 's') + ' below.' : '')}
        ${filtered && html`<button type="button" className="tlink clear" onClick=${clearFilters}>Clear filters</button>`}
      </p>
      <p className="sr" role="status">
        ${comparisonIds.length === 2 ? 'Two personas selected for comparison. Remove a selection to choose another persona.' : comparisonIds.length + ' of 2 personas selected for comparison.'}
      </p>
      ${
        !rows.length &&
        html`<div className="empty">
          <p>
            ${q.trim() && matches.length ? matches.length + ' persona' + (matches.length === 1 ? ' matches' : 's match') + ' your search outside the selected filters.' : savedOnly && !savedRecords.length ? 'No saved records yet. Save a persona from a card to find it here.' : 'No persona matches these filters.'}
          </p>
          ${q.trim() && matches.length > 0 && html`<button type="button" className="btn line" onClick=${showMatches}>Show ${matches.length} matching persona${matches.length === 1 ? '' : 's'}</button>`}<button
            type="button"
            className="tlink"
            onClick=${clearFilters}
          >
            Clear search and filters
          </button>
        </div>`
      }
      <${NameSuggestions}
        people=${suggestions}
        onSelect=${(p) => {
          setQ(p.name);
          requestAnimationFrame(() => document.getElementById('nq')?.focus());
        }}
      />
      ${
        rows.length > 0 &&
        view === 'grid' &&
        html`<ul className="grid" style=${{ listStyle: 'none', margin: 0, padding: 0 }}>
          ${rows.map(
            (p) =>
              html`<li key=${p.id} className="card" style=${nvars(p.status)}>
                <div className="band" aria-hidden="true"></div>
                <div className="ph">
                  <img
                    src=${p.src}
                    alt=${'Portrait of ' + p.name}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="bd">
                  <div className="card-title">
                    <h3><a href=${'#' + p.id} data-catalog-record=${p.id}>${p.name}</a></h3>
                    <${NTag} status=${p.status} />
                  </div>
                  <span className="no">${p.id}</span>
                  <span className="meta">${p.role}, ${p.lang}</span>
                  <span className="meta">Held by ${p.holder}</span>
                  <p className="card-summary">${p.description}</p>
                  <${CardChannel} person=${p} />
                  <div className="card-actions">
                    <button
                      type="button"
                      className="tlink save-action"
                      aria-pressed=${savedRecords.includes(p.id) ? 'true' : 'false'}
                      aria-label=${savedRecords.includes(p.id) ? 'Remove ' + p.name + ' from saved records' : 'Save ' + p.name + ' for later'}
                      onClick=${() => toggleSaved(p.id)}
                    >
                      ${savedRecords.includes(p.id) ? 'Remove saved' : 'Save record'}
                    </button>
                    <${CompareChoice}
                      person=${p}
                      ids=${comparisonIds}
                      onToggle=${toggleComparison}
                    />
                  </div>
                </div>
              </li>`,
          )}
        </ul>`
      }
      ${
        rows.length > 0 &&
        view === 'list' &&
        html`<div className="tbl-box">
          <table>
            <caption className="sr">
              Notices. Demonstration entries.
            </caption>
            <thead>
              <tr>
                <th scope="col"><span className="sr">Portrait</span></th>
                <th scope="col">Persona</th>
                <th scope="col">Passport number</th>
                <th scope="col">Rights holder</th>
                <th scope="col">Notice</th>
                <th scope="col">Issued</th>
                <th scope="col">Save</th>
                <th scope="col">Compare</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(
                (p) =>
                  html`<tr key=${p.id}>
                    <td>
                      <img
                        className="thumb"
                        src=${'../assets/portrait-thumbs/' + p.id + '.jpg'}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    </td>
                    <td>
                      <a href=${'#' + p.id} data-catalog-record=${p.id}>${p.name}</a><br /><span
                        style=${{ color: 'var(--muted)', fontSize: '14.5px' }}
                        >${p.handle}</span
                      >
                    </td>
                    <td className="mono">${p.id}</td>
                    <td>${p.holder}</td>
                    <td><${NTag} status=${p.status} /></td>
                    <td style=${{ whiteSpace: 'nowrap' }}>${p.issued}</td>
                    <td>
                      <button
                        type="button"
                        className="tlink save-action"
                        aria-pressed=${savedRecords.includes(p.id) ? 'true' : 'false'}
                        aria-label=${savedRecords.includes(p.id) ? 'Remove ' + p.name + ' from saved records' : 'Save ' + p.name + ' for later'}
                        onClick=${() => toggleSaved(p.id)}
                      >
                        ${savedRecords.includes(p.id) ? 'Remove saved' : 'Save record'}
                      </button>
                    </td>
                    <td>
                      <${CompareChoice}
                        person=${p}
                        ids=${comparisonIds}
                        onToggle=${toggleComparison}
                      />
                    </td>
                  </tr>`,
              )}
            </tbody>
          </table>
        </div>`
      }
      <aside
        className=${'compare-tray' + (comparisonIds.length ? '' : ' empty')}
        aria-label="Selected for comparison"
      >
        <div>
          <b>${comparisonIds.length} of 2 selected</b>
          <ul className="compare-tray-list">
            ${comparisonIds.map((id) => html`<li key=${id}><button type="button" className="tlink" aria-label=${'Remove ' + byId(id).name + ' from comparison'} onClick=${() => removeComparison(id)}>${byId(id).name} — remove</button></li>`)}
          </ul>
          <p>Your selection is kept when filters change.</p>
        </div>
        <div className="compare-tray-actions">
          <button
            className="btn"
            type="button"
            disabled=${comparisonIds.length !== 2}
            onClick=${() => navigate('compare/' + comparisonIds.join('/'))}
          >
            Compare selected</button
          ><button className="btn line" type="button" onClick=${clearComparison}>
            Clear selection
          </button>
        </div>
      </aside>
    </div>
  </section>`;
}

function Home({ savedRecords, toggleSaved, comparisonIds, toggleComparison, catalog, setCatalog }) {
  return html`<div>
    <${Hero} />
    <${Notices}
      savedRecords=${savedRecords}
      toggleSaved=${toggleSaved}
      comparisonIds=${comparisonIds}
      toggleComparison=${toggleComparison}
      catalog=${catalog}
      setCatalog=${setCatalog}
    />
    <section className="sec" style=${{ background: 'var(--mist)' }} aria-labelledby="s-h">
      <div className="wrap">
        <div className="sec-h">
          <div>
            <h2 className="h2" id="s-h">From a record to a private case</h2>
            <p className="sub">
              Explore a fictional record, then see how an application or report can be reviewed.
            </p>
          </div>
        </div>
        <div className="process-layout">
          <ol className="steps">
            <li>
              <h3>Inspect a record</h3>
              <p>Explore a demo persona, its notice, claims and listed risks.</p>
            </li>
            <li>
              <h3>Submit a private case</h3>
              <p>
                Send an application or report and keep the case number and access key to return to
                it.
              </p>
            </li>
            <li>
              <h3>Review evidence</h3>
              <p>
                A configured reviewer can inspect the case, request or review evidence and record
                their assessment.
              </p>
            </li>
            <li>
              <h3>Record a decision</h3>
              <p>
                A reviewer records an outcome on the case. It does not issue a passport or change a
                public demo notice.
              </p>
            </li>
          </ol>
          <picture className="process-scene"
            ><source media="(max-width: 760px)" srcset="../assets/demo/process-compact.png" />
            <img
              src="../assets/demo/process-desktop.png"
              width="800"
              height="600"
              alt="Illustration of a private case showing evidence received, an assessment and a recorded decision."
          /></picture>
        </div>
      </div>
    </section>
    <section className="sec" aria-labelledby="sv-h">
      <div className="wrap">
        <h2 className="h2 sr" id="sv-h">Services</h2>
        <div className="svc">
          <div className="a">
            <h3>Register a persona</h3>
            <p>
              Apply for a passport for a persona you own. You answer four short sections and get a
              case number straight away.
            </p>
            <span className="time">Takes about 5 minutes</span
            ><a className="btn light" href="#apply">Start an application</a>
          </div>
          <div className="b">
            <h3>Report a persona</h3>
            <p>
              Seen an AI persona copying a real person, or posting ads without saying so? Save a
              report for review.
            </p>
            <span className="time">Takes about 2 minutes</span
            ><a className="btn line" href="#report">Report a persona</a>
          </div>
        </div>
      </div>
    </section>
  </div>`;
}

export { Hero, Notices, Home };
