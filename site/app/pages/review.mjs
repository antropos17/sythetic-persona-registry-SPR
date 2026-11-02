import { html, useState } from '../runtime.mjs';
import { privateJson } from '../domain/api.mjs';
import { createReviewActions } from '../domain/review-actions.mjs';
import {
  CASE_LABELS,
  EVIDENCE_LABELS,
  REVIEW_NEXT,
  reviewAnswerLabel,
  reviewAnswerValue,
} from '../domain/cases.mjs';

function ReviewConsole() {
  const [draft, setDraft] = useState('');
  const [token, setToken] = useState('');
  const [cases, setCases] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState(null);
  const [next, setNext] = useState('');
  const [note, setNote] = useState('');
  const [decisionMessage, setDecisionMessage] = useState('');
  const [fileNotes, setFileNotes] = useState({});
  const [fileMessages, setFileMessages] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const loadCase = async (id, secret = token) => {
    const item = await privateJson('/api/v1/review/cases/' + id, secret);
    setSelected(item);
    setNext(REVIEW_NEXT[item.kind]?.[item.status]?.[0] || '');
    setNote('');
    setDecisionMessage('');
    setFileMessages({});
    setError('');
  };
  const refreshList = async (secret = token) => {
    const result = await privateJson('/api/v1/review/cases', secret);
    setCases(result.cases);
    setHasMore(result.cases.length === 50);
  };
  const selectCase = async (id) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await loadCase(id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const signIn = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const secret = draft.trim();
      await refreshList(secret);
      setToken(secret);
      setDraft('');
      setMessage('Reviewer access open for this tab.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const loadMore = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await privateJson('/api/v1/review/cases?offset=' + cases.length, token);
      setCases((current) => [...current, ...result.cases]);
      setHasMore(result.cases.length === 50);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const { changeStatus, decideFile } = createReviewActions({
    selected,
    busy,
    next,
    note,
    token,
    fileNotes,
    privateJson,
    refreshList,
    setBusy,
    setError,
    setMessage,
    setDecisionMessage,
    setSelected,
    setNext,
    setNote,
    setFileNotes,
    setFileMessages,
  });
  const download = async (item) => {
    setError('');
    try {
      const response = await fetch('/api/v1/review/evidence/' + item.id + '/file', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || 'File unavailable');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        item.id +
        (item.mime === 'application/pdf' ? '.pdf' : item.mime === 'image/png' ? '.png' : '.jpg');
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError(e.message);
    }
  };
  const choices = selected ? REVIEW_NEXT[selected.kind]?.[selected.status] || [] : [];
  return html`<div className="wrap review-page">
    <ol className="crumbs" aria-label="Breadcrumb">
      <li><a href="#home">Registry</a></li>
      <li aria-current="page">Review console</li>
    </ol>
    <h1 id="h1" tabindex="-1">Review console</h1>
    <p className="sub">
      Private application and report queue. A configured operator token is required. Reviewer
      messages on this page are visible to the submitter.
    </p>
    ${error && html`<p className="private-note" role="alert">${error}</p>`}
    <p role="status" style=${{ marginTop: '12px' }}>${message}</p>
    ${
      !token
        ? html`<form className="form" onSubmit=${signIn} style=${{ maxWidth: '520px' }}>
            <div className="fg">
              <label htmlFor="review-token">Operator access token</label
              ><input
                id="review-token"
                className="in"
                type="password"
                value=${draft}
                onChange=${(e) => setDraft(e.target.value)}
                autocomplete="off"
                required
              />
            </div>
            <div>
              <button className="btn" type="submit" disabled=${busy}>
                ${busy ? 'Checking…' : 'Open review queue'}
              </button>
            </div>
          </form>`
        : html`<div>
            <div className="rowbtns" style=${{ marginTop: '18px' }}>
              <button
                className="btn line"
                type="button"
                disabled=${busy}
                onClick=${() => {
                  setToken('');
                  setSelected(null);
                  setCases([]);
                  setMessage('');
                  setError('');
                }}
              >
                Close reviewer access</button
              ><button
                className="tlink"
                type="button"
                disabled=${busy}
                onClick=${() => refreshList().catch((e) => setError(e.message))}
              >
                Refresh queue
              </button>
            </div>
            <div className="review-grid">
              <aside aria-label="Case queue">
                <h2 className="h2" style=${{ fontSize: '25px', marginBottom: '12px' }}>Cases</h2>
                ${
                  cases.length
                    ? html`<ul className="review-queue">
                        ${cases.map(
                          (item) =>
                            html`<li key=${item.id}>
                              <button
                                type="button"
                                disabled=${busy}
                                aria-current=${selected?.id === item.id ? 'true' : undefined}
                                onClick=${() => selectCase(item.id)}
                              >
                                <b className="mono">${item.id}</b
                                ><span
                                  >${item.kind} · ${CASE_LABELS[item.status] || item.status}</span
                                >
                              </button>
                            </li>`,
                        )}
                      </ul>`
                    : html`<p>No cases yet.</p>`
                }
                ${hasMore && html`<button className="btn line" type="button" onClick=${loadMore} disabled=${busy} style=${{ marginTop: '14px' }}>Load more</button>`}
              </aside>
              <div className="review-detail">
                ${
                  !selected
                    ? html`<p>Select a case to review its answers and evidence.</p>`
                    : html`<div>
                        <h2 className="h2" style=${{ fontSize: '28px' }}>${selected.id}</h2>
                        <p className="case-meta">
                          ${selected.kind} · ${CASE_LABELS[selected.status] || selected.status} ·
                          ${new Date(selected.createdAt).toLocaleString()}
                        </p>
                        <section className="case-panel">
                          <h3>Submitted answers</h3>
                          <dl className="review">
                            ${Object.entries(selected.payload).map(
                              ([key, value]) =>
                                html`<div key=${key}>
                                  <dt>${reviewAnswerLabel(key)}</dt>
                                  <dd>${reviewAnswerValue(key, value)}</dd>
                                </div>`,
                            )}
                          </dl>
                        </section>
                        <section className="case-panel">
                          <h3>Evidence</h3>
                          ${
                            selected.evidence.length
                              ? html`<ul className="case-list">
                                  ${selected.evidence.map(
                                    (item) =>
                                      html`<li key=${item.id}>
                                        <b>${item.fileName}</b> ·
                                        ${EVIDENCE_LABELS[item.kind] || item.kind} ·
                                        ${item.reviewStatus}
                                        <small
                                          >${(item.bytes / 1024).toFixed(1)} KiB ·
                                          ${new Date(item.createdAt).toLocaleString()}</small
                                        >
                                        <p>
                                          Source declared by submitter:
                                          ${item.sourceStatement || 'Not recorded'}
                                        </p>
                                        <span className="hash">SHA-256: ${item.sha256}</span>
                                        ${item.reviewedAt && html`<small>Reviewed ${new Date(item.reviewedAt).toLocaleString()}</small>`}
                                        ${item.reviewNote && html`<p>Decision reason: ${item.reviewNote}</p>`}
                                        <div className="rowbtns" style=${{ marginTop: '12px' }}>
                                          <button
                                            type="button"
                                            className="btn line"
                                            onClick=${() => download(item)}
                                          >
                                            Download privately
                                          </button>
                                        </div>
                                        ${
                                          choices.length > 0 &&
                                          html`<div className="fg">
                                            <label htmlFor=${'file-note-' + item.id}
                                              >Reason for reviewing ${item.fileName}</label
                                            ><textarea
                                              className="in"
                                              id=${'file-note-' + item.id}
                                              maxlength="1000"
                                              value=${fileNotes[item.id] || ''}
                                              onChange=${(e) => setFileNotes((current) => ({ ...current, [item.id]: e.target.value }))}
                                            ></textarea>
                                            <div className="rowbtns">
                                              <button
                                                className="btn"
                                                type="button"
                                                disabled=${busy}
                                                onClick=${() => decideFile(item, 'accepted')}
                                              >
                                                Accept evidence</button
                                              ><button
                                                className="btn line"
                                                type="button"
                                                disabled=${busy}
                                                onClick=${() => decideFile(item, 'rejected')}
                                              >
                                                Reject evidence
                                              </button>
                                            </div>
                                          </div>`
                                        }
                                        <p role="status" aria-live="polite">
                                          ${fileMessages[item.id] || ''}
                                        </p>
                                      </li>`,
                                  )}
                                </ul>`
                              : html`<p className="sub">
                                  No evidence files uploaded. A declared evidence category is not a
                                  reviewed file.
                                </p>`
                          }
                        </section>
                        <section className="case-panel">
                          <h3>Change case status</h3>
                          <p>
                            Current status:
                            <b>${CASE_LABELS[selected.status] || selected.status}</b>
                          </p>
                          ${
                            choices.length > 0 &&
                            html`<form className="form" onSubmit=${changeStatus}>
                              <div className="fg">
                                <label htmlFor="next-status">New status</label
                                ><select
                                  className="in"
                                  id="next-status"
                                  value=${next}
                                  onChange=${(e) => setNext(e.target.value)}
                                >
                                  ${choices.map((value) => html`<option key=${value} value=${value}>${CASE_LABELS[value] || value}</option>`)}
                                </select>
                              </div>
                              <div className="fg">
                                <label htmlFor="review-note">Message to submitter</label
                                ><textarea
                                  className="in"
                                  id="review-note"
                                  aria-describedby="review-note-hint"
                                  maxlength="1000"
                                  value=${note}
                                  onChange=${(e) => setNote(e.target.value)}
                                ></textarea
                                ><span className="hint" id="review-note-hint"
                                  >Required for requests for evidence and final decisions.</span
                                >
                              </div>
                              <div>
                                <button className="btn" type="submit" disabled=${busy}>
                                  ${busy ? 'Saving…' : 'Save decision'}
                                </button>
                              </div>
                            </form>`
                          }
                          <p role="status" style=${{ marginTop: '12px' }}>${decisionMessage}</p>
                        </section>
                        <section className="case-panel">
                          <h3>Activity</h3>
                          <ol className="case-list">
                            ${selected.events.map((item, index) => html`<li key=${index}><b>${item.action}</b> · ${CASE_LABELS[item.status] || item.status}<small>${new Date(item.at).toLocaleString()} · ${item.actor}</small>${item.note && html`<p>${item.note}</p>`}</li>`)}
                          </ol>
                        </section>
                      </div>`
                }
              </div>
            </div>
          </div>`
    }
  </div>`;
}

export { ReviewConsole };
