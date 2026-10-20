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
const registry = JSON.parse(readFileSync(join(projectRoot, 'data/personas.json'), 'utf8'));
const byId = new Map(registry.personas.map(person => [person.id, person]));
const mediaManifest = JSON.parse(readFileSync(join(projectRoot, 'data/media-provenance.json'), 'utf8'));
const mediaById = new Map(registry.personas.map(person => [person.id, mediaManifest.assets.filter(asset => asset.personaId === person.id)]));
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
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

function sitePage(req, res) {
  const body = readFileSync(siteFile);
  const inline = /<script>([\s\S]*?)<\/script>/.exec(body.toString('utf8'));
  const inlineHash = inline ? ` 'sha256-${createHash('sha256').update(inline[1]).digest('base64')}'` : '';
  const policy = [
    "default-src 'self'",
    `script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net${inlineHash}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
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
  if (sourceStatement.length < 10 || sourceStatement.length > 500 || /[\x00-\x1f]/.test(sourceStatement)) throw { status: 422, error: 'Describe the file source in 10 to 500 characters' };
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

export function createApp({ dbPath = process.env.SPR_DB_PATH || './var/spr.sqlite', publicOrigin = process.env.PUBLIC_ORIGIN || '', reviewerToken = process.env.SPR_REVIEWER_TOKEN || '' } = {}) {
  if (reviewerToken && reviewerToken.length < 32) throw new Error('SPR_REVIEWER_TOKEN must have at least 32 characters');
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
      if (req.method === 'GET' && path === '/api/v1/personas') return json(res, 200, registry, { 'Cache-Control': 'public, max-age=60' });
      const record = /^\/api\/v1\/personas\/(PP-[A-Z]{2}-\d{4})$/.exec(path);
      if (req.method === 'GET' && record) {
        const person = byId.get(record[1]);
        return person ? json(res, 200, person, { 'Cache-Control': 'public, max-age=60' }) : json(res, 404, { error: 'Record not found' });
      }
      const check = /^\/api\/v1\/passports\/(PP-[A-Z]{2}-\d{4})\/check$/.exec(path);
      if (req.method === 'GET' && check) {
        const person = byId.get(check[1]);
        if (!person) return json(res, 404, { error: 'Record not found' });
        return json(res, 200, {
          passportId: person.id, registryRecordFound: true, notice: person.status,
          evidenceLevel: person.level, openRiskCount: person.risks.length,
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
      const caseMatch = new RegExp(`^/api/v1/cases/(${caseIdPattern})$`).exec(path);
      if (req.method === 'GET' && caseMatch) {
        const token = bearer(req);
        const result = tokenPattern.test(token) ? db.getCase(caseMatch[1], token) : null;
        return result ? json(res, 200, result) : json(res, 404, { error: 'Case not found' });
      }
      const caseEvidence = new RegExp(`^/api/v1/cases/(${caseIdPattern})/evidence$`).exec(path);
      if (req.method === 'POST' && caseEvidence) {
        if (!sameOrigin(req, allowedOrigin)) return json(res, 403, { error: 'Origin is not allowed' });
        const token = bearer(req);
        if (!tokenPattern.test(token) || !db.getCase(caseEvidence[1], token)) return json(res, 404, { error: 'Case not found' });
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
        const entry = hits.get(key) || { start: now, count: 0 };
        if (entry.count >= 10) return json(res, 429, { error: 'Too many submissions; try again later' }, { 'Retry-After': String(Math.ceil((3_600_000 - (now - entry.start)) / 1000)) });
        const body = await readJson(req);
        const application = path.endsWith('/applications');
        const errors = application ? validateApplication(body) : validateReport(body);
        if (Object.keys(errors).length) return json(res, 422, { error: 'Validation failed', fields: errors });
        const data = application ? normalizeApplication(body) : normalizeReport(body);
        const result = db.create(application ? 'application' : 'report', data);
        entry.count += 1;
        hits.set(key, entry);
        return json(res, 201, { ...result, message: 'Stored for review. Keep the private case link; this service does not send email.' });
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (path === '/' || path === '/index.html') return sitePage(req, res);
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
