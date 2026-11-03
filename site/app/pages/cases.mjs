import { PublicationPanel } from './publication.mjs';
import { html, useEffect, useRef, useState } from '../runtime.mjs';
import {
  CASE_DATE_TIME,
  CASE_DAY,
  CASE_ID_FORMAT,
  CASE_LABELS,
  CASE_STATUS_TEXT,
  CASE_TIME,
  CASE_TOKEN_FORMAT,
  CLOSED_CASES,
  EVIDENCE_LABELS,
  caseEventTitle,
  latestReviewerMessage,
  parsePrivateCaseLink,
} from '../domain/cases.mjs';
import { navigate } from '../domain/routing.mjs';
import { privateJson, submitCaseEvidence } from '../domain/api.mjs';
import { copy } from '../ui/common.mjs';

function CaseAccess({ embedded = false }) {
  const [link, setLink] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [id, setId] = useState('');
  const [token, setToken] = useState('');
  const [errors, setErrors] = useState({});
  const focusField = (field) =>
    requestAnimationFrame(() => document.getElementById(field)?.focus());
  const openLink = (event) => {
    event.preventDefault();
    const result = parsePrivateCaseLink(link, location.href);
    if (result.error) {
      setLinkError(result.error);
      focusField('case-link');
      return;
    }
    setLinkError('');
    navigate('case/' + result.id + '/' + result.token);
  };
  const submit = (event) => {
    event.preventDefault();
    const code = id.trim().toUpperCase(),
      secret = token.trim(),
      nextErrors = {};
    if (!CASE_ID_FORMAT.test(code))
      nextErrors.id = 'Enter a case number such as SPR-2026-0123456789AB or RPT-2026-0123456789AB.';
    if (!CASE_TOKEN_FORMAT.test(secret))
      nextErrors.token =
        'Enter the complete 43-character access token: the last part of your private link.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      focusField(nextErrors.id ? 'case-id' : 'case-token');
      return;
    }
    navigate('case/' + code + '/' + secret);
  };
  return html`<div className="wrap formwrap">
    <ol className="crumbs" aria-label="Breadcrumb">
      <li><a href="#home">Registry</a></li>
      <li aria-current="page">Case status</li>
    </ol>
    <${embedded ? 'h2' : 'h1'} className="fh1" id=${embedded ? undefined : 'h1'} tabindex="-1">Open a private case link</${embedded ? 'h2' : 'h1'}>
    <p className="sub">
      Paste the private link you saved after submitting an application or report.
    </p>
    <form className="form" onSubmit=${openLink} novalidate>
      <div className=${'fg' + (linkError ? ' err' : '')}>
        <label htmlFor="case-link">Private case link</label>
        <span className="hint" id="case-link-hint"
          >Use the whole link. It contains both your case number and access token.</span
        >
        ${linkError && html`<span className="emsg" id="case-link-error">${linkError}</span>`}
        <input
          className=${'in mono' + (linkError ? ' err' : '')}
          id="case-link"
          type=${showLink ? 'text' : 'password'}
          inputmode="url"
          value=${link}
          onChange=${(e) => setLink(e.target.value)}
          autocomplete="off"
          autocapitalize="none"
          spellcheck=${false}
          required
          aria-invalid=${linkError ? 'true' : undefined}
          aria-describedby=${'case-link-hint' + (linkError ? ' case-link-error' : '')}
        />
        <button
          type="button"
          className="tlink case-secret-toggle"
          aria-controls="case-link"
          onClick=${() => setShowLink((value) => !value)}
        >
          ${showLink ? 'Hide link' : 'Show link'}
        </button>
      </div>
      <div><button className="btn" type="submit">Open case</button></div>
    </form>
    <p className="private-note">
      Anyone with this link can view your case and upload evidence. Keep it private.
    </p>
    <details className="case-access-details">
      <summary>Enter case number and token separately</summary>
      <form className="form" onSubmit=${submit} novalidate>
        <div className=${'fg' + (errors.id ? ' err' : '')}>
          <label htmlFor="case-id">Case number</label
          ><span className="hint" id="case-id-hint"
            >Starts with SPR for an application or RPT for a report.</span
          >
          ${errors.id && html`<span className="emsg" id="case-id-error">${errors.id}</span>`}
          <input
            className=${'in mono' + (errors.id ? ' err' : '')}
            id="case-id"
            value=${id}
            onChange=${(e) => setId(e.target.value)}
            autocomplete="off"
            autocapitalize="characters"
            spellcheck=${false}
            required
            aria-invalid=${errors.id ? 'true' : undefined}
            aria-describedby=${'case-id-hint' + (errors.id ? ' case-id-error' : '')}
          />
        </div>
        <div className=${'fg' + (errors.token ? ' err' : '')}>
          <label htmlFor="case-token">Private access token</label
          ><span className="hint" id="case-token-hint"
            >The 43 characters after the last slash in your private link.</span
          >
          ${errors.token && html`<span className="emsg" id="case-token-error">${errors.token}</span>`}
          <input
            className=${'in mono' + (errors.token ? ' err' : '')}
            id="case-token"
            type="password"
            value=${token}
            onChange=${(e) => setToken(e.target.value)}
            autocomplete="off"
            spellcheck=${false}
            required
            aria-invalid=${errors.token ? 'true' : undefined}
            aria-describedby=${'case-token-hint' + (errors.token ? ' case-token-error' : '')}
          />
        </div>
        <div><button className="btn" type="submit">Open case with number and token</button></div>
      </form>
    </details>
    <details className="case-access-details">
      <summary>Lost your private link?</summary>
      <p>
        The link is shown on the confirmation screen after submission. Look for a copy you saved or
        the case page in your browser history. This prototype does not email the link.
      </p>
      <p>
        If you no longer have the link or its access token, this prototype cannot restore access. A
        case number or email address alone is not enough.
      </p>
    </details>
  </div>`;
}

