import { EVIDENCE } from './forms.mjs';

const CASE_LABELS = {
  received: 'Received',
  reviewing: 'In review',
  needs_evidence: 'More evidence requested',
  approved: 'Application approved',
  rejected: 'Application rejected',
  resolved: 'Report resolved',
  dismissed: 'Report dismissed',
};

const EVIDENCE_LABELS = {
  images: 'Images',
  models: 'Model record or hash manifest',
  licences: 'Licences',
  channels: 'Channel control proof',
  consent: 'Signed consent',
  other: 'Other',
};

const CLOSED_CASES = new Set(['approved', 'rejected', 'resolved', 'dismissed']);

const CASE_DAY = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });

const CASE_TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const CASE_DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const CASE_STATUS_TEXT = {
  received: 'The case was saved. A reviewer can open it when review is configured.',
  reviewing: 'The case is in review. Any uploaded materials still need a reviewer’s decision.',
  needs_evidence:
    'A reviewer requested more evidence. Add a file below and include where it came from.',
  approved:
    'The application is approved. A reviewer can prepare a public draft; only your explicit consent publishes it.',
  rejected:
    'The application was closed after review. Read the case history for the reviewer’s message.',
  resolved:
    'The report was closed after review. A public demo notice does not change automatically.',
  dismissed:
    'The report was closed after review. Read the case history for the reviewer’s message.',
};

function latestReviewerMessage(events, status) {
  const latest = events
    .filter(
      (item) =>
        item.actor === 'reviewer' && item.action === 'status_changed' && item.status === status,
    )
    .reduce(
      (current, item) =>
        !current || Date.parse(item.at) >= Date.parse(current.at) ? item : current,
      null,
    );
  return latest && typeof latest.note === 'string' && latest.note.trim() ? latest : null;
}

function caseEventTitle(item, kind) {
  if (item.action === 'submitted')
    return kind === 'application' ? 'Application submitted' : 'Report submitted';
  const publicationTitles = {
    publication_revision_created: 'Publication revision prepared',
    publication_approved: 'Publication update approved',
    publication_rejected: 'Publication update rejected',
    publication_consented: 'Publication consent recorded',
    publication_published: 'Passport published',
    publication_revoked: 'Passport revoked',
  };
  if (publicationTitles[item.action]) return publicationTitles[item.action];
  if (item.action === 'evidence_uploaded') return 'Evidence uploaded';
  if (item.action === 'evidence_accepted') return 'Evidence accepted';
  if (item.action === 'evidence_rejected') return 'Evidence rejected';
  return item.action === 'status_changed'
    ? CASE_LABELS[item.status] || 'Status changed'
    : 'Case updated';
}

const CASE_ID_FORMAT = /^(SPR|RPT)-\d{4}-[A-F0-9]{12}$/;

const CASE_TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

function parsePrivateCaseLink(value, currentUrl) {
  const text = value.trim();
  if (!text)
    return {
      error: 'Paste the private link shown after you submitted your application or report.',
    };
  const malformed = {
    error:
      'Paste the complete private link, including the case number and access token after #case/.',
  };
  if (!/^(https?:\/\/|#case\/)/i.test(text) || /\s/.test(text)) return malformed;
  try {
    const base = new URL(currentUrl),
      link = new URL(text, base);
    if (
      link.origin !== base.origin ||
      link.pathname !== base.pathname ||
      link.username ||
      link.password
    )
      return {
        error:
          'Use a private link from this registry. A link from another site or address cannot open here.',
      };
    const parts = decodeURIComponent(link.hash.slice(1)).split('/');
    const id = (parts[1] || '').toUpperCase(),
      token = parts[2] || '';
    if (
      parts.length !== 3 ||
      parts[0] !== 'case' ||
      !CASE_ID_FORMAT.test(id) ||
      !CASE_TOKEN_FORMAT.test(token)
    )
      return malformed;
    return { id, token };
  } catch {
    return malformed;
  }
}

const REVIEW_NEXT = {
  application: {
    received: ['reviewing', 'needs_evidence', 'rejected'],
    reviewing: ['needs_evidence', 'approved', 'rejected'],
    needs_evidence: ['reviewing', 'rejected'],
  },
  report: {
    received: ['reviewing', 'needs_evidence', 'dismissed'],
    reviewing: ['needs_evidence', 'resolved', 'dismissed'],
    needs_evidence: ['reviewing', 'resolved', 'dismissed'],
  },
};

const REVIEW_ANSWER_LABELS = {
  name: 'Persona’s public name',
  handle: 'Main channel handle',
  nature: 'Based on a real person',
  langs: 'Languages',
  holderType: 'Rights holder type',
  holder: 'Rights holder name',
  email: 'Email address',
  evidence: 'Available materials',
  who: 'Persona or account',
  what: 'Concern',
  details: 'Details',
};

const REVIEW_ANSWER_VALUES = {
  nature: { synthetic: 'No, fully synthetic', likeness: 'Yes, with signed consent' },
  holderType: { person: 'A person', company: 'A company' },
  what: {
    copy: 'It copies or looks like a real person',
    ads: 'It posts ads without saying they are ads',
    undisclosed: 'It does not say it is an AI',
    other: 'Something else',
  },
};

function reviewAnswerValue(key, value) {
  if (Array.isArray(value))
    return (
      value
        .map((item) =>
          key === 'evidence' ? EVIDENCE.find(([id]) => id === item)?.[1] || item : item,
        )
        .join('; ') || 'Not given'
    );
  return REVIEW_ANSWER_VALUES[key]?.[value] || value || 'Not given';
}

function reviewAnswerLabel(key) {
  return (
    REVIEW_ANSWER_LABELS[key] ||
    key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/^./, (letter) => letter.toUpperCase())
  );
}

export {
  CASE_LABELS,
  EVIDENCE_LABELS,
  CLOSED_CASES,
  CASE_DAY,
  CASE_TIME,
  CASE_DATE_TIME,
  CASE_STATUS_TEXT,
  latestReviewerMessage,
  caseEventTitle,
  CASE_ID_FORMAT,
  CASE_TOKEN_FORMAT,
  parsePrivateCaseLink,
  REVIEW_NEXT,
  REVIEW_ANSWER_LABELS,
  REVIEW_ANSWER_VALUES,
  reviewAnswerValue,
  reviewAnswerLabel,
};
