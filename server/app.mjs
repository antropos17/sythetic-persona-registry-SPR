import { createServer } from 'node:http';
import { readFileSync, createReadStream, statSync } from 'node:fs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './db.mjs';
import { validateApplication, validateReport, normalizeApplication, normalizeReport } from './validation.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const assetRoot = resolve(projectRoot, 'assets');
const siteFile = join(projectRoot, 'site/index.html');
const distRoot = resolve(projectRoot, 'site/dist');
const registry = JSON.parse(readFileSync(join(projectRoot, 'data/personas.json'), 'utf8'));
const byId = new Map(registry.personas.map(person => [person.id, person]));
const mediaManifest = JSON.parse(readFileSync(join(projectRoot, 'data/media-provenance.json'), 'utf8'));
const runtimeManifest = JSON.parse(readFileSync(join(projectRoot, 'data/runtime-assets.json'), 'utf8'));
const mediaById = new Map(registry.personas.map(person => [person.id, mediaManifest.assets.filter(asset => asset.personaId === person.id)]));
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2' };
const caseIdPattern = '(?:SPR|RPT)-\\d{4}-[A-F0-9]{12}';
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const evidenceKinds = new Set(['images', 'models', 'licences', 'channels', 'consent', 'other']);
const evidenceTypes = new Map([['image/jpeg', '.jpg'], ['image/png', '.png'], ['application/pdf', '.pdf']]);
const maxEvidenceBytes = 5 * 1024 * 1024;
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

function json(res, status, value, extra = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body), ...extra });
  res.end(body);
}

