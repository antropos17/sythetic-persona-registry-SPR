import { ORDER } from './notices.mjs';
import { PEOPLE } from './registry.mjs';

function readCatalogQuery(query = '') {
  const params = new URLSearchParams(query);
  const known = (key, values, fallback = '') =>
    values.includes(params.get(key)) ? params.get(key) : fallback;
  return {
    q: (params.get('q') || '').slice(0, 200),
    notice: known('notice', ORDER, 'All'),
    sort: known('sort', ['recent', 'name', 'notice'], 'recent'),
    language: known(
      'language',
      PEOPLE.map((p) => p.lang),
    ),
    occupation: known(
      'occupation',
      PEOPLE.map((p) => p.role),
    ),
    proof: known(
      'proof',
      PEOPLE.map((p) => p.level),
    ),
    savedOnly: params.get('saved') === '1',
  };
}

function catalogRoute(catalog) {
  const params = new URLSearchParams();
  if (catalog.q) params.set('q', catalog.q);
  if (catalog.notice !== 'All') params.set('notice', catalog.notice);
  if (catalog.sort !== 'recent') params.set('sort', catalog.sort);
  for (const key of ['language', 'occupation', 'proof'])
    if (catalog[key]) params.set(key, catalog[key]);
  if (catalog.savedOnly) params.set('saved', '1');
  return 'notices' + (params.size ? '?' + params : '');
}

function withoutCatalogFilters(catalog) {
  return { ...catalog, notice: 'All', savedOnly: false, language: '', occupation: '', proof: '' };
}

function writeCatalogHistory(catalog, { replace = false } = {}) {
  const hash = '#' + catalogRoute(catalog);
  if (location.hash === hash) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', hash);
}

export { readCatalogQuery, catalogRoute, withoutCatalogFilters, writeCatalogHistory };
