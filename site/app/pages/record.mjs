import { REDUCED, React, html, useEffect, useRef, useState } from '../runtime.mjs';
import { NTag, copy } from '../ui/common.mjs';
import { navigate } from '../domain/routing.mjs';
import { NOTICE, nvars, recordAdvice } from '../domain/notices.mjs';
import { socialHref } from '../domain/social.mjs';
import { PEOPLE, PROOF_EXPLANATIONS } from '../domain/registry.mjs';
import { Viewer } from '../ui/passport.mjs';
import { SocialIcon } from '../ui/channels.mjs';
import { ClaimBasis } from '../ui/claims.mjs';
import { ComparePicker, ImageViewer } from '../ui/dialogs.mjs';

const PROV_DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const PROFILE_TARGETS = {
  overview: 'h1',
  check: 'record-check-h',
  risks: 'record-risks-h',
  basis: 'claim-basis-h',
  images: 'rec-images-h',
  history: 'record-history-h',
};

function alignRecordHeading(target) {
  if (!target) return;
  const header = document.querySelector('.hdr');
  const offset =
    (parseFloat(header && getComputedStyle(header).top) || 0) +
    (header?.getBoundingClientRect().height || 0) +
    16;
  window.scrollTo({
    top: Math.max(0, scrollY + target.getBoundingClientRect().top - offset),
    behavior: 'instant',
  });
}

