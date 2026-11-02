import { store } from './storage.mjs';

const APPLY0 = {
  name: '',
  handle: '',
  nature: '',
  langs: '',
  holderType: '',
  holder: '',
  email: '',
  evidence: [],
};

const EVIDENCE = [
  ['images', 'Reference images of the persona'],
  ['models', 'Model names, versions and file hashes'],
  ['licences', 'Licences or terms for every tool and model'],
  ['channels', 'Proof of control of the main channel (without sharing credentials)'],
  ['consent', 'Signed consent from a real person, if the persona is based on one'],
];

const EVIDENCE_KEYS = new Set(EVIDENCE.map(([key]) => key));

const HANDLE_FORMAT = /^@?[\p{L}\p{N}_.]{2,80}$/u;

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validEmail = (value) => value.length <= 254 && EMAIL_FORMAT.test(value.trim());

function validateReport(data) {
  const errors = {};
  if (!data.who.trim() || data.who.trim().length > 160)
    errors.who = 'Enter the persona’s name, handle or passport number (up to 160 characters)';
  if (!data.what) errors.what = 'Select what the problem is';
  if (data.details.trim().length < 20 || data.details.trim().length > 4000)
    errors.details = 'Describe what you saw in 20 to 4000 characters';
  if (data.email.trim() && !validEmail(data.email))
    errors.email = 'Enter an email address in the correct format, or leave it empty';
  return errors;
}

function validateApplication(data, step) {
  const errors = {};
  if (step === 1) {
    if (!data.name.trim() || data.name.trim().length > 120)
      errors.name = 'Enter the persona’s public name (up to 120 characters)';
    if (!HANDLE_FORMAT.test(data.handle.trim()))
      errors.handle = 'Enter a channel handle with 2 to 80 letters, numbers, dots or underscores';
    if (!data.nature) errors.nature = 'Select whether the persona is based on a real person';
    if (data.langs.length > 160) errors.langs = 'Enter up to 160 characters for languages';
  }
  if (step === 2) {
    if (!data.holderType)
      errors.holderType = 'Select whether a person or a company holds the rights';
    if (!data.holder.trim() || data.holder.trim().length > 160)
      errors.holder = 'Enter the rights holder name (up to 160 characters)';
    if (!validEmail(data.email))
      errors.email = 'Enter an email address in the correct format, like name@example.com';
  }
  if (step === 3) {
    if (!data.evidence.length)
      errors.evidence = 'Select at least one piece of evidence you can send';
    if (data.nature === 'likeness' && !data.evidence.includes('consent'))
      errors.evidence = 'A persona based on a real person needs that person’s signed consent';
  }
  return errors;
}

function restoreApplication(raw) {
  const draft = { ...APPLY0, evidence: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return draft;
  for (const key of ['name', 'handle', 'nature', 'langs', 'holderType', 'holder', 'email'])
    if (typeof raw[key] === 'string') draft[key] = raw[key];
  if (Array.isArray(raw.evidence))
    draft.evidence = [...new Set(raw.evidence.filter((key) => EVIDENCE_KEYS.has(key)))];
  return draft;
}

function persistApplicationDraft(draft, step, reviewDraft) {
  const saved = store.set('spr-apply', draft),
    stepSaved = store.set('spr-apply-step', step),
    reviewSaved = reviewDraft
      ? store.set('spr-apply-review', reviewDraft)
      : store.del('spr-apply-review');
  return saved && stepSaved && reviewSaved;
}

function finishApplicationDraft(result) {
  if (result.demo) return;
  store.del('spr-apply');
  store.del('spr-apply-step');
  store.del('spr-apply-review');
}

const REPORT_DRAFT_TTL = 24 * 60 * 60 * 1000;

const reportDraftKey = (personaId) => 'spr-report-draft:' + (personaId || 'general');

const emptyReport = (person) => ({
  who: person ? person.name + ' (' + person.id + ')' : '',
  what: '',
  details: '',
  email: '',
});

function restoreReportDraft(value, now = Date.now()) {
  if (
    !value ||
    value.version !== 1 ||
    !Number.isFinite(value.savedAt) ||
    value.savedAt > now + 60000 ||
    now - value.savedAt >= REPORT_DRAFT_TTL
  )
    return null;
  const data = value.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  for (const [key, max] of [
    ['who', 160],
    ['details', 4000],
    ['email', 254],
  ])
    if (typeof data[key] !== 'string' || data[key].length > max) return null;
  if (!['', 'copy', 'ads', 'undisclosed', 'other'].includes(data.what)) return null;
  return {
    savedAt: value.savedAt,
    data: { who: data.who, what: data.what, details: data.details, email: data.email },
  };
}

function readReportDraft(storage, key, now = Date.now()) {
  const raw = storage.getItem(key);
  if (!raw) return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    storage.removeItem(key);
    return null;
  }
  const draft = restoreReportDraft(value, now);
  if (!draft) storage.removeItem(key);
  return draft;
}

function saveReportDraft(storage, key, data, now = Date.now()) {
  const draft = restoreReportDraft({ version: 1, savedAt: now, data }, now);
  if (!draft) throw new Error('Invalid report draft');
  storage.setItem(key, JSON.stringify({ version: 1, ...draft }));
}

export {
  APPLY0,
  EVIDENCE,
  EVIDENCE_KEYS,
  HANDLE_FORMAT,
  EMAIL_FORMAT,
  validEmail,
  validateReport,
  validateApplication,
  restoreApplication,
  persistApplicationDraft,
  finishApplicationDraft,
  REPORT_DRAFT_TTL,
  reportDraftKey,
  emptyReport,
  restoreReportDraft,
  readReportDraft,
  saveReportDraft,
};
