const CLAIM_STATES = {
  declared: 'Declared',
  recorded: 'Recorded evidence',
  pending: 'Review pending',
  risk: 'Open risk',
  adverse: 'Adverse finding',
};

const CLAIM_DATE = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export { CLAIM_STATES, CLAIM_DATE };
