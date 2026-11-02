import { socialHref } from './social.mjs';
import { byId } from './registry.mjs';

function comparisonValue(person, key) {
  const values = {
    overview: person.description,
    notice: [person.status, person.note, person.risks.length],
    nature: person.nature,
    occupation: [person.role, person.lang],
    holder: person.holder,
    level: person.level,
    dates: [person.issued, person.expires],
    channels: (person.socials?.length
      ? person.socials
      : [{ platform: 'Declared handle', handle: person.handle, url: null }]
    )
      .map((channel) => [channel.platform, channel.handle, socialHref(channel)])
      .sort(),
    risks: [...person.risks].sort(),
    claims: (person.claims || []).map((claim) => [claim.title, claim.state]).sort(),
    latest: person.history[0] ? [person.history[0].e, person.history[0].d] : null,
  };
  return JSON.stringify(values[key]);
}

function toggleComparisonSelection(current, id) {
  if (current.includes(id)) return current.filter((value) => value !== id);
  return current.length < 2 && byId(id) ? [...current, id] : current;
}

const comparisonRoute = (ids, onlyDifferences = false) =>
  'compare/' + ids.join('/') + (onlyDifferences ? '?differences=1' : '');

export { comparisonValue, toggleComparisonSelection, comparisonRoute };
