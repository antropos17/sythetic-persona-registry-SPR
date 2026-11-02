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

const byId = (id) => PEOPLE.find((p) => p.id === id);

export { LEVELS, PROOF_EXPLANATIONS, PEOPLE, PHOTOS, BODY_PHOTOS, byId };
