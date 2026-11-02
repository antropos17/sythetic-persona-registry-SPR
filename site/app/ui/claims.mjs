import { html } from '../runtime.mjs';
import { CLAIM_DATE, CLAIM_STATES } from '../domain/claims.mjs';

function ClaimBasis({ person }) {
  return html`<section className="record-section" aria-labelledby="claim-basis-h">
    <h2 className="h2" id="claim-basis-h" tabindex="-1">Basis of the record</h2>
    <p className="sub">Recorded demo statements; supporting files are not publicly supplied.</p>
    <div className="claim-list">
      ${(person.claims || []).map(
        (claim) =>
          html`<article className="claim-item" key=${person.id + claim.title}>
            <div className="claim-summary">
              <b>${claim.title}</b
              ><span className="claim-state" data-state=${claim.state}
                ><span className="sr">${CLAIM_STATES[claim.state]}: </span>${claim.statement}</span
              >
            </div>
            <div className="claim-body">
              <p>${claim.basis}</p>
              ${claim.recordedAt && html`<p className="claim-date">Related event: <time datetime=${claim.recordedAt}>${CLAIM_DATE.format(new Date(claim.recordedAt + 'T00:00:00Z'))}</time></p>`}
              ${claim.issue && html`<p className="claim-issue"><b>Unresolved issue:</b> ${claim.issue}</p>`}
            </div>
          </article>`,
      )}
    </div>
  </section>`;
}

export { ClaimBasis };
