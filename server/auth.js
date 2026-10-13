import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const tokenHash = (token) => createHash('sha256').update(String(token)).digest('hex');
export function publicUser(user, now = Date.now()) {
  const phone = user.phone?.replace(/^\+86/, '');
  return { id: user.id, nickname: user.nickname, phone: phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : null,
    role: user.memberUntil > now ? 'member' : 'registered', memberUntil: user.memberUntil || 0 };
}

export function createAuth({ store, providers, now = Date.now, config = {} }) {
  const secret = config.authSecret || randomBytes(32).toString('hex');
  const db = store.db;
  const phonePattern = /^1[3-9]\d{9}$/;
  const fingerprint = (req) => tokenHash(`${clientIp(req, config)}|${String(req.headers['user-agent'] || '').slice(0, 300)}`);
  const digestOtp = (phone, code) => createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
  function requireUser(req) {
    const bearer = String(req.headers.authorization || '');
    if (!/^Bearer [A-Za-z0-9_-]{40,100}$/.test(bearer)) throw new ApiError(401, 'AUTH_REQUIRED', '请先登录，再保存到云端口袋。');
    const hash = tokenHash(bearer.slice(7));
    const row = db.prepare('SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?').get(hash, now());
    if (!row) throw new ApiError(401, 'SESSION_EXPIRED', '登录已过期，请重新登录。');
    const user = store.getUser(row.user_id);
    if (!user) throw new ApiError(401, 'SESSION_EXPIRED', '登录已过期，请重新登录。');
    return user;
  }
  function newSession(userId) {
    const token = randomBytes(32).toString('base64url');
    store.transact(() => {
      db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now());
      db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(tokenHash(token), userId, now() + 30 * 86400000);
    });
    return token;
  }
  function logout(req) {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(token));
  }
  async function requestPhone(req, body) {
    const phone = validatePhone(body.phone);
    if (!providers.capabilities?.phoneLogin || typeof providers.sendSms !== 'function') throw new ApiError(503, 'SMS_UNAVAILABLE', '短信登录尚未配置，请先使用游客模式。');
    const code = String(randomInt(100000, 1000000));
    const timestamp = now();
    const ipHash = tokenHash(clientIp(req, config));
    store.transact(() => {
      const previous = db.prepare('SELECT requested_at FROM otps WHERE phone=?').get(phone);
      if (previous && timestamp - previous.requested_at < 60000) throw new ApiError(429, 'OTP_RATE_LIMIT', '请等待一分钟后再获取验证码。');
      db.prepare('DELETE FROM otp_requests WHERE created_at<?').run(timestamp - 3600000);
      const requests = db.prepare('SELECT COUNT(*) AS count FROM otp_requests WHERE ip_hash=? AND created_at>?').get(ipHash, timestamp - 3600000).count;
      if (requests >= 10) throw new ApiError(429, 'OTP_IP_LIMIT', '请求有点频繁，请稍后再试。');
      db.prepare('INSERT INTO otp_requests(ip_hash,created_at) VALUES(?,?)').run(ipHash, timestamp);
      db.prepare('INSERT INTO otps(phone,code_hash,expires_at,attempts,requested_at) VALUES(?,?,?,0,?) ON CONFLICT(phone) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,requested_at=excluded.requested_at')
        .run(phone, digestOtp(phone, code), timestamp + 300000, timestamp);
    });
    try { await providers.sendSms(phone, code); }
    catch {
      // A failed delivery must not leave a usable challenge behind.
      db.prepare('DELETE FROM otps WHERE phone=? AND code_hash=?').run(phone, digestOtp(phone, code));
      throw new ApiError(503, 'SMS_DELIVERY_FAILED', '验证码暂时未能送达，请稍后再试。');
    }
    return { sent: true, retryAfter: 60, expiresIn: 300 };
  }
  function verifyPhone(body) {
    const phone = validatePhone(body.phone);
    if (!providers.capabilities?.phoneLogin) throw new ApiError(503, 'SMS_UNAVAILABLE', '短信登录尚未配置，请先使用游客模式。');
    const code = String(body.code || '');
    if (!/^\d{6}$/.test(code)) throw new ApiError(400, 'INVALID_CODE', '请输入六位验证码。');
    let failure = null;
    const user = store.transact(() => {
      const challenge = db.prepare('SELECT * FROM otps WHERE phone=?').get(phone);
      if (!challenge || challenge.expires_at <= now()) { failure = new ApiError(400, 'OTP_EXPIRED', '验证码已过期，请重新获取。'); return null; }
      if (challenge.attempts >= 5) { failure = new ApiError(429, 'OTP_ATTEMPTS', '验证码尝试次数已用完，请重新获取。'); return null; }
      const expected = Buffer.from(challenge.code_hash, 'hex');
      const actual = Buffer.from(digestOtp(phone, code), 'hex');
      if (!timingSafeEqual(expected, actual)) {
        db.prepare('UPDATE otps SET attempts=attempts+1 WHERE phone=?').run(phone);
        failure = new ApiError(400, 'INVALID_CODE', '验证码不正确，请检查后再试。');
        return null;
      }
      db.prepare('DELETE FROM otps WHERE phone=?').run(phone);
      return store.findUser('phone', phone) || store.createUser({ phone, now: now() });
    });
    if (failure) throw failure;
    return { user, token: newSession(user.id) };
  }
  function validatePhone(phone) {
    if (typeof phone !== 'string') throw new ApiError(400, 'INVALID_PHONE', '请输入有效手机号或国际区号。');
    if (phonePattern.test(phone)) return `+86${phone}`;
    if (/^\+[1-9]\d{7,14}$/.test(phone) && (!phone.startsWith('+86') || phonePattern.test(phone.slice(3)))) return phone;
    throw new ApiError(400, 'INVALID_PHONE', '请输入有效手机号或国际区号。');
  }
  function startWechat(req) {
    if (!providers.capabilities?.wechatLogin || typeof providers.wechatAuthorizationUrl !== 'function') throw new ApiError(503, 'WECHAT_UNAVAILABLE', '微信登录尚未配置，请先使用游客模式。');
    const state = randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM login_codes WHERE expires_at<=?').run(now());
    db.prepare('INSERT INTO login_codes(code_hash,purpose,fingerprint,expires_at) VALUES(?,?,?,?)')
      .run(tokenHash(state), 'wechat-state', fingerprint(req), now() + 300000);
    return { url: providers.wechatAuthorizationUrl(state) };
  }
  async function callbackWechat(req, code, state) {
    if (!providers.capabilities?.wechatLogin) throw new ApiError(503, 'WECHAT_UNAVAILABLE', '微信登录尚未配置。');
    if (typeof code !== 'string' || code.length > 512 || !/^[A-Za-z0-9_-]{40,100}$/.test(state || '')) throw new ApiError(400, 'WECHAT_STATE', '登录校验失败，请重新打开登录。');
    const valid = store.transact(() => {
      const row = db.prepare('SELECT * FROM login_codes WHERE code_hash=? AND purpose=? AND expires_at>?').get(tokenHash(state), 'wechat-state', now());
      if (!row || row.fingerprint !== fingerprint(req)) return false;
      db.prepare('DELETE FROM login_codes WHERE code_hash=?').run(tokenHash(state));
      return true;
    });
    if (!valid) throw new ApiError(400, 'WECHAT_STATE', '登录请求已过期或已使用，请重新打开登录。');
    let identity;
    try { identity = await providers.exchangeWechatCode(code); }
    catch { throw new ApiError(503, 'WECHAT_EXCHANGE_FAILED', '微信暂时未能完成登录，请稍后再试。'); }
    if (!identity || typeof identity.openid !== 'string' || !identity.openid || identity.openid.length > 200) throw new ApiError(503, 'WECHAT_EXCHANGE_FAILED', '微信暂时未能完成登录，请稍后再试。');
    const user = store.transact(() => store.findUser('openid', identity.openid) || store.createUser({ openid: identity.openid, nickname: identity.nickname, now: now() }));
    const exchangeCode = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO login_codes(code_hash,purpose,fingerprint,user_id,expires_at) VALUES(?,?,?,?,?)')
      .run(tokenHash(exchangeCode), 'wechat-exchange', fingerprint(req), user.id, now() + 60000);
    return exchangeCode;
  }
  function exchangeWechat(req, body) {
    if (typeof body.code !== 'string' || !/^[A-Za-z0-9_-]{40,100}$/.test(body.code)) throw new ApiError(400, 'WECHAT_CODE', '登录校验失败，请重试。');
    const user = store.transact(() => {
      const row = db.prepare('SELECT * FROM login_codes WHERE code_hash=? AND purpose=? AND expires_at>?').get(tokenHash(body.code), 'wechat-exchange', now());
      if (!row || row.fingerprint !== fingerprint(req)) throw new ApiError(400, 'WECHAT_CODE', '登录已过期，请重新打开登录。');
      db.prepare('DELETE FROM login_codes WHERE code_hash=?').run(tokenHash(body.code));
      return store.getUser(row.user_id);
    });
    return { user, token: newSession(user.id) };
  }
  return { requireUser, newSession, logout, requestPhone, verifyPhone, startWechat, callbackWechat, exchangeWechat };
}

export function clientIp(req, config = {}) {
  const socketIp = req.socket.remoteAddress || 'unknown';
  if (config.trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim().slice(0, 100);
  return socketIp;
}
