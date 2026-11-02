import { refreshPeople } from '../domain/registry.mjs';
import { html, useEffect, useRef, useState } from '../runtime.mjs';
import { privateJson } from '../domain/api.mjs';

const fields = [
  ['name', 'Public name', 1, 120],
  ['handle', 'Main channel handle', 2, 80],
  ['nature', 'Nature', 1, 20],
  ['holder', 'Listed rights holder', 1, 160],
  ['languages', 'Languages', 0, 160],
  ['occupation', 'Occupation', 1, 80],
  ['description', 'Description', 20, 600],
  ['usageTerms', 'Usage terms', 20, 1500],
];
const emptyContent = (payload = {}) => ({
  name: payload.name || '',
  handle: payload.handle || '',
  nature: payload.nature || '',
  holder: payload.holder || '',
  languages: payload.langs || '',
  occupation: '',
  description: '',
  usageTerms: '',
});

function ContentPreview({ content, includeName = true }) {
  return html`<dl className="publication-preview">
    ${fields
      .filter(([key]) => includeName || key !== 'name')
      .map(
        ([key, label]) =>
          html`<div key=${key}>
            <dt>${label}</dt>
            <dd>
              ${key === 'nature' ? (content[key] === 'synthetic' ? 'Fully synthetic' : 'Licensed likeness') : content[key] || 'Not supplied'}
            </dd>
          </div>`,
      )}
  </dl>`;
}