function Record({ person, route, toast, onReport, savedRecords, toggleSaved }) {
  const section = route.section;
  const [imageIndex, setImageIndex] = useState(null),
    [chooseComparison, setChooseComparison] = useState(false);
  const recordRoot = useRef(null);
  const [step, setStep] = useState(-1);
  const [checkError, setCheckError] = useState('');
  const timers = useRef([]),
    checkRun = useRef(0);
  const [checking, setChecking] = useState(false);
  const [provenance, setProvenance] = useState(null);
  const [provenanceError, setProvenanceError] = useState('');
  useEffect(() => {
    checkRun.current++;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setStep(-1);
    setChecking(false);
    setCheckError('');
    return () => {
      checkRun.current++;
      timers.current.forEach(clearTimeout);
    };
  }, [person.id]);
  React.useLayoutEffect(() => {
    if (!section) return;
    const targetId = PROFILE_TARGETS[section];
    const target = document.getElementById(targetId);
    if (section === 'overview') {
      window.scrollTo({ top: 0, behavior: 'instant' });
      target?.focus({ preventScroll: true });
      return;
    }
    let layoutFrame = 0,
      observer,
      automatic = true,
      lastTop = target ? target.getBoundingClientRect().top + scrollY : 0;
    const gestures = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    const stopAutomatic = () => {
      automatic = false;
      observer?.disconnect();
      cancelAnimationFrame(layoutFrame);
      gestures.forEach((type) => window.removeEventListener(type, stopAutomatic, true));
    };
    const alignAfterLayout = () => {
      layoutFrame = 0;
      if (!automatic || !target) return;
      const top = target.getBoundingClientRect().top + scrollY;
      if (Math.abs(top - lastTop) > 1) {
        lastTop = top;
        alignRecordHeading(target);
      }
    };
    if (window.ResizeObserver && recordRoot.current) {
      observer = new ResizeObserver(() => {
        cancelAnimationFrame(layoutFrame);
        layoutFrame = requestAnimationFrame(alignAfterLayout);
      });
      observer.observe(recordRoot.current);
    }
    gestures.forEach((type) =>
      window.addEventListener(type, stopAutomatic, { capture: true, passive: true }),
    );
    alignRecordHeading(target);
    target?.focus({ preventScroll: true });
    return stopAutomatic;
  }, [person.id, route]);
  useEffect(() => {
    setProvenance(null);
    setProvenanceError('');
    if (location.protocol === 'file:') return;
    const controller = new AbortController();
    fetch('/api/v1/personas/' + encodeURIComponent(person.id) + '/provenance', {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unavailable');
        return response.json();
      })
      .then((data) => {
        if (data.personaId === person.id) setProvenance(data);
      })
      .catch((error) => {
        if (error.name !== 'AbortError')
          setProvenanceError('Media integrity information is unavailable.');
      });
    return () => controller.abort();
  }, [person.id]);
  const N = NOTICE[person.status];
  const tone = { Valid: 'ok', 'Under review': 'warn', Suspended: 'bad', Revoked: 'bad' }[
    person.status
  ];
  const checks = [
    { l: 'Record exists in the demo register', d: person.id, t: 'ok' },
    { l: 'Registry record identifier', d: person.record, t: 'ok' },
    {
      l: 'Face review shown in the record',
      d:
        person.status === 'Revoked'
          ? 'Close match recorded'
          : person.nature === 'Licensed likeness'
            ? 'Consent noted'
            : 'No issue recorded',
      t: person.status === 'Revoked' ? 'bad' : 'ok',
    },
    { l: 'Notice', d: N.name, t: tone },
    {
      l: 'Open risks on the record',
      d: person.risks.length ? String(person.risks.length) : 'None',
      t: person.risks.length ? 'warn' : 'ok',
    },
  ];
  const run = async () => {
    if (checking || (step >= 0 && step < checks.length)) return;
    const version = ++checkRun.current;
    setChecking(true);
    setCheckError('');
    timers.current.forEach(clearTimeout);
    setStep(-1);
    navigate(person.id + '/check');
    if (location.protocol !== 'file:') {
      try {
        const r = await fetch('/api/v1/passports/' + encodeURIComponent(person.id) + '/check');
        if (!r.ok) throw new Error('Registry lookup failed');
        const data = await r.json();
        if (
          !data.registryRecordFound ||
          data.passportId !== person.id ||
          data.registryMode !== 'demonstration' ||
          data.cryptographicSignatureVerified !== false ||
          data.faceComparisonPerformed !== false
        )
          throw new Error('Registry response could not be confirmed');
        if (
          data.notice !== person.status ||
          data.openRiskCount !== person.risks.length ||
          data.evidenceLevel !== person.level
        )
          throw new Error('This record has changed. Reload to see its current notice and risks.');
      } catch (e) {
        if (version !== checkRun.current) return;
        setChecking(false);
        setCheckError(
          e.message?.startsWith('This record has changed.')
            ? e.message
            : 'The registry is unavailable. Please try again.',
        );
        return;
      }
    }
    if (version !== checkRun.current) return;
    setChecking(false);
    setStep(0);
    const g = REDUCED ? 0 : 380;
    checks.forEach((_, i) => timers.current.push(setTimeout(() => setStep(i + 1), g * (i + 1))));
  };
  const done = step >= checks.length;
  const busy = checking || (step >= 0 && !done);
  const verdict = {
    Valid:
      'This demo record has a green notice. Review its open risks before working with this persona.',
    'Under review': 'This demo record is under review. Wait for a decision.',
    Suspended: 'This demo record is suspended. Do not run campaigns with this persona.',
    Revoked: 'This demo record is revoked. Do not use this persona.',
  }[person.status];
  const channels = person.socials?.length
    ? person.socials
    : [{ platform: 'Declared handle', handle: person.handle, url: null }];
  const hasProfileLink = channels.some((channel) => socialHref(channel));
  const i = PEOPLE.indexOf(person),
    prev = PEOPLE[(i - 1 + PEOPLE.length) % PEOPLE.length],
    next = PEOPLE[(i + 1) % PEOPLE.length];
  return html`<div ref=${recordRoot} style=${nvars(person.status)}>
    <div className="rec-top">
      <div className="wrap">
        <ol className="crumbs" aria-label="Breadcrumb">
          <li><a href="#home">Registry</a></li>
          <li><a href="#notices">Notices</a></li>
          <li aria-current="page">${person.name}</li>
        </ol>
        <div className="rec-head">
          <img className="rec-photo" src=${person.src} alt=${'Portrait of ' + person.name} />
          <div>
            <span className="no">${person.id}</span>
            <h1 id="h1" tabindex="-1">${person.name}</h1>
            <div className="rec-notice-row">
              <${NTag} status=${person.status} />
            </div>
          </div>
          <div className="rec-actions" role="group" aria-label="Record actions">
            <div className="rec-main-actions">
              ${
                section !== 'check' &&
                html`<button
                  type="button"
                  className="btn"
                  onClick=${run}
                  disabled=${busy}
                  aria-busy=${busy ? 'true' : undefined}
                >
                  ${busy ? 'Checking record…' : 'Check record'}
                </button>`
              }
              <button
                type="button"
                className="tlink rec-save"
                aria-pressed=${savedRecords.includes(person.id) ? 'true' : 'false'}
                aria-label=${(savedRecords.includes(person.id) ? 'Saved record' : 'Save record') + ' of ' + person.name + ' in this browser'}
                onClick=${() => toggleSaved(person.id)}
              >
                ${savedRecords.includes(person.id) ? 'Saved record' : 'Save record'}
              </button>
              <button
                type="button"
                className="tlink"
                aria-haspopup="dialog"
                onClick=${() => setChooseComparison(true)}
              >
                Compare
              </button>
            </div>
            <div className="rec-utilities">
              <button
                type="button"
                className="tlink"
                onClick=${() => copy(location.href.split('#')[0] + '#' + person.id, 'Link to this record', toast)}
              >
                Copy link
              </button>
              <button type="button" className="tlink" onClick=${() => onReport(person)}>
                Report
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div className="wrap">
      <div className="rec-grid">
        <section className="rec-summary" aria-labelledby="rec-summary-h">
          <h2 id="rec-summary-h">Record summary</h2>
          <div className="notice-box">
            <div>
              <span>${recordAdvice(person)}</span
              >${person.note && html`<p>Reason: ${person.note}.</p>`}
            </div>
          </div>
          <p className="proof-explanation">
            <b>Proof level: ${person.level}.</b> ${PROOF_EXPLANATIONS[person.level]}
          </p>
          <div className=${person.risks.length ? 'rec-summary-risks' : ''}>
            <h3
              id="record-risks-h"
              tabindex="-1"
              className=${person.risks.length ? undefined : 'sr'}
            >
              ${person.risks.length ? 'Open questions (' + person.risks.length + ')' : 'No open risks listed'}
            </h3>
            ${
              person.risks.length
                ? html`<ul>
                    ${person.risks.map((risk, index) => html`<li key=${index}>${risk}</li>`)}
                  </ul>`
                : null
            }
          </div>
        </section>
        <div className="rec-stage"><${Viewer} person=${person} /></div>
        <div className="rec-info">
          <section className="rec-about" aria-label=${'About ' + person.name}>
            <p>${person.description}</p>
          </section>
          <section className="rec-social" aria-labelledby="rec-social-title">
            <h2 id="rec-social-title">Channels</h2>
            <ul className="rec-social-list">
              ${channels.map((channel, index) => {
                const href = socialHref(channel);
                return html`<li key=${index}>
                  <span className="social-icon"
                    ><${SocialIcon} platform=${channel.platform}
                  /></span>
                  <span className="social-identity"
                    ><b>${channel.platform}</b><span>${channel.handle}</span></span
                  >
                  ${href ? html`<a className="social-link" href=${href} target="_blank" rel="noopener noreferrer nofollow" aria-label=${'Open ' + person.name + ' on ' + channel.platform + ' in a new tab'}>Open profile</a>` : html`<span className="social-unlinked">Profile URL not supplied</span>`}
                </li>`;
              })}
            </ul>
            <p className="rec-social-note">
              ${hasProfileLink ? 'Links do not establish account ownership.' : 'Handles do not establish account ownership.'}
            </p>
          </section>
          <dl className="dl" style=${{ marginTop: '24px' }}>
            <div>
              <dt>Passport number</dt>
              <dd>
                <span className="mono">${person.id}</span>
                <button
                  type="button"
                  className="tlink"
                  style=${{ marginLeft: '8px', fontSize: '15px' }}
                  onClick=${() => copy(person.id, 'Passport number', toast)}
                >
                  Copy
                </button>
              </dd>
            </div>
            <div>
              <dt>Nature</dt>
              <dd>${person.nature}</dd>
            </div>
            <div>
              <dt>Occupation</dt>
              <dd>${person.role}</dd>
            </div>
            <div>
              <dt>Language</dt>
              <dd>${person.lang}</dd>
            </div>
            <div>
              <dt>Rights holder</dt>
              <dd>${person.holder}</dd>
            </div>
            <div>
              <dt>Date of issue</dt>
              <dd>${person.issued}</dd>
            </div>
            <div>
              <dt>Date of expiry</dt>
              <dd>${person.expires}</dd>
            </div>
          </dl>
        </div>
      </div>
      ${
        (section === 'check' || step >= 0 || checking || checkError) &&
        html`<section className="record-section" aria-labelledby="record-check-h">
          <h2 className="h2" id="record-check-h" tabindex="-1">Record check</h2>
          <p className="sub">
            The demo lookup does not verify a signature or perform a new face comparison.
          </p>
          ${section === 'check' && html`<button type="button" className="btn record-check-action" onClick=${run} disabled=${busy} aria-busy=${busy ? 'true' : undefined}>${busy ? 'Checking record…' : 'Check record'}</button>`}
          ${checkError && html`<p role="alert" className="risk">${checkError}</p>`}
          ${
            step >= 0 &&
            html`<ul className="checks" aria-live="polite">
              ${checks.map(
                (c, k) =>
                  html`<li key=${k} className=${step > k ? 'done ' + c.t : step === k ? 'run' : ''}>
                    <span className="mk" aria-hidden="true"
                      >${step > k ? (c.t === 'ok' ? '✓' : '!') : ''}</span
                    ><span>${c.l}</span
                    ><span className="d">${step > k ? c.d : step === k ? 'Checking' : ''}</span>
                  </li>`,
              )}
            </ul>`
          }
          ${done && html`<p className="verdict" role="status">${verdict}</p>`}
        </section>`
      }
      <${ClaimBasis} person=${person} />
      <section className="rec-images" aria-labelledby="rec-images-h">
        <div>
          <h2 className="h2" id="rec-images-h" tabindex="-1">Persona images</h2>
          <p className="sub">Fictional illustrations; they do not establish identity.</p>
          <div className="rec-image-key">
            <button
              type="button"
              className="image-open"
              aria-haspopup="dialog"
              aria-label=${'Enlarge face portrait of ' + person.name}
              onClick=${() => setImageIndex(0)}
            >
              <img src=${person.src} alt="" loading="lazy" />
            </button>
            <div>
              <b>Face portrait</b>
              <p>Used in the catalog and sample passport above.</p>
              <button
                type="button"
                className="tlink"
                aria-haspopup="dialog"
                onClick=${() => setImageIndex(0)}
              >
                Enlarge portrait
              </button>
            </div>
          </div>
        </div>
        <figure className="rec-full">
          <button
            type="button"
            className="image-open"
            aria-haspopup="dialog"
            aria-label=${'Enlarge full-length image of ' + person.name}
            onClick=${() => setImageIndex(1)}
          >
            <img
              src=${person.bodySrc}
              alt=${'Full-length studio image of ' + person.name}
              loading="lazy"
            /><span className="image-open-label" aria-hidden="true">Enlarge image</span>
          </button>
          <figcaption>Full-length studio image of ${person.name}</figcaption>
        </figure>
      </section>
      <section className="prov" aria-labelledby="prov-h">
        <h2 id="prov-h">Image integrity</h2>
        <p className="sub">
          AI-generated demo images. Matching hashes show file consistency, not identity, consent or
          origin.
        </p>
        <div>
          <div
            role="status"
            className=${'prov-summary' + (provenanceError ? ' problem' : !provenance ? ' pending' : provenance.assets.length > 0 && provenance.assets.every((asset) => asset.integrity === 'matches_manifest') ? '' : ' problem')}
          >
            <strong
              >${provenance ? provenance.assets.filter((asset) => asset.integrity === 'matches_manifest').length + ' of ' + provenance.assets.length + ' image files match repository hashes' : provenanceError || (location.protocol === 'file:' ? 'Open the local server to check media hashes.' : 'Checking the media hashes…')}</strong
            ><span>File integrity check only</span>
          </div>
          <details className="technical-details" key=${person.id}>
            <summary>Technical details</summary>
            ${!provenance && html`<p className="sub">${provenanceError || 'Technical results will appear when the check finishes.'}</p>`}
            ${
              provenance &&
              html`<div>
                <p className="sub"><b>Basis for origin claim:</b> ${provenance.originBasis}</p>
                <div className="prov-grid" style=${{ marginTop: '18px' }}>
                  ${provenance.assets.map(
                    (asset) =>
                      html`<article className="prov-asset" key=${asset.role}>
                        <header>
                          <h3>
                            ${asset.role === 'portrait' ? 'Face portrait' : 'Full-length image'}
                          </h3>
                          <p
                            className=${'prov-result' + (asset.integrity === 'matches_manifest' ? '' : ' integrity-bad')}
                          >
                            ${asset.integrity === 'matches_manifest' ? 'Matches recorded hash' : asset.integrity === 'missing' ? 'File missing' : 'Hash mismatch'}
                          </p>
                        </header>
                        <dl className="prov-facts">
                          <div>
                            <dt>Checked</dt>
                            <dd>
                              <time datetime=${asset.checkedAt}
                                >${PROV_DATE_TIME.format(new Date(asset.checkedAt))}</time
                              >
                            </dd>
                          </div>
                          <div>
                            <div className="prov-hash-head">
                              <dt>Recorded SHA-256</dt>
                              <button
                                type="button"
                                className="tlink"
                                aria-label=${'Copy SHA-256 hash for ' + (asset.role === 'portrait' ? 'face portrait' : 'full-length image')}
                                onClick=${() => copy(asset.sha256, 'SHA-256 hash', toast)}
                              >
                                Copy hash
                              </button>
                            </div>
                            <dd><code className="prov-digest">${asset.sha256}</code></dd>
                          </div>
                        </dl>
                      </article>`,
                  )}
                </div>
              </div>`
            }
          </details>
        </div>
      </section>
      <section className="record-section" aria-labelledby="record-history-h">
        <h2 className="h2" id="record-history-h" tabindex="-1">Record history</h2>
        <dl className="hist">
          ${person.history.map(
            (event, index) =>
              html`<div key=${index}>
                <dt>${event.d}</dt>
                <dd>${event.e}</dd>
              </div>`,
          )}
        </dl>
      </section>
      <nav className="pager" aria-label="Other records">
        <a href=${'#' + prev.id}><span>Previous record</span><b>${prev.name}</b></a>
        <a className="nx" href=${'#' + next.id}><span>Next record</span><b>${next.name}</b></a>
      </nav>
      <div style=${{ height: '64px' }}></div>
    </div>
    ${imageIndex !== null && html`<${ImageViewer} key=${person.id} person=${person} initialIndex=${imageIndex} onClose=${() => setImageIndex(null)} />`}
    ${chooseComparison && html`<${ComparePicker} key=${person.id} person=${person} onClose=${() => setChooseComparison(false)} />`}
  </div>`;
}

export { PROV_DATE_TIME, PROFILE_TARGETS, alignRecordHeading, Record };
