import { PEOPLE } from './registry.mjs';

const normalizeSearch = (value) =>
  value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ');

const hay = (p) =>
  normalizeSearch(p.name + ' ' + p.handle + ' ' + p.id + ' ' + p.holder + ' ' + p.lang);

function nameDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
    }
  return matrix[a.length][b.length];
}

function searchPeople(query, pool = PEOPLE) {
  const q = normalizeSearch(query);
  if (!q) return { matches: [], suggestions: [] };
  const exact = pool.filter((p) =>
    [p.id.toLowerCase(), p.handle.toLowerCase(), p.handle.toLowerCase().replace(/^@/, '')].includes(
      q,
    ),
  );
  const matches = exact.length ? exact : pool.filter((p) => hay(p).includes(q));
  if (matches.length || q.length < 4 || q.length > 64 || !/^\p{L}[\p{L} '\-]*$/u.test(q))
    return { matches, suggestions: [] };
  const limit = q.length <= 6 ? 1 : 2;
  const suggestions = pool
    .map((p) => {
      const name = normalizeSearch(p.name);
      const candidates = q.includes(' ') ? [name] : [name, ...name.split(' ')];
      return {
        person: p,
        distance: Math.min(...candidates.map((value) => nameDistance(q, value))),
      };
    })
    .filter((item) => item.distance <= limit)
    .sort((a, b) => a.distance - b.distance || a.person.name.localeCompare(b.person.name))
    .slice(0, 3)
    .map((item) => item.person);
  return { matches, suggestions };
}

export { normalizeSearch, hay, nameDistance, searchPeople };
