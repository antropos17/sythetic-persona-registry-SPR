import { html } from '../runtime.mjs';
import { socialHref } from '../domain/social.mjs';

function SocialIcon({ platform }) {
  if (platform === 'Instagram')
    return html`<svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5"></rect>
      <circle cx="12" cy="12" r="4"></circle>
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"></circle>
    </svg>`;
  if (platform === 'TikTok')
    return html`<svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3v11.5a4.5 4.5 0 1 1-4-4.47"></path>
      <path d="M14 4c1 3 3 4.5 6 4.5"></path>
    </svg>`;
  if (platform === 'YouTube')
    return html`<svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="5" width="20" height="14" rx="4"></rect>
      <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none"></path>
    </svg>`;
  if (platform === 'X')
    return html`<svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 4 20 20M20 4 4 20"></path>
    </svg>`;
  return html`<svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10 6"></path>
    <path d="M14 11a5 5 0 0 0-7.07 0l-2.12 2.12a5 5 0 0 0 7.07 7.07L14 18"></path>
  </svg>`;
}

function CardChannel({ person }) {
  const channel = person.socials?.[0] || {
    platform: 'Declared handle',
    handle: person.handle,
    url: null,
  };
  const href = socialHref(channel);
  const label = channel.platform + ' ' + channel.handle;
  return html`<div className="card-channel">
    <${SocialIcon} platform=${channel.platform} />
    ${href ? html`<a href=${href} target="_blank" rel="noopener noreferrer nofollow" aria-label=${'Open ' + person.name + ' on ' + channel.platform + ' in a new tab'}>${label}</a>` : html`<span>${label}</span>`}
  </div>`;
}

export { SocialIcon, CardChannel };
