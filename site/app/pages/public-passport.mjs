import { html, useEffect, useRef, useState } from '../runtime.mjs';
import { ContentPreview } from './publication.mjs';
import { CASE_DATE_TIME } from '../domain/cases.mjs';

function PublicPassport({ id }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const request = useRef(null);
  const load = async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setData(null);
    setError('');
    try {
      const response = await fetch('/api/v1/passports/' + encodeURIComponent(id), {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok)
        throw new Error(
          response.status === 404
            ? 'This passport is unavailable or has not been published.'
            : 'Could not load this passport.',
        );
      const result = await response.json();
      if (!controller.signal.aborted) setData(result);
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };
  useEffect(() => {
    load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      request.current?.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id]);
  return html`<div className="wrap formwrap public-passport">
    <ol className="crumbs" aria-label="Breadcrumb">
      <li><a href="#notices">Registry</a></li>
      <li aria-current="page">Public passport</li>
    </ol>
    <h1 id="h1" tabindex="-1">
      ${data?.status === 'published' ? data.name : data?.status === 'revoked' ? 'Passport revoked' : 'Public passport'}
    </h1>
    <p className="mono">${id}</p>
    <button
      className="tlink public-passport-refresh"
      type="button"
      disabled=${loading}
      onClick=${load}
    >
      Refresh passport</button
    >${error && html`<p role="alert">${error} Try refreshing the passport.</p>`}${loading && html`<p role="status">Loading passport…</p>`}${
      data?.status === 'revoked' &&
      html`<section className="case-panel" aria-label="Revocation details">
        <p><b>Public reason:</b> ${data.revocationReason}</p>
        <p>
          ${'Revoked: '}
          <time datetime=${data.revokedAt}>${CASE_DATE_TIME.format(new Date(data.revokedAt))}</time>
        </p>
      </section>`
    }${
      data?.status === 'published' &&
      html`<section className="case-panel" aria-label="Published passport">
        <p>
          Published version ${data.version} ·
          <time datetime=${data.publishedAt}
            >${CASE_DATE_TIME.format(new Date(data.publishedAt))}</time
          >
        </p>
        <${ContentPreview} content=${data} includeName=${false} />
      </section>`
    }
    <p className="public-passport-limits">
      Operator-reviewed service preview. Identity, ownership and legal rights are not independently
      verified.
    </p>
  </div>`;
}
export { PublicPassport };