function staticFile(req, res, file, cache = 'no-cache') {
  let stat;
  try { stat = statSync(file); } catch { return json(res, 404, { error: 'Not found' }); }
  if (!stat.isFile()) return json(res, 404, { error: 'Not found' });
  const extension = file.slice(file.lastIndexOf('.'));
  const type = extension === '.html' ? 'text/html; charset=utf-8' : mime[extension];
  if (!type) return json(res, 404, { error: 'Not found' });
  const etag = `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
  const headers = { ...securityHeaders, 'Content-Type': type, 'Cache-Control': cache, ETag: etag };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

function encodingPreferences(header) {
  const qualities = new Map();
  for (const item of (header || '').split(',')) {
    const [name, ...params] = item.trim().toLowerCase().split(';');
    if (!name) continue;
    const quality =
      params.length === 0
        ? 1
        : params.length === 1 && /^\s*q=(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)\s*$/.test(params[0])
          ? Number(params[0].trim().slice(2))
          : 0;
    qualities.set(name, quality);
  }
  return qualities;
}

function distFile(req, res, file) {
  let original;
  try {
    original = statSync(file);
  } catch {
    return json(res, 404, { error: 'Not found' });
  }
  if (!original.isFile()) return json(res, 404, { error: 'Not found' });
  const preferences = encodingPreferences(req.headers['accept-encoding']);
  const quality = (name) =>
    preferences.has(name) ? preferences.get(name) : (preferences.get('*') ?? 0);
  const variants = [
    ['br', '.br'],
    ['gzip', '.gz'],
  ]
    .map(([encoding, suffix]) => ({ encoding, suffix, q: quality(encoding) }))
    .filter((v) => v.q > 0)
    .sort((a, b) => b.q - a.q);
  const identityQuality = preferences.get('identity') ?? (preferences.get('*') === 0 ? 0 : 1);
  let selected = { file, stat: original, encoding: null };
  for (const variant of variants) {
    if (variant.q < identityQuality) break;
    try {
      const stat = statSync(file + variant.suffix);
      if (stat.isFile()) {
        selected = { file: file + variant.suffix, stat, encoding: variant.encoding };
        break;
      }
    } catch {
      /* Fall back to another available representation. */
    }
  }
  if (!selected.encoding && identityQuality === 0)
    return json(res, 406, { error: 'No acceptable representation' }, { Vary: 'Accept-Encoding' });
  const type = mime[file.slice(file.lastIndexOf('.'))];
  const etag = `W/"${selected.stat.size.toString(16)}-${Math.trunc(selected.stat.mtimeMs).toString(16)}-${selected.encoding || 'identity'}"`;
  const headers = {
    ...securityHeaders,
    'Content-Type': type,
    'Cache-Control': 'no-cache',
    Vary: 'Accept-Encoding',
    ETag: etag,
    ...(selected.encoding ? { 'Content-Encoding': selected.encoding } : {}),
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  res.writeHead(200, { ...headers, 'Content-Length': selected.stat.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(selected.file).pipe(res);
}

function sitePage(req, res) {
  // Apply SRI to HTTP responses. Plain local file previews keep ordinary script
  // tags because file origins cannot complete anonymous CORS/SRI requests.
  const source = readFileSync(siteFile, 'utf8');
  const body = Buffer.from(source.replace(/<script src="\.\.\/(assets\/vendor\/[^"/]+\.js)"><\/script>/g, (tag,path) => {
    const asset=runtimeManifest.assets.find(item => item.path===path);
    if(!asset?.sha384) throw new Error('Missing runtime script integrity');
    return `<script src="../${path}" integrity="sha384-${asset.sha384}" crossorigin="anonymous"></script>`;
  }));
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join('; ');
  const etag = `"${createHash('sha256').update(body).digest('base64url')}"`;
  const headers = { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Security-Policy': policy, ETag: etag };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  res.writeHead(200, { ...headers, 'Content-Length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}

async function readBody(req, limit) {
  if (Number(req.headers['content-length']) > limit) throw { status: 413, error: 'Request body is too large' };
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw { status: 413, error: 'Request body is too large' };
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw { status: 415, error: 'Content-Type must be application/json' };
  const body = await readBody(req, 16_384);
  try { return JSON.parse(body.toString('utf8')); }
  catch { throw { status: 400, error: 'Invalid JSON' }; }
}

function bearer(req) {
  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization || '');
  return match?.[1] || '';
}

function reviewerAuthorized(req, token) {
  const supplied = bearer(req);
  if (!token || !supplied) return false;
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(token).digest();
  return timingSafeEqual(a, b);
}

async function readEvidence(req) {
  const kind = req.headers['x-evidence-kind'];
  const contentType = req.headers['content-type'];
  const extension = evidenceTypes.get(contentType);
  if (!evidenceKinds.has(kind) || !extension) throw { status: 422, error: 'Choose an evidence kind and a JPEG, PNG, or PDF file' };
  let fileName;
  try { fileName = decodeURIComponent(req.headers['x-file-name'] || ''); }
  catch { throw { status: 422, error: 'Invalid file name' }; }
  let sourceStatement;
  try { sourceStatement = decodeURIComponent(req.headers['x-evidence-source'] || '').trim(); }
  catch { throw { status: 422, error: 'Invalid source statement' }; }
  if (sourceStatement.length < 10 || sourceStatement.length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(sourceStatement)) throw { status: 422, error: 'Describe the file source in 10 to 500 characters' };
  const validExtension = contentType === 'image/jpeg' ? /\.(jpg|jpeg)$/i.test(fileName) : fileName.toLowerCase().endsWith(extension);
  if (!fileName || fileName.length > 120 || fileName.includes('/') || fileName.includes('\\') || fileName.includes(':') || /[\x00-\x1f]/.test(fileName) || !validExtension) {
    throw { status: 422, error: 'Invalid file name or extension' };
  }
  const content = await readBody(req, maxEvidenceBytes);
  const valid = contentType === 'image/jpeg' ? content.length >= 4 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff
    : contentType === 'image/png' ? content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : content.subarray(0, 5).toString('ascii') === '%PDF-';
  if (!valid) throw { status: 422, error: 'File signature does not match its type' };
  return { kind, fileName, sourceStatement, mime: contentType, content };
}

function sameOrigin(req, publicOrigin) {
  if (!req.headers.origin) return true;
  try {
    const origin = new URL(req.headers.origin);
    if (publicOrigin) return origin.origin === publicOrigin;
    return origin.host === req.headers.host && ['http:', 'https:'].includes(origin.protocol);
  } catch { return false; }
}

function sameOriginPublication(req, publicOrigin) {
  return req.headers['sec-fetch-site'] !== 'cross-site' && sameOrigin(req, publicOrigin);
}

function trustedHost(req, publicHost) {
  const raw = req.headers.host;
  if (typeof raw !== 'string') return false;
  try {
    const parsed = new URL(`http://${raw}`);
    if (parsed.host !== raw.toLowerCase() || parsed.pathname !== '/' || parsed.username || parsed.password) return false;
    const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
    return hostname === 'localhost' || isIP(hostname) !== 0 || parsed.host === publicHost;
  } catch { return false; }
}

