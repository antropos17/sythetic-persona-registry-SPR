import {
  emptyReport,
  readReportDraft,
  reportDraftKey,
  saveReportDraft,
  validateReport,
} from '../domain/forms.mjs';
import { html, useRef, useState } from '../runtime.mjs';
import { PEOPLE } from '../domain/registry.mjs';
import { submitToRegistry } from '../domain/api.mjs';
import { copy } from '../ui/common.mjs';

function Report({ prefill, toast }) {
  const key = reportDraftKey(prefill?.id),
    empty = emptyReport(prefill);
  const [initial] = useState(() => {
    try {
      const draft = readReportDraft(sessionStorage, key);
      return { data: draft?.data || empty, status: draft ? 'restored' : 'idle' };
    } catch {
      return { data: empty, status: 'unavailable' };
    }
  });
  const [d, setD] = useState(initial.data),
    [draftStatus, setDraftStatus] = useState(initial.status),
    [clearPending, setClearPending] = useState(false);
  const [otherDrafts] = useState(() => {
    if (prefill) return [];
    try {
      return PEOPLE.map((person) => {
        const draft = readReportDraft(sessionStorage, reportDraftKey(person.id));
        return draft ? { id: person.id, label: draft.data.who || person.name } : null;
      }).filter(Boolean);
    } catch {
      return [];
    }
  });
  const [err, setErr] = useState(null);
  const [ref, setRef] = useState(null);
  const [accessToken, setAccessToken] = useState('');
  const [owned, setOwned] = useState(false);
  const [demo, setDemo] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState('');
  const sum = useRef(null);
  const hasInput = Object.keys(empty).some((field) => d[field] !== empty[field]);
  const set = (field) => (e) => {
    const next = { ...d, [field]: e.target.value };
    setD(next);
    setClearPending(false);
    setErr((current) => (current === null ? null : validateReport(next)));
    // Save in the input event so an immediate reload cannot outrun a debounce.
    try {
      saveReportDraft(sessionStorage, key, next);
      setDraftStatus('saved');
    } catch {
      setDraftStatus('unavailable');
    }
  };
  const clearDraft = () => {
    try {
      sessionStorage.removeItem(key);
      setD(empty);
      setErr(null);
      setServerError('');
      setClearPending(false);
      setDraftStatus('cleared');
      requestAnimationFrame(() => document.getElementById('r-who')?.focus());
    } catch {
      setDraftStatus('clear-error');
    }
  };
  const draftMessages = {
    idle: 'Drafts save automatically in this tab.',
    restored: 'Draft restored in this tab.',
    saved: 'Draft saved in this tab.',
    cleared: 'Draft cleared.',
    unavailable: 'Draft could not be saved. Keep this page open or copy your text.',
    'clear-error': 'The saved draft could not be cleared. Your text is still here.',
  };
  const submit = async (e) => {
    e.preventDefault();
    if (pending) return;
    const er = validateReport(d);
    if (Object.keys(er).length) {
      setErr(er);
      setTimeout(() => sum.current && sum.current.focus(), 0);
      return;
    }
    setErr(null);
    setPending(true);
    setServerError('');
    try {
      const result = await submitToRegistry('/api/v1/reports', d);
      setRef(result.id);
      setAccessToken(result.accessToken || '');
      setOwned(!!result.owned);
      setDemo(!!result.demo);
      if (!result.demo) {
        try {
          sessionStorage.removeItem(key);
          setDraftStatus('cleared');
        } catch {
          setDraftStatus('clear-error');
        }
      }
      setTimeout(() => {
        const h = document.getElementById('h1');
        h && h.focus();
        window.scrollTo({ top: 0 });
      }, 0);
    } catch (e) {
      setServerError(e.message || 'The report could not be saved. Please try again.');
    } finally {
      setPending(false);
    }
  };
  const fe = (k) => err && err[k];
  if (ref)
    return html`<div className="wrap formwrap">
      <div className="done">
        <h1 id="h1" tabindex="-1">${demo ? 'Report preview' : 'Report received'}</h1>
        <p style=${{ marginTop: '10px' }}>${demo ? 'Demo reference' : 'Your reference'}</p>
        <span className="ref">${ref}</span>
      </div>
      <p style=${{ marginTop: '28px' }}>
        ${demo ? 'This standalone preview did not save or send your report.' : 'Your report was stored. A reviewer must inspect it; a public notice does not change automatically.'}
      </p>
      ${draftStatus === 'clear-error' && html`<p role="status">Your report was stored, but the saved draft could not be cleared in this tab.</p>`}
      ${
        accessToken &&
        html`<div className="private-note">
            <b>Keep your private case link.</b>
            <p>
              It lets anyone holding it view the status and upload evidence. It is shown only here
              and is not emailed.
            </p>
          </div>
          <div className="rowbtns" style=${{ marginTop: '20px' }}>
            <a className="btn" href=${'#case/' + ref + '/' + accessToken}
              >View case and upload evidence</a
            ><button
              type="button"
              className="btn line"
              onClick=${() => copy(location.href.split('#')[0] + '#case/' + ref + '/' + accessToken, 'Private case link', toast)}
            >
              Copy private link
            </button>
          </div>`
      }
      ${
        owned &&
        html`<p>Your case is saved to your account.</p>
          <a className="btn" href=${'#case/' + ref}>View case and upload evidence</a>`
      }
      <div className="rowbtns" style=${{ marginTop: '24px' }}>
        <a className="btn line" href="#notices">Back to notices</a>
      </div>
    </div>`;
  return html`<div className="wrap formwrap">
    <ol className="crumbs" aria-label="Breadcrumb" style=${{ paddingTop: 0, marginBottom: '24px' }}>
      <li><a href="#home">Registry</a></li>
      <li aria-current="page">Report a persona</li>
    </ol>
    <h1 className="fh1" id="h1" tabindex="-1">Report a persona</h1>
    <p className="sub">
      Use this form for registered and unregistered personas. You do not need an account.
    </p>
    ${prefill && html`<a className="tlink" href=${'#' + prefill.id}>Back to ${prefill.name}'s profile</a>`}
    <aside className="report-draft" aria-label="Report draft">
      <p
        className="draft-state"
        role="status"
        data-error=${draftStatus === 'unavailable' || draftStatus === 'clear-error'}
      >
        ${draftMessages[draftStatus]}
      </p>
      <p>
        Reload restores saved text in this tab for up to 24 hours after your last edit. It is not
        sent until you submit.
      </p>
      ${
        !clearPending &&
        (hasInput || draftStatus === 'saved' || draftStatus === 'restored') &&
        html`<button
          type="button"
          className="tlink"
          onClick=${() => {
            setClearPending(true);
            requestAnimationFrame(() => document.getElementById('keep-report-draft')?.focus());
          }}
        >
          Clear draft
        </button>`
      }
      ${
        clearPending &&
        html`<div
          className="report-draft-actions"
          role="group"
          aria-label="Clear saved report draft"
        >
          <p>Clear the saved text for this report?</p>
          <button type="button" className="btn line" onClick=${clearDraft}>Clear saved text</button
          ><button
            type="button"
            className="tlink"
            id="keep-report-draft"
            onClick=${() => {
              setClearPending(false);
              requestAnimationFrame(() => document.getElementById('r-who')?.focus());
            }}
          >
            Keep editing
          </button>
        </div>`
      }
      ${
        otherDrafts.length > 0 &&
        html`<div>
          <b>Other drafts in this tab</b>
          <ul className="report-drafts">
            ${otherDrafts.map((draft) => html`<li key=${draft.id}><a href=${'#report/' + draft.id}>Resume report: ${draft.label}</a></li>`)}
          </ul>
        </div>`
      }
    </aside>
    ${
      err &&
      Object.keys(err).length > 0 &&
      html`<div className="esum" role="alert" tabindex="-1" ref=${sum}>
        <h2>There is a problem</h2>
        <ul>
          ${Object.entries(err).map(
            ([k, m]) =>
              html`<li key=${k}>
                <a
                  href=${'#r-' + k}
                  onClick=${(e) => {
                    e.preventDefault();
                    const el = document.getElementById('r-' + k);
                    el && el.focus();
                  }}
                  >${m}</a
                >
              </li>`,
          )}
        </ul>
      </div>`
    }
    <form className="form" onSubmit=${submit} novalidate>
      <div className=${'fg' + (fe('who') ? ' err' : '')}>
        <label htmlFor="r-who">Which persona?</label
        ><span className="hint" id="r-h-who">Name, handle or passport number</span>
        ${fe('who') && html`<span className="emsg" id="r-e-who">${err.who}</span>`}<input
          id="r-who"
          className=${'in' + (fe('who') ? ' err' : '')}
          value=${d.who}
          onChange=${set('who')}
          autocomplete="off"
          maxlength="160"
          aria-invalid=${fe('who') ? 'true' : undefined}
          aria-describedby=${fe('who') ? 'r-h-who r-e-who' : 'r-h-who'}
        />
      </div>
      <fieldset
        className=${'fg' + (fe('what') ? ' err' : '')}
        aria-describedby=${fe('what') ? 'r-e-what' : undefined}
      >
        <legend>What is the problem?</legend>
        ${fe('what') && html`<span className="emsg" id="r-e-what">${err.what}</span>`}
        <div className="opts">
          ${[
            ['copy', 'It copies or looks like a real person'],
            ['ads', 'It posts ads without saying they are ads'],
            ['undisclosed', 'It does not say it is an AI'],
            ['other', 'Something else'],
          ].map(
            ([v, l], n) =>
              html`<label key=${v} className="opt"
                ><input
                  type="radio"
                  id=${n === 0 ? 'r-what' : undefined}
                  name="what"
                  value=${v}
                  checked=${d.what === v}
                  onChange=${set('what')}
                /><span>${l}</span></label
              >`,
          )}
        </div>
      </fieldset>
      <div className=${'fg' + (fe('details') ? ' err' : '')}>
        <label htmlFor="r-details">What did you see?</label
        ><span className="hint" id="r-h-details"
          >Use 20 to 4000 characters. Include links to posts if you have them.</span
        >
        ${fe('details') && html`<span className="emsg" id="r-e-details">${err.details}</span>`}<textarea
          id="r-details"
          className=${'in' + (fe('details') ? ' err' : '')}
          value=${d.details}
          onChange=${set('details')}
          maxlength="4000"
          aria-invalid=${fe('details') ? 'true' : undefined}
          aria-describedby=${fe('details') ? 'r-h-details r-e-details' : 'r-h-details'}
        ></textarea>
      </div>
      <div className=${'fg' + (fe('email') ? ' err' : '')}>
        <label htmlFor="r-email">Email address (optional)</label
        ><span className="hint" id="r-h-email"
          >Contact address for future follow-up. This prototype does not send email.</span
        >
        ${fe('email') && html`<span className="emsg" id="r-e-email">${err.email}</span>`}<input
          id="r-email"
          type="email"
          className=${'in' + (fe('email') ? ' err' : '')}
          value=${d.email}
          onChange=${set('email')}
          autocomplete="email"
          maxlength="254"
          aria-invalid=${fe('email') ? 'true' : undefined}
          aria-describedby=${fe('email') ? 'r-h-email r-e-email' : 'r-h-email'}
        />
      </div>
      ${serverError && html`<p role="alert" className="risk">${serverError}</p>`}
      <div className="rowbtns">
        <button type="submit" className="btn" disabled=${pending}>
          ${pending ? 'Saving' : 'Send report'}
        </button>
      </div>
    </form>
  </div>`;
}

export { Report };
