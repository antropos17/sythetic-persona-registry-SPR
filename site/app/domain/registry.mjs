import registry from '../../../data/personas.json' with { type: 'json' };
const { personas } = registry;

const LEVELS = ['Declared', 'Evidence-backed', 'Reviewed', 'Controlled creation'];

const PROOF_EXPLANATIONS = {
  Declared: 'The demo records a declaration. Independent supporting evidence is not supplied.',
  'Evidence-backed':
    'The demo records supporting evidence. The underlying files are not publicly supplied.',
  Reviewed:
    'A completed review is recorded in the demo. Review materials are not publicly supplied.',
  'Controlled creation':
    'The demo records a controlled creation process. This page does not independently verify that process.',
};

const PEOPLE = personas.map(({ portrait, ...person }) => person);

const PHOTOS = Object.fromEntries(
  PEOPLE.map((p) => [p.id, '../assets/portraits/' + p.id + '.jpg']),
);

const BODY_PHOTOS = Object.fromEntries(
  PEOPLE.map((p) => [p.id, '../assets/full-body/' + p.id + '.jpg']),
);

PEOPLE.forEach((p) => {
  p.src = PHOTOS[p.id];
  p.bodySrc = BODY_PHOTOS[p.id];
});

const neutralPortrait =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"%3E%3Crect width="240" height="240" fill="%23e5ebed"/%3E%3Ccircle cx="120" cy="120" r="64" fill="none" stroke="%23687f86" stroke-width="4"/%3E%3Ctext x="120" y="132" text-anchor="middle" font-family="sans-serif" font-size="28" fill="%23687f86"%3ESPR%3C/text%3E%3C/svg%3E';
function adaptPublished(p) {
  return {
    ...p,
    status: 'Published',
    role: p.occupation,
    lang: p.languages || 'Not supplied',
    level: 'Not assessed',
    issued: p.publishedAt?.slice(0, 10) || 'Not supplied',
    expires: 'Not supplied',
    sort: Date.parse(p.updatedAt) || 0,
    risks: [],
    history: [],
    claims: [],
    socials: [],
    note: '',
    src: neutralPortrait,
    bodySrc: neutralPortrait,
  };
}

let refreshSequence = 0;
const isCurrentRefresh = (requestId) => requestId === refreshSequence;

async function refreshPeople() {
  const requestId = ++refreshSequence;
  try {
    const response = await fetch('/api/v1/personas', {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error('Registry refresh failed');
    const data = await response.json();
    if (!Array.isArray(data.personas)) throw new Error('Invalid registry response');
    if (!isCurrentRefresh(requestId)) return { requestId, superseded: true };
    PEOPLE.splice(
      0,
      PEOPLE.length,
      ...data.personas.map((p) =>
        p.recordType === 'published'
          ? adaptPublished(p)
          : { ...p, src: PHOTOS[p.id], bodySrc: BODY_PHOTOS[p.id] },
      ),
    );
    return { requestId, superseded: false };
  } catch (cause) {
    if (!isCurrentRefresh(requestId)) return { requestId, superseded: true };
    const error = new Error('Registry refresh failed', { cause });
    error.requestId = requestId;
    throw error;
  }
}

const byId = (id) => PEOPLE.find((p) => p.id === id);

export {
  LEVELS,
  PROOF_EXPLANATIONS,
  PEOPLE,
  PHOTOS,
  BODY_PHOTOS,
  byId,
  adaptPublished,
  refreshPeople,
  isCurrentRefresh,
};
