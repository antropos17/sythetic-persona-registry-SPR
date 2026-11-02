import { html } from '../runtime.mjs';
import { CLAIM_DATE, CLAIM_STATES } from '../domain/claims.mjs';

function ClaimBasis({ person }) {
  return html`<section className="record-section" aria-labelledby="claim-basis-h">
    <h2 className="h2" id="claim-basis-h" tabindex="-1">Basis of the record</h2>
    <p className="sub">
      These statements belong to a fictional demo record. Expand an item to see its basis, related
      date and unresolved issue. Supporting evidence files are not publicly supplied.
    </p>
    <div className="claim-list">
      ${(person.claims || []).map(
        (claim, index) =>
          html`<details className="claim-item" key=${person.id + claim.title} open=${index === 0}>
            <summary>
              <span className="claim-summary"
                ><b>${claim.title}</b
                ><span className="claim-state" data-state=${claim.state}
                  >${CLAIM_STATES[claim.state]}</span
                ></span
              >
            </summary>
            <div className="claim-body">
              <p>${claim.basis}</p>
              <dl>
                <div>
                  <dt>Statement in the demo</dt>
                  <dd>${claim.statement}</dd>
                </div>
                <div>
                  <dt>Related demo event</dt>
                  <dd>
                    ${claim.recordedAt ? html`<time datetime=${claim.recordedAt}>${CLAIM_DATE.format(new Date(claim.recordedAt + 'T00:00:00Z'))}</time>` : 'Date not supplied'}
                  </dd>
                </div>
              </dl>
              ${claim.issue && html`<p className="claim-issue"><b>Unresolved issue:</b> ${claim.issue}</p>`}
            </div>
          </details>`,
      )}
    </div>
    <details className="printed-endorsements">
      <summary>Printed endorsements</summary>
      <p className="sub">
        Labels reproduced on the demo passport. They do not represent a new evidence check.
      </p>
      <dl className="hist">
        ${person.stamps.map(
          (stamp, index) =>
            html`<div key=${index}>
              <dt style=${{ fontFamily: 'var(--sans)', fontSize: '15px' }}>${stamp.t}</dt>
              <dd>
                <b>${stamp.v.charAt(0) + stamp.v.slice(1).toLowerCase()}</b
                >${stamp.sub ? ', ' + stamp.sub : ''}
              </dd>
            </div>`,
        )}
      </dl>
    </details>
  </section>`;
}

export { ClaimBasis };