function CasePage({ caseId, accessToken, toast }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('images');
  const [file, setFile] = useState(null);
  const [sourceStatement, setSourceStatement] = useState('');
  const [message, setMessage] = useState('');
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const fileInput = useRef(null);
  const load = async (signal) => {
    const result = await privateJson('/api/v1/cases/' + caseId, accessToken, { signal });
    setData(result);
    setError('');
  };
  useEffect(() => {
    setData(null);
    setError('');
    const controller = new AbortController();
    load(controller.signal).catch((e) => {
      if (e.name !== 'AbortError') setError(e.message);
    });
    return () => controller.abort();
  }, [caseId, accessToken]);
  const upload = async (event) => {
    event.preventDefault();
    if (busy || refreshNeeded) return;
    if (!file) {
      setMessage('Choose a file before uploading.');
      return;
    }
    if (sourceStatement.trim().length < 10 || sourceStatement.trim().length > 500) {
      setMessage('Describe where the file came from in 10 to 500 characters.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage('The file must be 5 MiB or smaller.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const refreshed = await submitCaseEvidence(
        caseId,
        accessToken,
        kind,
        file,
        sourceStatement,
        () => {
          setFile(null);
          setSourceStatement('');
          if (fileInput.current) fileInput.current.value = '';
        },
        load,
      );
      setRefreshNeeded(!refreshed);
      setMessage(
        refreshed
          ? 'Evidence uploaded. A reviewer has not examined it yet.'
          : 'Evidence uploaded, but the case could not refresh. Refresh the case before adding another file.',
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };
  const refreshCase = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await load();
      setRefreshNeeded(false);
      setMessage('Case refreshed. The uploaded evidence is shown below.');
    } catch {
      setMessage('Could not refresh the case. The file was uploaded; try refreshing again.');
    } finally {
      setBusy(false);
    }
  };
  const privateLink = accessToken
    ? location.href.split('#')[0] + '#case/' + caseId + '/' + accessToken
    : '';
  const latestMessage = data ? latestReviewerMessage(data.events, data.status) : null;
  return html`<div className="wrap case-page">
    <ol className="crumbs" aria-label="Breadcrumb">
      <li><a href="#home">Registry</a></li>
      <li aria-current="page">Case status</li>
    </ol>
    <header className="case-heading">
      <h1 id="h1" tabindex="-1">Case <span className="case-number">${caseId}</span></h1>
      <p className="sub">
        ${accessToken ? 'This page is available to anyone holding its private link. Keep the link confidential.' : 'This case is available through your signed-in account.'}
      </p>
      <div className="rowbtns">
        ${
          accessToken &&
          html`<button
              className="btn line"
              type="button"
              onClick=${() => copy(privateLink, 'Private case link', toast)}
            >
              Copy private link
            </button>
            <a className="btn line" href=${'#account/claim/' + caseId + '/' + accessToken}
              >Add to my account</a
            >`
        }
        <a className="tlink" href="#account">My cases</a>
      </div>
    </header>
    ${error && html`<p className="private-note" role="alert">${error} ${!accessToken && html`<a href="#account">Sign in to your account</a>`}</p>`}
    ${!data && !error && html`<p className="private-note" role="status">Loading case status…</p>`}
    ${
      data &&
      html`<div>
        <section className=${'case-summary status-' + data.status} aria-labelledby="case-current">
          <h2 id="case-current">Current status</h2>
          <p className="case-summary-status">${CASE_LABELS[data.status] || data.status}</p>
          <p className="case-summary-text">
            ${CASE_STATUS_TEXT[data.status] || 'Read the case history for the latest update.'}
          </p>
          ${
            latestMessage &&
            html`<div className="case-evidence-note">
              <b>Reviewer message for this status</b>
              <p>${latestMessage.note}</p>
              <small
                ><time datetime=${latestMessage.at}
                  >${CASE_DATE_TIME.format(new Date(latestMessage.at))}</time
                ></small
              >
            </div>`
          }
          <dl className="case-facts">
            <div>
              <dt>Case type</dt>
              <dd>${data.kind === 'application' ? 'Application' : 'Report'}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>
                <time datetime=${data.createdAt}
                  >${CASE_DATE_TIME.format(new Date(data.createdAt))}</time
                >
              </dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>
                <time datetime=${data.updatedAt}
                  >${CASE_DATE_TIME.format(new Date(data.updatedAt))}</time
                >
              </dd>
            </div>
          </dl>
        </section>
        ${data.kind === 'application' && data.status === 'approved' && html`<${PublicationPanel} key=${caseId} caseId=${caseId} token=${accessToken} />`}
        <section className="case-panel" aria-labelledby="case-evidence">
          <h2 id="case-evidence">Evidence</h2>
          <p className="sub">
            Files are private to this case and the reviewer. SHA-256 records file integrity; it does
            not prove who created a file or whether its claims are true. Do not upload passwords or
            access keys.
          </p>
          ${
            data.evidence.length
              ? html`<ul className="case-evidence-list">
                  ${data.evidence.map(
                    (item) =>
                      html`<li key=${item.id}>
                        <div className="case-evidence-head">
                          <h3>${item.fileName}</h3>
                          <span className="case-evidence-state"
                            >${item.reviewStatus === 'pending' ? 'Awaiting review' : item.reviewStatus === 'accepted' ? 'Accepted' : item.reviewStatus === 'rejected' ? 'Rejected' : item.reviewStatus}</span
                          >
                        </div>
                        <div className="case-evidence-facts">
                          <span>${EVIDENCE_LABELS[item.kind] || item.kind}</span
                          ><span>${(item.bytes / 1024).toFixed(1)} KiB</span
                          ><span
                            >Uploaded
                            <time datetime=${item.createdAt}
                              >${CASE_DATE_TIME.format(new Date(item.createdAt))}</time
                            ></span
                          >
                        </div>
                        <p className="case-evidence-source">
                          <b>Source declared by submitter</b
                          >${item.sourceStatement || 'Not recorded'}
                        </p>
                        <code className="hash case-evidence-hash">SHA-256: ${item.sha256}</code>
                        ${item.reviewedAt && html`<p className="case-evidence-facts">Reviewed <time datetime=${item.reviewedAt}>${CASE_DATE_TIME.format(new Date(item.reviewedAt))}</time></p>`}
                        ${item.reviewNote && html`<p className="case-evidence-note"><b>Reviewer message</b><br />${item.reviewNote}</p>`}
                      </li>`,
                  )}
                </ul>`
              : html`<p className="case-evidence-empty">
                  ${CLOSED_CASES.has(data.status) ? 'No files were uploaded for this case.' : 'No files uploaded yet. Use the form below to add the first file.'}
                </p>`
          }
          ${
            !CLOSED_CASES.has(data.status) &&
            data.evidence.length < 5 &&
            html`${
                latestMessage &&
                html`<div className="case-evidence-note">
                  <b>Reviewer message for this status</b>
                  <p>${latestMessage.note}</p>
                </div>`
              }
              <div className="case-upload-head">
                <h3>Add evidence</h3>
                <span>${data.evidence.length} of 5 files uploaded</span>
              </div>
              <form className="form case-upload" onSubmit=${upload}>
                <div className="fg">
                  <label htmlFor="evidence-kind">What does this file show?</label
                  ><select
                    className="in"
                    id="evidence-kind"
                    value=${kind}
                    onChange=${(e) => setKind(e.target.value)}
                  >
                    ${Object.entries(EVIDENCE_LABELS).map(([value, label]) => html`<option value=${value} key=${value}>${label}</option>`)}
                  </select>
                </div>
                <div className="fg">
                  <label htmlFor="evidence-source">Where did this file come from?</label
                  ><span className="hint" id="evidence-source-hint"
                    >Name the creator, issuer, original channel or model version. If unknown, say
                    how you obtained it. This is your claim for a reviewer to assess.</span
                  ><textarea
                    className="in"
                    id="evidence-source"
                    aria-describedby="evidence-source-hint"
                    value=${sourceStatement}
                    onChange=${(e) => setSourceStatement(e.target.value)}
                    maxlength="500"
                    required
                  ></textarea>
                </div>
                <div className="fg">
                  <label id="evidence-file-label" htmlFor="evidence-file"
                    >JPEG, PNG or PDF, up to 5 MiB</label
                  >
                  <label className="file-picker" htmlFor="evidence-file"
                    ><input
                      id="evidence-file"
                      ref=${fileInput}
                      className="file-picker-input"
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf"
                      aria-labelledby="evidence-file-label"
                      aria-describedby="evidence-file-name"
                      onChange=${(e) => setFile(e.target.files?.[0] || null)}
                    />
                    <span className="file-picker-button">Choose file</span
                    ><span
                      className=${'file-picker-name' + (file ? ' selected' : '')}
                      id="evidence-file-name"
                      aria-live="polite"
                      >${file ? file.name : 'No file selected'}</span
                    ></label
                  >
                </div>
                <div>
                  <button className="btn" type="submit" disabled=${busy || refreshNeeded}>
                    ${busy && !refreshNeeded ? 'Uploading…' : 'Upload evidence'}
                  </button>
                </div>
              </form>`
          }
          <p role="status" style=${{ marginTop: '12px' }}>${message}</p>
          ${refreshNeeded && html`<button className="btn line" type="button" disabled=${busy} onClick=${refreshCase}>${busy ? 'Refreshing…' : 'Refresh case'}</button>`}
        </section>
        <section className="case-panel" aria-labelledby="case-history">
          <div className="case-history-head">
            <h2 id="case-history">Case history</h2>
            <span className="case-history-count"
              >${data.events.length} ${data.events.length === 1 ? 'event' : 'events'}</span
            >
          </div>
          <p className="sub">Submissions, file checks and decisions in the order they happened.</p>
          ${
            data.events.length
              ? html`<ol className="case-timeline">
                  ${data.events.map((item, index) => {
                    const at = new Date(item.at),
                      evidenceName = data.evidence.find(
                        (file) => file.id === item.evidenceId,
                      )?.fileName;
                    return html`<li key=${index}>
                      <div className="case-timeline-date">
                        <time datetime=${item.at}
                          ><span className="case-timeline-day">${CASE_DAY.format(at)}</span
                          ><span className="case-timeline-year">${at.getFullYear()}</span
                          ><span className="case-timeline-clock"
                            >${CASE_TIME.format(at)}</span
                          ></time
                        >
                      </div>
                      <div className="case-timeline-entry">
                        <div className="case-timeline-title">
                          <h3>${caseEventTitle(item, data.kind)}</h3>
                          ${item.action !== 'status_changed' && html`<span className="case-timeline-status">${CASE_LABELS[item.status] || item.status}</span>`}
                        </div>
                        <p className="case-timeline-actor">
                          ${item.actor === 'reviewer' ? 'Registry reviewer' : 'Submitter'}
                        </p>
                        ${item.action === 'submitted' && html`<p className="case-timeline-detail">A private case was opened for review.</p>`}
                        ${evidenceName && html`<p className="case-timeline-file">File: ${evidenceName}</p>`}
                        ${
                          item.note &&
                          html`<div className="case-timeline-note">
                            <span>Reviewer message</span>
                            <p>${item.note}</p>
                          </div>`
                        }
                      </div>
                    </li>`;
                  })}
                </ol>`
              : html`<p className="case-history-empty">
                  No recorded events are available for this case.
                </p>`
          }
        </section>
      </div>`
    }
  </div>`;
}

export { CaseAccess, CasePage };
