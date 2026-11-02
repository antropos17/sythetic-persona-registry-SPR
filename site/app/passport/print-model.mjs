const displayName = (p) =>
  p.given ? p.surname + ' / ' + p.given.charAt(0) + p.given.slice(1).toLowerCase() : p.name;

const mrz = (p) => {
  const pad = (s, n) => (s + '<'.repeat(n)).slice(0, n);
  const nm = p.given ? p.surname + '<<' + p.given : p.surname;
  return [
    pad('P<' + p.code + nm, 44),
    pad(p.id.replace(/-/g, '') + '7' + p.code + p.created + '4<' + p.exp + '2SYN', 42) + '06',
  ];
};

function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

export { displayName, mrz, hashStr, rng };
