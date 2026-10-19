const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const handle = /^@?[\p{L}\p{N}_.]{2,80}$/u;
const evidenceTypes = new Set(['images', 'models', 'licences', 'channels', 'consent']);
const reportTypes = new Set(['copy', 'ads', 'undisclosed', 'other']);

function string(value, max = 200) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

export function validateApplication(data) {
  const errors = {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { body: 'Expected an object' };
  if (!string(data.name, 120)) errors.name = 'Enter a public name (up to 120 characters)';
  if (typeof data.handle !== 'string' || !handle.test(data.handle.trim())) errors.handle = 'Enter a valid channel handle';
  if (!['synthetic', 'likeness'].includes(data.nature)) errors.nature = 'Choose the persona type';
  if (!['person', 'company'].includes(data.holderType)) errors.holderType = 'Choose the rights holder type';
  if (!string(data.holder, 160)) errors.holder = 'Enter the rights holder';
  if (typeof data.email !== 'string' || data.email.length > 254 || !email.test(data.email.trim())) errors.email = 'Enter a valid email';
  if (data.langs != null && (typeof data.langs !== 'string' || data.langs.length > 160)) errors.langs = 'Languages must be text up to 160 characters';
  if (!Array.isArray(data.evidence) || !data.evidence.length || data.evidence.length > evidenceTypes.size || data.evidence.some(x => !evidenceTypes.has(x))) errors.evidence = 'Select valid evidence';
  if (data.nature === 'likeness' && !(Array.isArray(data.evidence) && data.evidence.includes('consent'))) errors.evidence = 'Signed consent is required for a licensed likeness';
  return errors;
}

export function validateReport(data) {
  const errors = {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { body: 'Expected an object' };
  if (!string(data.who, 160)) errors.who = 'Enter the persona name or handle';
  if (!reportTypes.has(data.what)) errors.what = 'Choose a report type';
  if (!string(data.details, 4000) || data.details.trim().length < 20) errors.details = 'Describe the issue in 20 to 4000 characters';
  if (data.email != null && (typeof data.email !== 'string' || (data.email.trim() && (data.email.length > 254 || !email.test(data.email.trim()))))) errors.email = 'Enter a valid email or leave it empty';
  return errors;
}

export function normalizeApplication(data) {
  return {
    name: data.name.trim(), handle: data.handle.trim(), nature: data.nature,
    langs: (data.langs || '').trim(), holderType: data.holderType,
    holder: data.holder.trim(), email: data.email.trim().toLowerCase(),
    evidence: [...new Set(data.evidence)]
  };
}

export function normalizeReport(data) {
  return {
    who: data.who.trim(), what: data.what, details: data.details.trim(),
    email: (data.email || '').trim().toLowerCase()
  };
}
