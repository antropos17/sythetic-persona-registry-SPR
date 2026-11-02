import { REDUCED, html } from '../runtime.mjs';
import { PEOPLE, byId } from '../domain/registry.mjs';
import { navigate } from '../domain/routing.mjs';
import { comparisonRoute, comparisonValue } from '../domain/comparison.mjs';
import { NTag, copy } from '../ui/common.mjs';
import { nvars, recordAdvice } from '../domain/notices.mjs';
import { socialHref } from '../domain/social.mjs';
import { SocialIcon } from '../ui/channels.mjs';
import { CLAIM_STATES } from '../domain/claims.mjs';

function CompareChoice({ person, ids, onToggle }) {
  return html`<label className="compare-choice"
    ><input
      type="checkbox"
      checked=${ids.includes(person.id)}
      disabled=${!ids.includes(person.id) && ids.length >= 2}
      onChange=${() => onToggle(person.id)}
    />Compare<span className="sr"> ${person.name}</span></label
  >`;
}

function Compare({ ids, onlyDifferences = false, toast }) {
  const first = byId(ids[0]) || PEOPLE[0];
  const second =
    byId(ids[1]) && ids[1] !== first.id ? byId(ids[1]) : PEOPLE.find((p) => p.id !== first.id);
  const pair = [first, second];
  const change = (side, id) => {
    if (id === pair[1 - side].id) return;
    const next = pair.map((p) => p.id);
    next[side] = id;
    navigate(comparisonRoute(next, onlyDifferences));
  };
  const rows = [
    ['overview', 'Overview', (p) => p.description],
    [
      'notice',
      'Notice',
      (p) =>
        html`<${NTag} status=${p.status} />
          <p className="compare-muted">${recordAdvice(p)}${p.note ? ' ' + p.note + '.' : ''}</p>
          ${p.risks.length > 0 && html`<a className="compare-risk-link" href=${'#' + p.id + '/risks'} aria-label=${'View open risks for ' + p.name}>View open risks</a>`}`,
    ],
    ['nature', 'Nature', (p) => p.nature],
    [
      'occupation',
      'Occupation and language',
      (p) =>
        html`<p>${p.role}</p>
          <p className="compare-muted">${p.lang}</p>`,
    ],
    ['holder', 'Listed rights holder', (p) => p.holder],
    [
      'level',
      'Recorded proof level',
      (p) =>
        html`<p>${p.level}</p>
          <p className="compare-muted">Demo label. No new evidence check.</p>`,
    ],
    [
      'dates',
      'Issue and expiry',
      (p) =>
        html`<p>Issued: ${p.issued}</p>
          <p className="compare-muted">Expires: ${p.expires}</p>`,
    ],
    [
      'channels',
      'Channels and handles',
      (p) =>
        html`<div>
          ${(p.socials?.length
            ? p.socials
            : [{ platform: 'Declared handle', handle: p.handle, url: null }]
          ).map((channel, index) => {
            const href = socialHref(channel);
            return html`<div className="compare-channel" key=${index}>
              <${SocialIcon} platform=${channel.platform} /><span
                >${channel.platform}<br />${href ? html`<a href=${href} target="_blank" rel="noopener noreferrer nofollow" aria-label=${'Open ' + p.name + ' on ' + channel.platform + ' in a new tab'}>${channel.handle}</a>` : channel.handle}</span
              >
            </div>`;
          })}
          <p className="compare-muted">
            ${p.socials?.some(socialHref) ? 'A link alone does not prove ownership.' : 'No public profile URL supplied.'}
          </p>
        </div>`,
    ],
    [
      'risks',
      'Open risks',
      (p) =>
        p.risks.length
          ? html`<ul>
              ${p.risks.map((risk, index) => html`<li key=${index}>${risk}</li>`)}
            </ul>`
          : html`<p>No open risks listed in this demo record.</p>
              <p className="compare-muted">
                This does not guarantee that every risk is resolved.
              </p>`,
    ],
    [
      'claims',
      'Basis of claims',
      (p) =>
        html`<ul>
          ${(p.claims || []).map((claim) => html`<li key=${claim.title}><b>${claim.title}:</b> ${CLAIM_STATES[claim.state]}</li>`)}
        </ul>`,
    ],
    [
      'latest',
      'Latest demo event',
      (p) =>
        html`<p>${p.history[0]?.e || 'No event supplied'}</p>
          <p className="compare-muted">${p.history[0]?.d || 'Date not supplied'}</p>`,
    ],
  ];
  const different = (key) => comparisonValue(first, key) !== comparisonValue(second, key);
  const visibleRows = onlyDifferences ? rows.filter(([key]) => different(key)) : rows;
  return html`<div className="wrap compare-main">
    <ol className="crumbs" aria-label="Breadcrumb">
      <li><a href="#notices">Notices</a></li>
      <li aria-current="page">Compare personas</li>
    </ol>
    <h1 id="h1" tabindex="-1">Compare personas</h1>
    <p className="sub">
      Compare two fictional registry records, including their notices, rights claims and open risks.
    </p>
    <button
      className="compare-jump"
      type="button"
      onClick=${() => {
        const results = document.getElementById('compare-results');
        results?.focus({ preventScroll: true });
        results?.scrollIntoView({ block: 'start', behavior: REDUCED ? 'auto' : 'smooth' });
      }}
    >
      View comparison results
    </button>
    <div className="compare-controls">
      ${pair.map(
        (person, side) =>
          html`<div className="fg" key=${side}>
            <label htmlFor=${'compare-' + side}
              >${side === 0 ? 'First persona' : 'Second persona'}</label
            >
            <select
              className="in"
              id=${'compare-' + side}
              value=${person.id}
              onChange=${(e) => change(side, e.target.value)}
            >
              ${PEOPLE.map((p) => html`<option key=${p.id} value=${p.id} disabled=${p.id === pair[1 - side].id}>${p.name} (${p.id})</option>`)}
            </select>
          </div>`,
      )}
    </div>
    <div className="compare-actions">
      <button
        className="btn line"
        type="button"
        onClick=${() => navigate(comparisonRoute([second.id, first.id], onlyDifferences))}
      >
        Swap sides</button
      ><button
        className="btn line"
        type="button"
        onClick=${() => copy(location.href.split('#')[0] + '#' + comparisonRoute([first.id, second.id], onlyDifferences), 'Comparison link', toast)}
      >
        Copy comparison link</button
      ><label className="compare-differences"
        ><input
          type="checkbox"
          checked=${onlyDifferences}
          onChange=${(e) => navigate(comparisonRoute([first.id, second.id], e.target.checked))}
        />Show differences only</label
      >
    </div>
    <p className="compare-announcement" role="status">
      Comparing ${first.name} and ${second.name}. Showing ${visibleRows.length} of ${rows.length} fields${onlyDifferences ? ' with different values' : ''}. All entries are demonstration data.
    </p>
    <div
      className="compare-head-grid"
      id="compare-results"
      tabindex="-1"
      aria-label="Comparison results"
    >
      <p className="compare-label">Selected personas</p>
      <div className="compare-people">
        ${pair.map(
          (p) =>
            html`<div className="compare-person" key=${p.id}>
              <img src=${p.src} alt="" />
              <div>
                <h2>
                  <a href=${'#' + p.id} aria-label=${'Open record for ' + p.name}>${p.name}</a>
                </h2>
                <p className="mono">${p.id}</p>
              </div>
            </div>`,
        )}
      </div>
    </div>
    ${visibleRows.length === 0 && html`<p className="empty" role="status">The displayed values match. Turn off “Show differences only” to see all fields.</p>`}
    ${visibleRows.map(
      ([key, label, render]) =>
        html`<section
          className=${'compare-row' + (different(key) ? ' is-different' : '')}
          aria-labelledby=${'compare-row-' + key}
          key=${key}
        >
          <h2 id=${'compare-row-' + key}>
            ${label}${different(key) && html`<span className="comparison-difference">Different values</span>`}
          </h2>
          <dl className="compare-values">
            ${pair.map(
              (p) =>
                html`<div style=${nvars(p.status)} key=${p.id}>
                  <dt className="sr">${p.name}</dt>
                  <dd>${render(p)}</dd>
                </div>`,
            )}
          </dl>
        </section>`,
    )}
  </div>`;
}

export { CompareChoice, Compare };
