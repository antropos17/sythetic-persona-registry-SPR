import { createServer } from 'node:http';
import { readFileSync, createReadStream, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
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

async function readJson(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw { status: 415, error: 'Content-Type must be application/json' };
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_384) throw { status: 413, error: 'Request body is too large' };
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw { status: 400, error: 'Invalid JSON' }; }
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

export function createApp({ dbPath = process.env.SPR_DB_PATH || './var/spr.sqlite', publicOrigin = process.env.PUBLIC_ORIGIN || '' } = {}) {
  const allowedOrigin = publicOrigin ? new URL(publicOrigin).origin : '';
  const publicHost = allowedOrigin ? new URL(allowedOrigin).host : '';
  const db = openDatabase(dbPath);
  const hits = new Map();
  const server = createServer({ maxHeaderSize: 8192 }, async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
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
        return json(res, 201, { ...result, message: 'Stored for review. This demo does not send email or assign an examiner.' });
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
