import { html, useEffect, useRef, useState } from '../runtime.mjs';
import {
  APPLY0,
  EVIDENCE,
  finishApplicationDraft,
  persistApplicationDraft,
  restoreApplication,
  validateApplication,
} from '../domain/forms.mjs';
import { store } from '../domain/storage.mjs';
import { submitToRegistry } from '../domain/api.mjs';
import { copy } from '../ui/common.mjs';

function Apply({ toast }) {
  const [d, setD] = useState(() => restoreApplication(store.get('spr-apply')));
  const [step, setStep] = useState(() => {
    const value = store.get('spr-apply-step');
    return Number.isInteger(value) && value >= 1 && value <= 4 ? value : 1;
  });
  const [reviewDraft, setReviewDraft] = useState(() => {
    const value = store.get('spr-apply-review');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? restoreApplication(value)
      : null;
  });
  const [err, setErr] = useState(null);
  const [ref, setRef] = useState(null);
  const [accessToken, setAccessToken] = useState('');
  const [demo, setDemo] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState('');
  const [draftStatus, setDraftStatus] = useState('idle');
  const sum = useRef(null);
  useEffect(() => {
    if (!ref)
      setDraftStatus(persistApplicationDraft(d, step, reviewDraft) ? 'saved' : 'unavailable');
  }, [d, step, ref, reviewDraft]);
  const update = (next) => {
    setD(next);
    setErr((current) => (current === null ? null : validateApplication(next, step)));
  };
  const set = (k) => (e) => update({ ...d, [k]: e.target.value });
  const toggleEv = (k) =>
    update({
      ...d,
      evidence: d.evidence.includes(k) ? d.evidence.filter((x) => x !== k) : [...d.evidence, k],
    });
  const validate = (n) => validateApplication(d, n);
  const focusTop = () =>
    setTimeout(() => {
      const h = document.getElementById('h1');
      h && h.focus();
      window.scrollTo({ top: 0 });
    }, 0);
  const showErrors = (section, errors) => {
    setStep(section);
    setErr(errors);
    setTimeout(() => sum.current && sum.current.focus(), 0);
  };
  const validateReview = () => {
    for (const section of [1, 2, 3]) {
      const errors = validate(section);
      if (Object.keys(errors).length) {
        showErrors(section, errors);
        return false;
      }
    }
    return true;
  };
  const edit = (section) => {
    setReviewDraft({ ...d, evidence: [...d.evidence] });
    setErr(null);
    setServerError('');
    setStep(section);
    focusTop();
  };
  const cancelEdit = () => {
    setD(reviewDraft);
    setReviewDraft(null);
    setErr(null);
    setStep(4);
    focusTop();
  };
  const next = (e) => {
    e.preventDefault();
    const er = validate(step);
    if (Object.keys(er).length) {
      showErrors(step, er);
      return;
    }
    if (reviewDraft && !validateReview()) return;
    setErr(null);
    setStep(reviewDraft ? 4 : step + 1);
    setReviewDraft(null);
    focusTop();
  };
  const back = () => {
    setErr(null);
    setStep(Math.max(1, step - 1));
    focusTop();
  };
  const submit = async () => {
    if (pending) return;
    if (!validateReview()) {
      setReviewDraft({ ...d, evidence: [...d.evidence] });
      return;
    }
    setPending(true);
    setServerError('');
    try {
      const result = await submitToRegistry('/api/v1/applications', d);
      setRef(result.id);
      setAccessToken(result.accessToken || '');
      setDemo(!!result.demo);
      finishApplicationDraft(result);
      focusTop();
    } catch (e) {
      setServerError(e.message || 'The application could not be saved. Please try again.');
    } finally {
      setPending(false);
    }
  };
  const restart = () => {
    setD(APPLY0);
    setStep(1);
    setReviewDraft(null);
    setRef(null);
    setAccessToken('');
    setErr(null);
    focusTop();
  };
  const clearDraft = () => {
    if (!window.confirm('Clear this saved application draft from this browser?')) return;
    store.del('spr-apply');
    store.del('spr-apply-step');
    store.del('spr-apply-review');
    setD({ ...APPLY0, evidence: [] });
    setReviewDraft(null);
    setStep(1);
    setErr(null);
    setServerError('');
    focusTop();
  };
  const fe = (k) => err && err[k];
  const Text = (k, label, hint, type, extra) =>
    html`<div className=${'fg' + (fe(k) ? ' err' : '')}>
      <label htmlFor=${'f-' + k}>${label}</label
      >${hint && html`<span className="hint" id=${'h-' + k}>${hint}</span>`}
      ${fe(k) && html`<span className="emsg" id=${'e-' + k}><span className="sr">Error: </span>${err[k]}</span>`}
      <input
        id=${'f-' + k}
        className=${'in' + (fe(k) ? ' err' : '')}
        type=${type || 'text'}
        value=${d[k]}
        onChange=${set(k)}
        ...${extra || {}}
        aria-invalid=${fe(k) ? 'true' : undefined}
        aria-describedby=${[hint ? 'h-' + k : '', fe(k) ? 'e-' + k : ''].join(' ').trim() || undefined}
      />
    </div>`;
  const Radios = (k, legend, opts) =>
    html`<fieldset
      className=${'fg' + (fe(k) ? ' err' : '')}
      aria-describedby=${fe(k) ? 'e-' + k : undefined}
    >
      <legend>${legend}</legend>
      ${fe(k) && html`<span className="emsg" id=${'e-' + k}><span className="sr">Error: </span>${err[k]}</span>`}
      <div className="opts">
        ${opts.map(([v, l, h], n) => html`<label key=${v} className="opt"><input type="radio" id=${n === 0 ? 'f-' + k : undefined} name=${k} value=${v} checked=${d[k] === v} onChange=${set(k)} /><span>${l}${h && html`<small>${h}</small>`}</span></label>`)}
      </div>
    </fieldset>`;
  if (ref)
    return html`<div className="wrap formwrap">
      <div className="done">
        <h1 id="h1" tabindex="-1">${demo ? 'Application preview' : 'Application received'}</h1>
        <p style=${{ marginTop: '10px' }}>${demo ? 'Demo number' : 'Your case number'}</p>
        <span className="ref">${ref}</span>
      </div>
      <h2 className="h2" style=${{ fontSize: '26px', marginTop: '36px' }}>What happens next</h2>
      <p style=${{ marginTop: '10px' }}>
        ${demo ? 'This standalone preview did not send your answers to the registry. Your draft remains in this browser if saving is available.' : 'Your answers were stored. Review starts when an operator is configured and opens this case; no email is sent.'}
      </p>
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
      <div className="rowbtns" style=${{ marginTop: '28px' }}>
        <a className="btn line" href="#notices">Back to notices</a
        ><button type="button" className="tlink" onClick=${restart}>
          Start another application
        </button>
      </div>
    </div>`;
  const titles = [
    'About the persona',
    'Who holds the rights',
    'Evidence you can send',
    'Check your answers',
  ];
  const stepNames = ['Persona', 'Rights holder', 'Evidence', 'Review'];
  const stepHelp = [
    'Start with the public identity people will recognise. You can revise these answers before submitting.',
    'Tell us who controls this persona and where a reviewer could follow up.',
    'Choose the materials you can provide. You will upload files after submission.',
    'Read the details before sending. Submitting opens a private case; it does not publish a passport.',
  ];
  const yes =
    d.nature === 'likeness'
      ? 'Yes, with the person’s signed consent'
      : d.nature === 'synthetic'
        ? 'No, it is fully synthetic'
        : '';
  return html`<div className="wrap formwrap">
    <ol className="crumbs" aria-label="Breadcrumb" style=${{ paddingTop: 0 }}>
      <li><a href="#home">Registry</a></li>
      <li aria-current="page">Register a persona</li>
    </ol>
    <ol className="apply-steps" aria-label="Application progress">
      ${stepNames.map((name, index) => html`<li key=${name} className=${index + 1 === step ? 'current' : index + 1 < step ? 'complete' : ''} aria-current=${index + 1 === step ? 'step' : undefined}><strong>${index + 1}</strong>${name}</li>`)}
    </ol>
    ${reviewDraft ? html`<button type="button" className="tlink" onClick=${cancelEdit} style=${{ marginBottom: '16px' }}>Cancel changes</button>` : step > 1 && html`<button type="button" className="tlink" onClick=${back} style=${{ marginBottom: '16px' }}>Back</button>`}
    <h1 className="fh1" id="h1" tabindex="-1">${titles[step - 1]}</h1>
    <p className="apply-intro">
      ${reviewDraft ? 'Update this section, then save your changes to return to the review.' : stepHelp[step - 1]}
    </p>
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
                  href=${'#f-' + k}
                  onClick=${(e) => {
                    e.preventDefault();
                    const el = document.getElementById(k === 'evidence' ? 'f-ev-0' : 'f-' + k);
                    el && el.focus();
                  }}
                  >${m}</a
                >
              </li>`,
          )}
        </ul>
      </div>`
    }
    ${
      step < 4 &&
      html`<form className="form apply-form" onSubmit=${next} novalidate>
        ${
          step === 1 &&
          html`${Text('name', 'Persona’s public name', 'As it appears on the persona’s channels', 'text', { autoComplete: 'off', maxLength: 120 })}
          ${Text('handle', 'Main channel handle', 'The account with the largest audience', 'text', { autoComplete: 'off', spellCheck: false, maxLength: 81 })}
          ${Radios('nature', 'Is the persona based on a real person?', [
            ['synthetic', 'No, it is fully synthetic', ''],
            [
              'likeness',
              'Yes, with the person’s signed consent',
              'Select consent in section 3, then upload the document from your private case page',
            ],
          ])}
          ${Text('langs', 'Languages the persona speaks (optional)', 'For example, Azerbaijani and Russian', 'text', { maxLength: 160 })}`
        }
        ${
          step === 2 &&
          html`${Radios('holderType', 'Who holds the rights to the persona?', [
            ['person', 'A person', ''],
            ['company', 'A company', 'Use the name on its registration certificate'],
          ])}
          ${Text('holder', d.holderType === 'company' ? 'Company name' : 'Full name', '', 'text', { autoComplete: d.holderType === 'company' ? 'organization' : 'name', maxLength: 160 })}
          ${Text('email', 'Email address', 'Contact address for future follow-up. This prototype does not send email.', 'email', { autoComplete: 'email', spellCheck: false, maxLength: 254 })}`
        }
        ${
          step === 3 &&
          html`<fieldset
            className=${'fg' + (fe('evidence') ? ' err' : '')}
            aria-describedby=${fe('evidence') ? 'e-evidence' : undefined}
          >
            <legend>Which evidence do you have?</legend>
            <span className="hint"
              >Select all that apply. A reviewer will examine any files you upload.</span
            >
            ${fe('evidence') && html`<span className="emsg" id="e-evidence"><span className="sr">Error: </span>${err.evidence}</span>`}
            <div className="opts">
              ${EVIDENCE.map(([k, l], n) => html`<label key=${k} className="opt"><input type="checkbox" id=${'f-ev-' + n} checked=${d.evidence.includes(k)} onChange=${() => toggleEv(k)} /><span>${l}</span></label>`)}
            </div>
          </fieldset>`
        }
        <div className="rowbtns apply-actions">
          <button type="submit" className="btn">
            ${reviewDraft ? 'Save changes and return to review' : 'Continue'}</button
          ><span className="saved" role="status"
            >${draftStatus === 'saved' ? 'Draft saved in this browser until you submit or clear it.' : draftStatus === 'unavailable' ? 'Draft could not be saved. Keep this page open or copy your answers.' : 'Saving draft…'}</span
          ><button type="button" className="tlink" onClick=${clearDraft}>Clear draft</button>
        </div>
      </form>`
    }
    ${
      step === 4 &&
      html`<div>
        ${[
          [
            'Persona',
            [
              ['Public name', d.name, 1],
              ['Main channel', d.handle, 1],
              ['Based on a real person', yes, 1],
              ['Languages', d.langs || 'Not given', 1],
            ],
          ],
          [
            'Rights holder',
            [
              [
                'Rights holder',
                (d.holderType === 'company' ? 'Company: ' : 'Person: ') + d.holder,
                2,
              ],
              ['Email', d.email, 2],
            ],
          ],
          [
            'Evidence',
            [
              [
                'Available materials',
                d.evidence.map((k) => EVIDENCE.find((e) => e[0] === k)[1]).join('; '),
                3,
              ],
            ],
          ],
        ].map(
          ([group, rows]) =>
            html`<section className="apply-review-group" key=${group}>
              <h2>${group}</h2>
              <dl className="review">
                ${rows.map(
                  ([label, value, section]) =>
                    html`<div key=${label}>
                      <dt>${label}</dt>
                      <dd className="rv">${value}</dd>
                      <dd className="ra">
                        <button type="button" className="tlink" onClick=${() => edit(section)}>
                          Change<span className="sr"> ${label.toLowerCase()}</span>
                        </button>
                      </dd>
                    </div>`,
                )}
              </dl>
            </section>`,
        )}
        <div className="apply-declaration">
          <h2 className="h2" style=${{ fontSize: '24px' }}>Declaration</h2>
          <p style=${{ marginTop: '10px', maxWidth: '60ch' }}>
            By submitting, you confirm you hold the rights to this persona and that the information
            is correct to the best of your knowledge.
          </p>
          ${serverError && html`<p role="alert" className="risk">${serverError}</p>`}
          <div className="rowbtns" style=${{ marginTop: '24px' }}>
            <button type="button" className="btn" onClick=${submit} disabled=${pending}>
              ${pending ? 'Saving' : 'Accept and submit'}</button
            ><button type="button" className="tlink" onClick=${clearDraft}>Clear draft</button>
          </div>
        </div>
      </div>`
    }
  </div>`;
}

export { Apply };
