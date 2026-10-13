import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/** SQLite is the source of truth for identity, quotas, and commerce. */
export function createStore(dbPath = ':memory:') {
  if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(dbPath);
  if (dbPath !== ':memory:') chmodSync(dbPath, 0o600);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, phone TEXT UNIQUE, openid TEXT UNIQUE,
      nickname TEXT NOT NULL, member_until INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, attributes TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS states (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS otps (
      phone TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0, requested_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS otp_requests (ip_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS otp_request_lookup ON otp_requests(ip_hash, created_at);
    CREATE TABLE IF NOT EXISTS login_codes (
      code_hash TEXT PRIMARY KEY, purpose TEXT NOT NULL, fingerprint TEXT NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS draw_tickets (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      gadget_id TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id, created_at);
    CREATE TABLE IF NOT EXISTS payment_events (payment_event_id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ideas (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL, created_at INTEGER NOT NULL, data TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ideas_status ON ideas(status, created_at);
    CREATE TABLE IF NOT EXISTS telemetry (
      day TEXT NOT NULL, event TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(day, event)
    );
    CREATE TABLE IF NOT EXISTS illustration_cache (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      gadget_id TEXT NOT NULL, url TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, gadget_id)
    );
  `);
  // Additive migration for databases created by the initial backend draft.
  if (!db.prepare('PRAGMA table_info(users)').all().some((column) => column.name === 'attributes')) db.exec("ALTER TABLE users ADD COLUMN attributes TEXT NOT NULL DEFAULT '{}'");
  let depth = 0;
  function transact(fn) {
    const nested = depth > 0;
    if (!nested) db.exec('BEGIN IMMEDIATE');
    depth += 1;
    try {
      const result = fn();
      if (result && typeof result.then === 'function') throw new TypeError('SQLite transactions must be synchronous.');
      if (!nested) db.exec('COMMIT');
      return result;
    } catch (error) {
      if (!nested) db.exec('ROLLBACK');
      throw error;
    } finally { depth -= 1; }
  }
  function getUser(id) { return mapUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)); }
  function findUser(field, value) {
    if (!['phone', 'openid'].includes(field)) throw new TypeError('Invalid identity field');
    return mapUser(db.prepare(`SELECT * FROM users WHERE ${field} = ?`).get(value));
  }
  function createUser({ phone = null, openid = null, nickname = null, now = Date.now() } = {}) {
    const id = randomUUID();
    db.prepare('INSERT INTO users(id,phone,openid,nickname,member_until,created_at) VALUES(?,?,?,?,0,?)')
      .run(id, phone, openid, String(nickname || `口袋旅人 ${id.slice(0, 4)}`).slice(0, 40), now);
    return getUser(id);
  }
  function updateUser(id, patch) {
    const user = getUser(id);
    if (!user) return null;
    const next = { ...user, ...patch };
    // Both spellings are supported for the commerce adapter, while public JSON uses camelCase.
    const memberUntil = patch.membershipUntil ?? patch.member_until ?? next.memberUntil;
    const attributes = { seasonalUnlocks: Array.isArray(next.seasonalUnlocks) ? next.seasonalUnlocks : [] };
    db.prepare('UPDATE users SET nickname=?,member_until=?,attributes=? WHERE id=?').run(String(next.nickname).slice(0, 40), Number(memberUntil) || 0, JSON.stringify(attributes), id);
    return getUser(id);
  }
  function getState(userId) {
    const row = db.prepare('SELECT data FROM states WHERE user_id = ?').get(userId);
    return row ? JSON.parse(row.data) : null;
  }
  function saveState(userId, state) {
    db.prepare('INSERT INTO states(user_id,data) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,version=states.version+1')
      .run(userId, JSON.stringify(state));
    return state;
  }
  function putOrder(order) {
    const userId = order.userId || order.user_id;
    if (!order.id || !userId) throw new TypeError('Orders require id and userId.');
    db.prepare('INSERT INTO orders(id,user_id,status,created_at,data) VALUES(?,?,?,?,?)')
      .run(order.id, userId, order.status || 'pending', order.createdAt || Date.now(), JSON.stringify({ ...order, userId }));
    return order;
  }
  function getOrder(id) { return jsonRow(db.prepare('SELECT data FROM orders WHERE id=?').get(id)); }
  function listOrders(userId, { limit = 100 } = {}) {
    if (limit === null) return db.prepare('SELECT data FROM orders WHERE user_id=? ORDER BY created_at DESC').all(userId).map(jsonRow);
    return db.prepare('SELECT data FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT ?').all(userId, Math.min(100, Math.max(1, Number(limit) || 100))).map(jsonRow);
  }
  function updateOrder(id, patch) {
    const existing = getOrder(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, id: existing.id, userId: existing.userId };
    db.prepare('UPDATE orders SET status=?,data=? WHERE id=?').run(next.status, JSON.stringify(next), id);
    return next;
  }
  function recordWebhook(eventId, payload = {}) {
    const result = db.prepare('INSERT OR IGNORE INTO payment_events(payment_event_id,data) VALUES(?,?)').run(String(eventId), JSON.stringify(payload));
    return result.changes > 0;
  }
  function putIdea(idea) {
    if (!idea.id || !idea.userId) throw new TypeError('Ideas require id and userId.');
    db.prepare('INSERT INTO ideas(id,user_id,status,created_at,data) VALUES(?,?,?,?,?)')
      .run(idea.id, idea.userId, idea.status || 'pending', idea.createdAt || Date.now(), JSON.stringify(idea));
    return idea;
  }
  function getIdea(id) { return jsonRow(db.prepare('SELECT data FROM ideas WHERE id=?').get(id)); }
  function listIdeas({ userId, status, limit = 100 } = {}) {
    const where = [], params = [];
    if (userId) { where.push('user_id=?'); params.push(userId); }
    if (status) { where.push('status=?'); params.push(status); }
    params.push(Math.min(100, Math.max(1, Number(limit) || 100)));
    return db.prepare(`SELECT data FROM ideas${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`).all(...params).map(jsonRow);
  }
  function updateIdea(id, patch) {
    const existing = getIdea(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, id: existing.id, userId: existing.userId };
    db.prepare('UPDATE ideas SET status=?,data=? WHERE id=?').run(next.status, JSON.stringify(next), id);
    return next;
  }
  return {
    db, transact, transaction: transact, getUser, findUser, createUser, updateUser,
    getState, saveState, putOrder, getOrder, listOrders, updateOrder, recordWebhook,
    putIdea, getIdea, listIdeas, updateIdea, close: () => db.close(),
  };
}

function jsonRow(row) { return row ? JSON.parse(row.data) : null; }
function mapUser(row) {
  return row ? { ...JSON.parse(row.attributes || '{}'), id: row.id, phone: row.phone, openid: row.openid, nickname: row.nickname, memberUntil: row.member_until, membershipUntil: row.member_until, createdAt: row.created_at } : null;
}
