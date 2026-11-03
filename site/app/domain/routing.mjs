import { PEOPLE, byId } from './registry.mjs';

const navigate = (token) => {
  const hash = '#' + token;
  // The router owns scrolling; native hash jumps must not run before it.
  if (hash !== location.hash) history.pushState(null, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
};

function handleRouteLink(event, noticesRoute = 'notices') {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  const link = event.target.closest('a[href^="#"]');
  if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
  const hash = link.getAttribute('href');
  if (
    !/^#(?:home|notices|apply|report|review|case-status|account|case|compare|PP-(?:[A-Z]{2}-\d{4}|SPR-[A-F0-9]{12}))(?:$|[/?])/i.test(
      hash,
    )
  )
    return;
  event.preventDefault();
  navigate(hash === '#notices' ? noticesRoute : hash.slice(1));
}

function parse() {
  const catalog = /^notices(?:\?(.*))?$/.exec((location.hash || '').slice(1));
  if (catalog) return { name: 'notices', ...(catalog[1] ? { catalogQuery: catalog[1] } : {}) };
  let h;
  try {
    h = decodeURIComponent((location.hash || '').slice(1));
  } catch {
    return { name: 'home' };
  }
  const claimRoute = /^account\/claim\/((?:SPR|RPT)-\d{4}-[A-F0-9]{12})\/([A-Za-z0-9_-]{43})$/.exec(
    h,
  );
  if (claimRoute) return { name: 'account', claim: { id: claimRoute[1], token: claimRoute[2] } };
  const ownedCase = /^case\/((?:SPR|RPT)-\d{4}-[A-F0-9]{12})$/.exec(h);
  if (ownedCase) return { name: 'case', id: ownedCase[1] };
  const caseRoute = /^case\/((?:SPR|RPT)-\d{4}-[A-F0-9]{12})\/([A-Za-z0-9_-]{43})$/.exec(h);
  if (caseRoute) return { name: 'case', id: caseRoute[1], accessToken: caseRoute[2] };
  const reportRoute = /^report\/([^/]+)$/.exec(h);
  if (reportRoute && byId(reportRoute[1].toUpperCase()))
    return { name: 'report', id: reportRoute[1].toUpperCase() };
  if (h === 'compare' || h === 'compare?differences=1')
    return {
      name: 'compare',
      ids: PEOPLE.slice(0, 2).map((p) => p.id),
      ...(h.endsWith('?differences=1') ? { differences: true } : {}),
    };
  const comparison = /^compare\/([^/?]+)\/([^/?]+)(\?differences=1)?$/.exec(h);
  if (comparison && byId(comparison[1]) && byId(comparison[2]) && comparison[1] !== comparison[2])
    return {
      name: 'compare',
      ids: comparison.slice(1, 3),
      ...(comparison[3] ? { differences: true } : {}),
    };
  const publicSection =
    /^(PP-SPR-[A-F0-9]{12})\/(overview|check|risks|basis|examples|images|history)$/i.exec(h);
  if (publicSection) return { name: 'passport', id: publicSection[1].toUpperCase() };
  const recordSection = /^([^/]+)\/(overview|check|risks|basis|examples|images|history)$/.exec(h);
  if (recordSection && byId(recordSection[1].toUpperCase())) {
    const id = recordSection[1].toUpperCase();
    return recordSection[2] === 'examples'
      ? { name: 'record', id }
      : { name: 'record', id, section: recordSection[2] };
  }
  const id = h.toUpperCase();
  if (/^PP-SPR-[A-F0-9]{12}$/.test(id)) return { name: 'passport', id };
  if (byId(id)) return { name: 'record', id };
  if (
    h === 'apply' ||
    h === 'report' ||
    h === 'notices' ||
    h === 'case-status' ||
    h === 'account' ||
    h === 'review'
  )
    return { name: h };
  return { name: 'home' };
}

export { navigate, handleRouteLink, parse };