function PublicationPanel({ caseId, token, reviewer = false, payload = {} }) {
  const [state, setState] = useState(null);
  const [content, setContent] = useState(() => emptyContent(payload));
  const dirty = useRef(false);
  const [consentKey, setConsentKey] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const base = '/api/v1/' + (reviewer ? 'review/cases/' : 'cases/') + caseId + '/publication';
  const load = async (signal) => {
    const result = await privateJson(base, token, { signal, cache: 'no-store' });
    setState(result);
    if (!dirty.current)
      setContent(result.draft?.content || result.current || emptyContent(payload));
    setStale(false);
    return result;
  };
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((error) => {
      if (error.name !== 'AbortError') setMessage(error.message);
    });
    return () => controller.abort();
  }, [caseId, token]);
  const refresh = async () => {
    setBusy(true);
    try {
      await load();
      setMessage(
        dirty.current
          ? 'Publication state refreshed. Your entered fields were preserved; review them before submitting.'
          : 'Publication state refreshed.',
      );
    } catch (error) {
      setMessage('Could not refresh publication state: ' + error.message);
    } finally {
      setBusy(false);
    }
  };
  const mutate = async (path, body, success) => {
    if (busy || stale) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await privateJson(base + path, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setState(result);
      setConsentKey('');
      if (path === '/updates' || path === '/drafts') {
        dirty.current = false;
        setContent(result.draft?.content || result.current || emptyContent(payload));
      }
      setMessage(success);
      try {
        await refreshPeople();
      } catch {
        setMessage(success + ' The registry list could not refresh; reload it later.');
      }
    } catch (error) {
      if (error.status === 409) {
        setStale(true);
        setMessage(
          'The publication changed. Refresh the state and review your preserved entries before retrying.',
        );
      } else setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };
  const draft = state?.draft;
  const consentVersionKey = draft ? draft.version + ':' + draft.digest : '';
  const consent = !!consentVersionKey && consentKey === consentVersionKey;
  const current = state?.current;
  const revoked = current?.status === 'revoked';
  const editable = state && !revoked && (reviewer || state.passportId);
  return html`<section
    className="case-panel publication-panel"
    aria-labelledby=${reviewer ? 'review-publication' : 'owner-publication'}
  >
    <${reviewer ? 'h3' : 'h2'} id=${reviewer ? 'review-publication' : 'owner-publication'}>Public passport</${reviewer ? 'h3' : 'h2'}>
    <p>
      Service preview. Review and case-link access do not independently verify identity, ownership or legal rights. Evidence files stay private.
    </p>
    ${!state && !message && html`<p role="status">Loading publication state…</p>`}
    <p role="status" aria-live="polite">${message}</p>
    ${!state && message && html`<button type="button" className="btn line" disabled=${busy} onClick=${refresh}>Retry loading publication state</button>`}
    ${state && html`<button type="button" className="btn line" disabled=${busy} onClick=${refresh}>Refresh publication state</button>`}
    ${
      state &&
      html`<div>
        ${state.passportId && html`<p>Passport: <a href=${'#' + state.passportId}>${state.passportId}</a></p>`}
        ${current && html`<p>Public status: ${current.status}. ${current.status === 'published' ? 'The current public version remains visible while an update is reviewed.' : 'Revocation is terminal.'}</p>`}
        ${!state.passportId && html`<p>${reviewer ? 'Prepare a reviewed draft for the case-link holder to preview and consent to.' : 'A reviewer has not prepared a public draft yet.'}</p>`}
        ${
          draft &&
          html`<div>
            <h4>Version ${draft.version}: ${draft.status.replaceAll('_', ' ')}</h4>
            ${draft.reviewNote && html`<p>Reviewer message: ${draft.reviewNote}</p>`}
            <p>Exact public content for this version:</p>
            <${ContentPreview} content=${draft.content} />
            ${
              !reviewer &&
              draft.status === 'awaiting_consent' &&
              html`<div>
                <label className="publication-check"
                  ><input
                    type="checkbox"
                    checked=${consent}
                    onChange=${(e) => setConsentKey(e.target.checked ? consentVersionKey : '')}
                  />
                  ${'I consent to publishing the exact content shown above for version ' + draft.version + '.'}</label
                ><button
                  type="button"
                  className="btn"
                  disabled=${busy || stale || !consent}
                  onClick=${() => mutate('/publish', { version: draft.version, digest: draft.digest, consent: true }, 'Published successfully.')}
                >
                  Publish this version
                </button>
              </div>`
            }
            ${
              reviewer &&
              draft.status === 'pending_review' &&
              html`<div className="fg">
                <label htmlFor="publication-review-note"
                  >Message to case-link holder (required for rejection)</label
                ><textarea
                  id="publication-review-note"
                  className="in"
                  maxlength="1000"
                  value=${note}
                  onChange=${(e) => setNote(e.target.value)}
                ></textarea>
                <div className="rowbtns">
                  <button
                    type="button"
                    className="btn"
                    disabled=${busy || stale}
                    onClick=${() => mutate('/review', { version: draft.version, digest: draft.digest, decision: 'approve', note }, 'Update approved for owner consent.')}
                  >
                    Approve update</button
                  ><button
                    type="button"
                    className="btn line"
                    disabled=${busy || stale || !note.trim()}
                    onClick=${() => mutate('/review', { version: draft.version, digest: draft.digest, decision: 'reject', note }, 'Update rejected.')}
                  >
                    Reject update
                  </button>
                </div>
              </div>`
            }
          </div>`
        }
        ${
          editable &&
          html`<details className="publication-edit">
            <summary>${reviewer ? 'Prepare a reviewed draft' : 'Propose an update'}</summary>
            <p>
              ${reviewer ? 'Only these fields will be public. Check them before preparing the draft.' : 'This creates a private revision for review. Your current public passport stays unchanged until approval and fresh consent.'}
            </p>
            <form
              className="form"
              onSubmit=${(e) => {
                e.preventDefault();
                mutate(
                  reviewer ? '/drafts' : '/updates',
                  {
                    content: Object.fromEntries(fields.map(([key]) => [key, content[key] || ''])),
                    expectedVersion: state.latestVersion,
                  },
                  reviewer
                    ? 'Reviewed draft prepared for owner consent.'
                    : 'Update submitted for review.',
                );
              }}
            >
              ${fields.map(
                ([key, label, min, max]) =>
                  html`<div className="fg" key=${key}>
                    <label htmlFor=${'publication-' + key}>${label}</label>${
                      key === 'nature'
                        ? html`<select
                              className="in"
                              id=${'publication-' + key}
                              value=${content[key] || ''}
                              disabled
                            >
                              <option value="synthetic">Synthetic</option>
                              <option value="likeness">Based on a real person</option></select
                            ><span className="hint">Fixed to the approved application.</span>`
                        : key === 'holder'
                          ? html`<input
                                className="in"
                                id=${'publication-' + key}
                                value=${content[key] || ''}
                                readonly
                              /><span className="hint">Fixed to the approved application.</span>`
                          : key === 'description' || key === 'usageTerms'
                            ? html`<textarea
                                className="in"
                                id=${'publication-' + key}
                                value=${content[key] || ''}
                                minlength=${min}
                                maxlength=${max}
                                required
                                onChange=${(e) => {
                                  dirty.current = true;
                                  setContent((old) => ({ ...old, [key]: e.target.value }));
                                }}
                              ></textarea>`
                            : html`<input
                                className="in"
                                id=${'publication-' + key}
                                value=${content[key] || ''}
                                minlength=${min}
                                maxlength=${max}
                                required=${min > 0}
                                onChange=${(e) => {
                                  dirty.current = true;
                                  setContent((old) => ({ ...old, [key]: e.target.value }));
                                }}
                              />`
                    }
                  </div>`,
              )}
              <button className="btn" type="submit" disabled=${busy || stale}>
                ${reviewer ? 'Prepare draft for consent' : 'Submit update for review'}
              </button>
            </form>
          </details>`
        }
        ${
          !reviewer &&
          current?.status === 'published' &&
          html`<details className="publication-edit">
            <summary>Revoke public passport</summary>
            <p>
              Revocation is permanent for this passport. The reason will be public on its retained
              URL.
            </p>
            <form
              className="form"
              onSubmit=${(e) => {
                e.preventDefault();
                mutate(
                  '/revoke',
                  { version: current.version, reason, confirmed: true },
                  'Passport revoked.',
                );
              }}
            >
              <div className="fg">
                <label htmlFor="publication-reason">Public reason for revocation</label
                ><textarea
                  className="in"
                  id="publication-reason"
                  required
                  minlength="10"
                  maxlength="300"
                  value=${reason}
                  onChange=${(e) => setReason(e.target.value)}
                ></textarea>
              </div>
              <label className="publication-check"
                ><input
                  type="checkbox"
                  checked=${confirmed}
                  onChange=${(e) => setConfirmed(e.target.checked)}
                />
                I confirm this permanent revocation and understand the reason will be public.</label
              ><button className="btn line" type="submit" disabled=${busy || stale || !confirmed}>
                Revoke passport
              </button>
            </form>
          </details>`
        }
      </div>`
    }
  </section>`;
}

export { PublicationPanel, ContentPreview };
