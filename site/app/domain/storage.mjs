import { PEOPLE } from './registry.mjs';

const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch (e) {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) {
      return false;
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  },
};

const SAVED_KEY = 'spr-saved-records';

function restoreSaved(value) {
  if (!Array.isArray(value)) return [];
  const known = new Set(PEOPLE.map((person) => person.id));
  return [...new Set(value.filter((id) => typeof id === 'string' && known.has(id)))];
}

export { store, SAVED_KEY, restoreSaved };
