const NOTICE = {
  Published: {
    name: 'Service preview',
    key: 'published',
    nc: 'var(--muted)',
    nt: 'var(--g-tint)',
    ni: 'var(--g-ink)',
    meaning: 'Operator reviewed',
    advice: 'Review does not verify identity or rights.',
  },
  Valid: {
    name: 'Green notice',
    key: 'green',
    nc: 'var(--g)',
    nt: 'var(--g-tint)',
    ni: 'var(--g-ink)',
    meaning: 'Valid passport',
    advice: 'Review the record’s risks and evidence before collaborating.',
  },
  'Under review': {
    name: 'Yellow notice',
    key: 'yellow',
    nc: 'var(--y)',
    nt: 'var(--y-tint)',
    ni: 'var(--y-ink)',
    meaning: 'Under review',
    advice: 'Wait until the review is finished.',
  },
  Suspended: {
    name: 'Orange notice',
    key: 'orange',
    nc: 'var(--o)',
    nt: 'var(--o-tint)',
    ni: 'var(--o-ink)',
    meaning: 'Suspended',
    advice: 'Do not run campaigns until it is lifted.',
  },
  Revoked: {
    name: 'Red notice',
    key: 'red',
    nc: 'var(--r)',
    nt: 'var(--r-tint)',
    ni: 'var(--r-ink)',
    meaning: 'Revoked',
    advice: 'Do not use. Report any copies you find.',
  },
};

const ORDER = ['Valid', 'Under review', 'Suspended', 'Revoked'];

const nvars = (s) => ({ '--nc': NOTICE[s].nc, '--nt': NOTICE[s].nt, '--ni': NOTICE[s].ni });

function recordAdvice(person) {
  if (person.recordType === 'published')
    return 'Operator review does not verify identity or rights.';
  const count = person.risks.length;
  const risks = count
    ? count + ' open risk' + (count === 1 ? '' : 's')
    : 'No open risks listed in this demo record. This does not guarantee that every risk is resolved.';
  if (person.status === 'Valid') return count ? risks + ' — review before collaborating.' : risks;
  return NOTICE[person.status].advice + ' ' + risks + (count ? ' listed.' : '');
}

export { NOTICE, ORDER, nvars, recordAdvice };