function accountScope(req, allowedOrigin, write = false) {
  let host;
  try { host = new URL(`http://${req.headers.host}`).hostname.replace(/^\[|\]$/g, ''); } catch { return false; }
  const loopbackHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const peer = req.socket.remoteAddress || '';
  const loopbackPeer = peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
  const loopback = !allowedOrigin && loopbackHost && loopbackPeer;
  const configured = allowedOrigin && new URL(allowedOrigin);
  const publicRequest = configured && configured.protocol === 'https:' && req.headers.host === configured.host;
  if (!publicRequest && !loopback) return false;
  const expected = publicRequest ? configured.origin : `http://${req.headers.host}`;
  if (req.headers.origin && req.headers.origin !== expected) return false;
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return false;
  if (write && req.headers['x-spr-owner'] !== '1') return false;
  return true;
}
function accountCookie(req, allowedOrigin) {
  const secure = !!allowedOrigin && new URL(allowedOrigin).protocol === 'https:' && req.headers.host === new URL(allowedOrigin).host;
  const name = secure ? '__Host-spr_owner' : 'spr_owner';
  const cookies = (req.headers.cookie || '').split(';').map(part => part.trim().split('='));
  const found = cookies.filter(part => part[0] === name);
  return { token: found.length === 1 ? found[0][1] : '', name, secure };
}
function setOwnerCookie(cookie, token) {
  return `${cookie.name}=${token || ''}; Path=/; HttpOnly; SameSite=Strict; ${cookie.secure ? 'Secure; ' : ''}${token ? 'Max-Age=604800' : 'Max-Age=0'}`;
}

