import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const hash = (s) => createHash('sha256').update(s).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const fail = (status, error) => {
  throw { status, error };
};
let active = 0;
async function passwordHash(password, salt) {
  if (active >= 2) fail(503, 'Authentication is busy; try again later');
  active++;
  try {
    return (
      await derive(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 })
    ).toString('hex');
  } finally {
    active--;
  }
}
function username(value) {
  if (typeof value !== 'string' || !/^[a-z0-9._-]{3,40}$/i.test(value))
    fail(422, 'Invalid username');
  return value.toLowerCase();
}
function password(value) {
  if (typeof value !== 'string' || [...value].length < 15 || [...value].length > 128)
    fail(422, 'Password must contain 15 to 128 characters');
  return value;
}
const safeEqual = (a, b) => {
  const x = Buffer.from(a, 'hex'),
    y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
};
export function accountStore(db, transaction) {
  db.exec(`CREATE TABLE IF NOT EXISTS owner_accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS owner_sessions (id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES owner_accounts(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS owner_sessions_account ON owner_sessions(account_id);
    CREATE TABLE IF NOT EXISTS owner_rate_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);`);
  const byName = db.prepare('SELECT * FROM owner_accounts WHERE username=?');
  const byId = db.prepare('SELECT * FROM owner_accounts WHERE id=?');
  const display = (a) => ({ id: a.id, username: a.username, createdAt: a.created_at });
  function rate(kind, ip, name = '') {
    const now = Date.now(),
      start = now - 3600000;
    transaction(() => {
      db.prepare('DELETE FROM owner_rate_limits WHERE window_start < ?').run(start);
      for (const key of [
        `${kind}:ip:${hash(ip)}`,
        ...(name ? [`${kind}:user:${hash(name)}`] : []),
      ]) {
        let row = db.prepare('SELECT * FROM owner_rate_limits WHERE key=?').get(key);
        if (!row && db.prepare('SELECT count(*) AS n FROM owner_rate_limits').get().n >= 10000)
          fail(503, 'Authentication is busy; try again later');
        if (row && row.count >= (kind === 'register' ? 5 : 10))
          fail(429, 'Too many attempts; try again later');
        db.prepare(
          'INSERT INTO owner_rate_limits VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET count=count+1',
        ).run(key, now);
      }
    });
  }
  function getSession(token, touch = false) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) return null;
    const now = Date.now();
    const row = db
      .prepare(
        'SELECT s.*, a.username, a.created_at AS account_created_at FROM owner_sessions s JOIN owner_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND s.last_seen_at>?',
      )
      .get(hash(token), now, now - 86400000);
    if (row && touch)
      db.prepare('UPDATE owner_sessions SET last_seen_at=? WHERE id=?').run(now, row.id);
    return row || null;
  }
  function requireSession(token) {
    const s = getSession(token, true);
    if (!s) fail(401, 'Sign in required');
    return s;
  }
  function newSession(accountId) {
    const now = Date.now(),
      token = secret(),
      id = secret();
    db.prepare('DELETE FROM owner_sessions WHERE expires_at<=? OR last_seen_at<=?').run(
      now,
      now - 86400000,
    );
    db.prepare(
      'DELETE FROM owner_sessions WHERE account_id=? AND id IN (SELECT id FROM owner_sessions WHERE account_id=? ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET 4)',
    ).run(accountId, accountId);
    db.prepare('INSERT INTO owner_sessions VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      accountId,
      hash(token),
      now,
      now,
      now + 604800000,
    );
    return token;
  }
  function list(token) {
    const s = requireSession(token),
      now = Date.now();
    return db
      .prepare(
        'SELECT id, created_at, last_seen_at, expires_at FROM owner_sessions WHERE account_id=? AND expires_at>? AND last_seen_at>? ORDER BY created_at DESC',
      )
      .all(s.account_id, now, now - 86400000)
      .map((x) => ({
        id: x.id,
        createdAt: new Date(x.created_at).toISOString(),
        lastSeenAt: new Date(x.last_seen_at).toISOString(),
        expiresAt: new Date(x.expires_at).toISOString(),
        current: x.id === s.id,
      }));
  }
  async function reauth(token, pass, ip) {
    const s = requireSession(token),
      a = byId.get(s.account_id);
    rate('reauth', ip, a.username);
    password(pass);
    const derived = await passwordHash(pass, a.password_salt);
    if (!safeEqual(derived, a.password_hash)) fail(401, 'Invalid credentials');
    return { s, a };
  }
  function assertCurrent(token, a) {
    const s = requireSession(token),
      fresh = byId.get(a.id);
    if (s.account_id !== a.id || !fresh || fresh.generation !== a.generation)
      fail(401, 'Sign in required');
    return s;
  }
  return {
    session(token) {
      return getSession(token, true);
    },
    account(token) {
      const s = getSession(token, true);
      return s ? display(byId.get(s.account_id)) : null;
    },
    async register(body, ip) {
      const name = username(body?.username),
        pass = password(body?.password);
      rate('register', ip, name);
      const salt = secret(),
        passHash = await passwordHash(pass, salt),
        code = secret(),
        id = secret(),
        at = new Date().toISOString();
      return transaction(() => {
        if (byName.get(name)) fail(409, 'Username is unavailable');
        db.prepare('INSERT INTO owner_accounts VALUES (?, ?, ?, ?, ?, 0, ?)').run(
          id,
          name,
          salt,
          passHash,
          hash(code),
          at,
        );
        const token = newSession(id);
        return { account: display(byId.get(id)), recoveryCode: code, token };
      });
    },
    async login(body, ip) {
      const name = username(body?.username);
      if (typeof body?.password !== 'string' || [...body.password].length > 128)
        fail(401, 'Invalid credentials');
      rate('login', ip, name);
      const a = byName.get(name),
        actual = await passwordHash(
          body.password,
          a?.password_salt || 'SPR-dummy-salt-for-unknown-user',
        );
      if (!a || !safeEqual(actual, a.password_hash)) fail(401, 'Invalid credentials');
      return transaction(() => {
        const fresh = byId.get(a.id);
        if (!fresh || fresh.generation !== a.generation) fail(401, 'Invalid credentials');
        return { account: display(fresh), token: newSession(a.id) };
      });
    },
    async recover(body, ip) {
      const name = username(body?.username),
        pass = password(body?.newPassword);
      rate('recover', ip, name);
      const a = byName.get(name),
        code = typeof body?.recoveryCode === 'string' ? body.recoveryCode : '';
      if (!a || !/^[A-Za-z0-9_-]{43}$/.test(code) || !safeEqual(hash(code), a.recovery_hash))
        fail(401, 'Invalid credentials');
      const salt = secret(),
        passHash = await passwordHash(pass, salt),
        next = secret();
      return transaction(() => {
        const fresh = byId.get(a.id);
        if (
          !fresh ||
          fresh.generation !== a.generation ||
          !safeEqual(hash(code), fresh.recovery_hash)
        )
          fail(401, 'Invalid credentials');
        db.prepare(
          'UPDATE owner_accounts SET password_salt=?, password_hash=?, recovery_hash=?, generation=generation+1 WHERE id=?',
        ).run(salt, passHash, hash(next), a.id);
        db.prepare('DELETE FROM owner_sessions WHERE account_id=?').run(a.id);
        return { recoveryCode: next };
      });
    },
    logout(token) {
      if (token) db.prepare('DELETE FROM owner_sessions WHERE token_hash=?').run(hash(token));
    },
    sessions: list,
    async revoke(token, body, ip, others) {
      const { a } = await reauth(token, body?.currentPassword, ip);
      return transaction(() => {
        const s = assertCurrent(token, a);
        if (others)
          db.prepare('DELETE FROM owner_sessions WHERE account_id=? AND id<>?').run(a.id, s.id);
        else {
          if (typeof body?.id !== 'string') fail(422, 'Invalid session');
          db.prepare('DELETE FROM owner_sessions WHERE account_id=? AND id=?').run(a.id, body.id);
        }
        return { sessions: body?.id === s.id && !others ? [] : list(token) };
      });
    },
    async changePassword(token, body, ip) {
      const { a } = await reauth(token, body?.currentPassword, ip);
      const pass = password(body?.newPassword),
        salt = secret(),
        passHash = await passwordHash(pass, salt),
        code = secret();
      return transaction(() => {
        assertCurrent(token, a);
        db.prepare(
          'UPDATE owner_accounts SET password_salt=?,password_hash=?,recovery_hash=?,generation=generation+1 WHERE id=?',
        ).run(salt, passHash, hash(code), a.id);
        db.prepare('DELETE FROM owner_sessions WHERE account_id=?').run(a.id);
        return { account: display(byId.get(a.id)), recoveryCode: code, token: newSession(a.id) };
      });
    },
    cases(token, offset = 0) {
      const s = requireSession(token);
      const rows = db
        .prepare(
          `SELECT s.id,s.kind,s.status,s.created_at AS createdAt,COALESCE(s.updated_at,s.created_at) AS updatedAt,p.id AS passportId,p.latest_version AS version,p.revoked_at, r.status AS publicationStatus FROM submissions s LEFT JOIN publications p ON p.submission_id=s.id LEFT JOIN publication_revisions r ON r.publication_id=p.id AND r.version=p.latest_version WHERE s.owner_account_id=? ORDER BY s.created_at DESC,s.id DESC LIMIT 51 OFFSET ?`,
        )
        .all(s.account_id, offset);
      return {
        cases: rows
          .slice(0, 50)
          .map(({ passportId, version, revoked_at, publicationStatus, ...row }) => ({
            ...row,
            publication: passportId
              ? { passportId, status: revoked_at ? 'revoked' : publicationStatus, version }
              : null,
          })),
        offset,
        hasMore: rows.length > 50,
      };
    },
    claim(token, id, accessToken) {
      return transaction(() => {
        const s = requireSession(token);
        if (
          typeof id !== 'string' ||
          !/^(?:SPR|RPT)-\d{4}-[A-F0-9]{12}$/.test(id) ||
          typeof accessToken !== 'string' ||
          !/^[A-Za-z0-9_-]{43}$/.test(accessToken)
        ) fail(404, 'Case not found');
        const result = db
          .prepare(
            'UPDATE submissions SET owner_account_id=?,access_hash=NULL WHERE id=? AND owner_account_id IS NULL AND access_hash=?',
          )
          .run(s.account_id, id, hash(accessToken));
        if (!result.changes) fail(404, 'Case not found');
        return { caseId: id };
      });
    },
  };
}