export function createApp({ dbPath = process.env.SPR_DB_PATH || './var/spr.sqlite', publicOrigin = process.env.PUBLIC_ORIGIN || '', reviewerToken = process.env.SPR_REVIEWER_TOKEN || '' } = {}) {
  if (reviewerToken && (reviewerToken.length < 32 || !/^[A-Za-z0-9_-]+$/.test(reviewerToken))) throw new Error('SPR_REVIEWER_TOKEN must contain at least 32 URL-safe characters (letters, digits, _ or -)');
  const allowedOrigin = publicOrigin ? new URL(publicOrigin).origin : '';
  const publicHost = allowedOrigin ? new URL(allowedOrigin).host : '';
  const db = openDatabase(dbPath);
  const hits = new Map();
  const server = createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (!trustedHost(req, publicHost)) return json(res, 421, { error: 'Host is not allowed' });
      if (req.method === 'GET' && path === '/api/v1/health') return json(res, 200, { status: 'ok' });
      if (req.method === 'GET' && path === '/api/v1/personas') return json(res, 200, { ...registry, personas: [...registry.personas, ...db.publication.listPublic()] });
      const passport = /^\/api\/v1\/passports\/(PP-SPR-[A-F0-9]{12})$/.exec(path);
      if (req.method === 'GET' && passport) {
        const result = db.publication.getPublic(passport[1]);
        return result ? json(res, 200, result) : json(res, 404, { error: 'Record not found' });
      }
      const record = /^\/api\/v1\/personas\/(PP-(?:[A-Z]{2}-\d{4}|SPR-[A-F0-9]{12}))$/.exec(path);
      if (req.method === 'GET' && record) {
        const person = byId.get(record[1]) || db.publication.getPublic(record[1]);
        return person && person.status !== 'revoked' ? json(res, 200, person) : json(res, 404, { error: 'Record not found' });
      }
      const check = /^\/api\/v1\/passports\/(PP-(?:[A-Z]{2}-\d{4}|SPR-[A-F0-9]{12}))\/check$/.exec(path);
      if (req.method === 'GET' && check) {
        const person = byId.get(check[1]) || db.publication.getPublic(check[1]);
        if (!person) return json(res, 404, { error: 'Record not found' });
        return json(res, 200, {
          passportId: person.id, registryRecordFound: true, notice: person.status,
          ...(person.recordType === 'published' ? {} : { evidenceLevel: person.level, openRiskCount: person.risks.length }),
          registryMode: 'demonstration', cryptographicSignatureVerified: false,
          faceComparisonPerformed: false, checkedAt: new Date().toISOString()
        });
      }
      const provenance = /^\/api\/v1\/personas\/(PP-[A-Z]{2}-\d{4})\/provenance$/.exec(path);
      if (req.method === 'GET' && provenance) {
        const assets = mediaById.get(provenance[1]);
        if (!assets) return json(res, 404, { error: 'Record not found' });
        const checkedAt = new Date().toISOString();
        return json(res, 200, {
          personaId: provenance[1], originClaim: mediaManifest.originClaim, originBasis: mediaManifest.originBasis,
          originIndependentlyVerified: false, c2paManifestVerified: false, identityVerified: false,
          assets: assets.map(asset => {
            let actualSha256 = null;
            try { actualSha256 = createHash('sha256').update(readFileSync(join(projectRoot, asset.path))).digest('hex'); } catch { /* A missing asset is reported below. */ }
            return { role: asset.role, path: '/' + asset.path, sha256: asset.sha256,
              integrity: actualSha256 === null ? 'missing' : actualSha256 === asset.sha256 ? 'matches_manifest' : 'mismatch', checkedAt };
          })
        });
      }
      const cookie = accountCookie(req, allowedOrigin);
      const isAccount = path === '/api/v1/account' || path.startsWith('/api/v1/account/');
      if (isAccount) {
        if (!accountScope(req, allowedOrigin, req.method !== 'GET')) return json(res, 403, { error: 'Origin is not allowed' });
        const ip = req.socket.remoteAddress || 'unknown';
        const accounts = db.accounts;
        if (req.method === 'GET' && path === '/api/v1/account') return json(res, 200, { account: accounts.account(cookie.token) });
        if (req.method === 'GET' && path === '/api/v1/account/sessions') return json(res, 200, { sessions: accounts.sessions(cookie.token) });
        if (req.method === 'GET' && path === '/api/v1/account/cases') {
          const offset = Number(url.searchParams.get('offset') || '0');
          if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return json(res, 400, { error: 'Invalid offset' });
          return json(res, 200, accounts.cases(cookie.token, offset));
        }
        if (req.method === 'POST' && path === '/api/v1/account/logout') { accounts.logout(cookie.token); return json(res, 200, {}, { 'Set-Cookie': setOwnerCookie(cookie, '') }); }
        if (req.method === 'POST') {
          const body = await readJson(req);
          let result;
          if (path === '/api/v1/account/register') result = await accounts.register(body, ip);
          else if (path === '/api/v1/account/login') result = await accounts.login(body, ip);
          else if (path === '/api/v1/account/recover') result = await accounts.recover(body, ip);
          else if (path === '/api/v1/account/password') result = await accounts.changePassword(cookie.token, body, ip);
          else if (path === '/api/v1/account/sessions/revoke') result = await accounts.revoke(cookie.token, body, ip, false);
          else if (path === '/api/v1/account/sessions/revoke-others') result = await accounts.revoke(cookie.token, body, ip, true);
          else if (path === '/api/v1/account/cases') result = accounts.claim(cookie.token, body?.id, body?.accessToken);
          else return json(res, 404, { error: 'Not found' });
          const token = result.token; delete result.token;
          return json(res, path.endsWith('/register') ? 201 : 200, result, token ? { 'Set-Cookie': setOwnerCookie(cookie, token) } : {});
        }
        return json(res, 404, { error: 'Not found' });
      }
      const ownerCredential = () => {
        const token = bearer(req);
        if (tokenPattern.test(token)) return token;
        if (!cookie.token) return '';
        if (!accountScope(req, allowedOrigin, req.method !== 'GET')) throw { status: 403, error: 'Origin is not allowed' };
        return { session: cookie.token };
      };
      const ownerPublication = new RegExp(`^/api/v1/cases/(${caseIdPattern})/publication(?:/(updates|publish|revoke))?$`).exec(path);
      if (ownerPublication && (req.method === 'GET' || req.method === 'POST')) {
        const token = ownerCredential();
        if (!token || !db.getCase(ownerPublication[1], token)) return json(res, 404, { error: 'Case not found' });
        if (req.method === 'GET' && !ownerPublication[2]) return json(res, 200, db.publication.getOwner(ownerPublication[1], token));
        if (req.method === 'POST' && ownerPublication[2]) {
          if (!sameOriginPublication(req, allowedOrigin)) return json(res, 403, { error: 'Origin is not allowed' });
          const body = await readJson(req);
          if (ownerPublication[2] === 'updates') return json(res, 201, db.publication.createOwner(ownerPublication[1], token, body));
          if (ownerPublication[2] === 'publish') return json(res, 200, db.publication.publish(ownerPublication[1], token, body));
          return json(res, 200, db.publication.revoke(ownerPublication[1], token, body));
        }
      }
      const caseMatch = new RegExp(`^/api/v1/cases/(${caseIdPattern})$`).exec(path);
      if (req.method === 'GET' && caseMatch) {
        const token = ownerCredential();
        const result = token ? db.getCase(caseMatch[1], token) : null;
        return result ? json(res, 200, result) : json(res, 404, { error: 'Case not found' });
      }
      const caseEvidence = new RegExp(`^/api/v1/cases/(${caseIdPattern})/evidence$`).exec(path);
      if (req.method === 'POST' && caseEvidence) {
        if (!sameOrigin(req, allowedOrigin)) return json(res, 403, { error: 'Origin is not allowed' });
        const token = ownerCredential();
        if (!token || !db.getCase(caseEvidence[1], token)) return json(res, 404, { error: 'Case not found' });
        const file = await readEvidence(req);
        return json(res, 201, db.addEvidence(caseEvidence[1], token, file));
      }
      if (path.startsWith('/api/v1/review/')) {
        if (!reviewerToken) return json(res, 503, { error: 'Review console is not configured' });
        if (!reviewerAuthorized(req, reviewerToken)) return json(res, 401, { error: 'Reviewer access denied' });
        if (req.method !== 'GET' && !sameOrigin(req, allowedOrigin)) return json(res, 403, { error: 'Origin is not allowed' });
        if (req.method === 'GET' && path === '/api/v1/review/cases') {
          const offset = Number(url.searchParams.get('offset') || '0');
          if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) return json(res, 400, { error: 'Invalid offset' });
          return json(res, 200, { cases: db.listReview(offset), offset });
        }
        const reviewPublication = new RegExp(`^/api/v1/review/cases/(${caseIdPattern})/publication(?:/(drafts|review))?$`).exec(path);
        if (reviewPublication) {
          if (req.method === 'GET' && !reviewPublication[2]) return json(res, 200, db.publication.getReviewer(reviewPublication[1]));
          if (req.method === 'POST' && reviewPublication[2]) {
            if (!sameOriginPublication(req, allowedOrigin)) return json(res, 403, { error: 'Origin is not allowed' });
            const body = await readJson(req);
            return reviewPublication[2] === 'drafts' ? json(res, 201, db.publication.createReviewer(reviewPublication[1], body)) : json(res, 200, db.publication.review(reviewPublication[1], body));
          }
        }
        const reviewCase = new RegExp(`^/api/v1/review/cases/(${caseIdPattern})$`).exec(path);
        if (req.method === 'GET' && reviewCase) {
          const result = db.getReview(reviewCase[1]);
          return result ? json(res, 200, result) : json(res, 404, { error: 'Case not found' });
        }
        const reviewStatus = new RegExp(`^/api/v1/review/cases/(${caseIdPattern})/status$`).exec(path);
        if (req.method === 'POST' && reviewStatus) {
          const body = await readJson(req);
          const status = body && typeof body.status === 'string' ? body.status : '';
          const note = body && typeof body.note === 'string' ? body.note.trim() : '';
          if (!/^(reviewing|needs_evidence|approved|rejected|resolved|dismissed)$/.test(status) || note.length > 1000) return json(res, 422, { error: 'Invalid status or message' });
          return json(res, 200, db.updateStatus(reviewStatus[1], status, note));
        }
        const reviewEvidence = /^\/api\/v1\/review\/evidence\/(EV-[A-F0-9]{24})\/decision$/.exec(path);
        if (req.method === 'POST' && reviewEvidence) {
          const body = await readJson(req);
          const decision = body && typeof body.decision === 'string' ? body.decision : '';
          const note = body && typeof body.note === 'string' ? body.note.trim() : '';
          if (!['accepted', 'rejected'].includes(decision) || !note || note.length > 1000) return json(res, 422, { error: 'A valid evidence decision and reason are required' });
          return json(res, 200, db.reviewEvidence(reviewEvidence[1], decision, note));
        }
        const reviewFile = /^\/api\/v1\/review\/evidence\/(EV-[A-F0-9]{24})\/file$/.exec(path);
        if (req.method === 'GET' && reviewFile) {
          const item = db.getEvidence(reviewFile[1]);
          if (!item) return json(res, 404, { error: 'Evidence not found' });
          const content = Buffer.from(item.content);
          if (createHash('sha256').update(content).digest('hex') !== item.sha256) return json(res, 409, { error: 'Stored evidence failed its integrity check' });
          const extension = evidenceTypes.get(item.mime) || '.bin';
          res.writeHead(200, { ...securityHeaders, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${item.id}${extension}"`, 'Cache-Control': 'no-store', 'Content-Length': content.length, 'X-Content-SHA256': item.sha256 });
          return res.end(content);
        }
        return json(res, 404, { error: 'Not found' });
      }
      if (req.method === 'POST' && (path === '/api/v1/applications' || path === '/api/v1/reports')) {
        if (!sameOrigin(req, allowedOrigin)) return json(res, 403, { error: 'Origin is not allowed' });
        const key = req.socket.remoteAddress || 'unknown';
        const now = Date.now();
        for (const [ip, value] of hits) if (now - value.start >= 3_600_000) hits.delete(ip);
        let entry = hits.get(key);
        if (!entry) { entry = { start: now, count: 0, pending: 0 }; hits.set(key, entry); }
        if (entry.count + entry.pending >= 10) return json(res, 429, { error: 'Too many submissions; try again later' }, { 'Retry-After': String(entry.count >= 10 ? Math.ceil((3_600_000 - (now - entry.start)) / 1000) : 1) });
        entry.pending += 1;
        try {
          const body = await readJson(req);
          const application = path.endsWith('/applications');
          const errors = application ? validateApplication(body) : validateReport(body);
          if (Object.keys(errors).length) return json(res, 422, { error: 'Validation failed', fields: errors });
          const data = application ? normalizeApplication(body) : normalizeReport(body);
          let sessionToken = null;
          if (cookie.token && db.accounts.session(cookie.token)) {
            if (!accountScope(req, allowedOrigin, true)) return json(res, 403, { error: 'Origin is not allowed' });
            sessionToken = cookie.token;
          }
          const result = db.create(application ? 'application' : 'report', data, sessionToken);
          entry.count += 1;
          return json(res, 201, { ...result, message: 'Stored for review. Keep the private case link; this service does not send email.' });
        } finally { entry.pending -= 1; }
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (path === '/' || path === '/index.html') return sitePage(req, res);
        if (path === '/dist/app.js' || path === '/dist/app.css') return distFile(req, res, join(distRoot, path.slice('/dist/'.length)));
        if (path === '/favicon.ico') return staticFile(req, res, join(assetRoot, 'emblem.png'), 'public, no-cache');
        if (path.startsWith('/assets/')) {
          let decoded;
          try { decoded = decodeURIComponent(path.slice('/assets/'.length)); } catch { return json(res, 400, { error: 'Invalid path' }); }
          if (decoded.includes('\\') || decoded.split('/').includes('..')) return json(res, 404, { error: 'Not found' });
          const file = resolve(assetRoot, decoded);
          if (!file.startsWith(assetRoot + sep)) return json(res, 404, { error: 'Not found' });
          return staticFile(req, res, file, 'public, no-cache');
        }
      }
      return json(res, 404, { error: 'Not found' });
    } catch (error) {
      if (error?.status) return json(res, error.status, { error: error.error });
      console.error('Request failed:', error);
      return json(res, 500, { error: 'Internal server error' });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return { server, db, close: () => new Promise((resolveClose, reject) => server.close(error => { db.close(); error ? reject(error) : resolveClose(); })) };
}
