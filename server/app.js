import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createStore } from './store.js';
import { createAuth, ApiError, publicUser, tokenHash } from './auth.js';
import { createTelemetry } from './telemetry.js';
import * as game from '../src/lib/game.js';

const BODY_LIMIT = 65536;
const KNOWN = new Map(game.GADGETS.map((gadget) => [gadget.id, gadget]));
const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3001', 'http://127.0.0.1:5173', 'http://127.0.0.1:4173', 'https://xiaoming96.github.io'];
const emptyProviders = { capabilities: { phoneLogin: false, wechatLogin: false, aiText: false, aiImage: false, payments: false, fulfillment: false } };

/** One HTTP application; adapters can be injected without contacting live providers in tests. */
export function createApp({ dbPath = ':memory:', providers = emptyProviders, now = Date.now, rng = Math.random, config = {} } = {}) {
  process.env.TZ = config.timeZone || 'Asia/Shanghai';
  const store = createStore(dbPath);
  const auth = createAuth({ store, providers, now, config });
  const allowedOrigins = new Set(typeof config.appOrigins === 'string' ? config.appOrigins.split(',').map((value) => value.trim()).filter(Boolean) : config.appOrigins || DEFAULT_ORIGINS);
  const admins = new Set(Array.isArray(config.adminUserIds) ? config.adminUserIds : String(config.adminUserIds || '').split(',').map((id) => id.trim()).filter(Boolean));
  const normalizedConfig = { ...config, adminUserIds: [...admins] };
  const telemetry = createTelemetry({ store, now });
  const pendingIllustrations = new Map();
  const imageLimits = { registered: Number(config.imageLimit ?? 5), member: Number(config.memberImageLimit ?? 20) };
  if (Object.values(imageLimits).some((limit) => !Number.isInteger(limit) || limit < 1 || limit > 1000)) throw new TypeError('Image daily limits must be integers between 1 and 1000.');
  // Optional controllers load once, allowing the core to run independently of external services.
  let commerce, community;
  const controllersReady = Promise.all([
    import('./commerce.js').then(({ createCommerce }) => { commerce = createCommerce({ store, providers, now, config }); }).catch((error) => { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }),
    import('./community.js').then(({ createCommunity }) => { community = createCommunity({ store, now, config: normalizedConfig }); }).catch((error) => { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }),
  ]);
  const role = (user) => user.memberUntil > now() ? 'member' : 'registered';
  function getState(user) {
    const state = store.getState(user.id) || game.createState(now());
    game.ensureDaily(state, now());
    state.entitlements = Array.isArray(user.seasonalUnlocks) ? [...user.seasonalUnlocks] : [];
    return state;
  }
  function limitsFor(user, state) {
    const currentRole = role(user);
    const raw = currentRole === 'member' ? { help: Infinity, blind: Infinity, fusion: Infinity } : { help: 5, blind: 2, fusion: 2 };
    return { role: currentRole, ...Object.fromEntries(Object.entries(raw).map(([kind, limit]) => [kind, {
      limit: Number.isFinite(limit) ? limit : null, used: state.usage[kind] || 0,
      remaining: Number.isFinite(limit) ? Math.max(0, limit - (state.usage[kind] || 0)) : null,
    }])) };
  }
  function stateResponse(user, state = getState(user)) { return { user: { ...publicUser(user, now()), isAdmin: admins.has(user.id), seasonalUnlocks: [...(user.seasonalUnlocks || [])] }, state, limits: limitsFor(user, state) }; }
  function consume(state, type, user) {
    game.ensureDaily(state, now());
    const limit = limitsFor(user, state)[type];
    if (!limit) throw new ApiError(400, 'INVALID_PLAY', '暂时没有这个玩法。');
    if (limit.remaining !== null && limit.remaining <= 0) throw new ApiError(429, 'DAILY_LIMIT', '今天的免费次数已用完，明天再来看看吧。');
    state.usage[type] = (state.usage[type] || 0) + 1;
  }
  function knownGadget(state, id) {
    const seasonal = (game.SEASONAL_GADGETS || []).find((gadget) => gadget.id === id);
    if (seasonal) return (state.entitlements || []).includes(seasonal.eventId) ? seasonal : null;
    return KNOWN.get(id) || (state.customGadgets || []).find((gadget) => gadget.id === id);
  }
  function seasonalGadgets(state) {
    if (typeof game.getSeasonalGadgets === 'function') return (state.entitlements || []).flatMap((id) => game.getSeasonalGadgets(id) || []);
    return [];
  }
  function ownedGadget(state, id) {
    const gadget = knownGadget(state, id);
    if (!gadget || !state.collected.includes(id)) throw new ApiError(404, 'GADGET_NOT_FOUND', '这件道具还没收进口袋。');
    return gadget;
  }
  function mergeGuest(user, candidate) {
    if (!isObject(candidate)) return getState(user);
    return store.transact(() => {
      const state = getState(user);
      // Guest imports can bring memories, never money, membership, quota, or fabricated custom tools.
      for (const id of strings(candidate.collected, 100)) if (KNOWN.has(id)) game.collectGadget(state, KNOWN.get(id));
      const favorites = strings(candidate.favorites, 100).filter((id) => state.collected.includes(id));
      state.favorites = [...new Set([...(state.favorites || []), ...favorites])];
      if (isObject(candidate.settings)) {
        state.settings.sound = candidate.settings.sound === true;
        state.settings.guideSeen = candidate.settings.guideSeen === true;
        state.settings.storageConsent = candidate.settings.storageConsent === true;
        state.settings.analyticsConsent = candidate.settings.analyticsConsent === true;
      }
      const importedHistory = Array.isArray(candidate.history) ? candidate.history.slice(0, 30).flatMap((record) => {
        if (!isObject(record) || !KNOWN.has(record.gadgetId) || typeof record.text !== 'string') return [];
        const importId = `import-${tokenHash(JSON.stringify([record.gadgetId, short(record.title, 100), short(record.text, 1000), Number(record.createdAt) || 0])).slice(0, 32)}`;
        return [{ id: importId, gadgetId: record.gadgetId, gadgetName: KNOWN.get(record.gadgetId).name, kind: game.OUTCOME_KINDS.includes(record.kind) ? record.kind : 'normal', title: short(record.title, 100) || '曾经的小小故事', text: short(record.text, 1000), worry: short(record.worry, 100), strength: strengthValue(record.strength), createdAt: Number.isFinite(record.createdAt) ? Math.min(now(), Math.max(0, record.createdAt)) : now(), imported: true }];
      }) : [];
      state.history = [...new Map([...(state.history || []), ...importedHistory].map(record => [record.id, record])).values()].sort((a, b) => a.createdAt - b.createdAt).slice(-30);
      game.updateAchievements(state);
      store.saveState(user.id, state);
      return state;
    });
  }
  async function draw(user, body) {
    const kind = body.kind;
    if (!['help', 'blind'].includes(kind)) throw new ApiError(400, 'INVALID_PLAY', '请选择烦恼求助或每日盲盒。');
    const worry = validateWorry(body.worry, kind === 'help');
    if (body.eventId !== undefined && (typeof body.eventId !== 'string' || !user.seasonalUnlocks?.includes(body.eventId) || !game.SEASONAL_EVENTS.some((event) => event.id === body.eventId))) throw new ApiError(403, 'SEASON_LOCKED', '这个限定口袋还没有解锁。');
    // Reserving quota before an upstream call prevents concurrent requests from exceeding it.
    let state = store.transact(() => {
      const current = getState(user); consume(current, kind, user); store.saveState(user.id, current); return current;
    });
    const pool = body.eventId ? game.getSeasonalGadgets(body.eventId) : [...game.GADGETS.filter((gadget) => role(user) === 'member' || gadget.rarity !== '传说'), ...seasonalGadgets(state)];
    let gadget = kind === 'help' && !body.eventId ? game.matchGadget(worry, state.collected, rng) : game.drawRandomGadget(rng, pool);
    if (role(user) !== 'member' && gadget.rarity === '传说') gadget = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    let mode = 'local';
    if (kind === 'help' && !body.eventId && state.customGadgets.length < 500 && providers.capabilities?.aiText && typeof providers.generateGadget === 'function') {
      try {
        const generated = await providers.generateGadget(worry);
        if (validGeneratedGadget(generated)) {
          gadget = { ...generated, id: `ai-${randomBytes(12).toString('hex')}`, maxDurability: Math.min(6, Math.max(2, generated.maxDurability)), rarity: generated.rarity === '传说' && role(user) !== 'member' ? '稀有' : generated.rarity };
          mode = 'ai';
        }
      } catch { /* A provider outage keeps the playable, original offline story. */ }
    }
    const ticket = randomBytes(32).toString('base64url');
    state = store.transact(() => {
      const latest = getState(user); game.collectGadget(latest, gadget);
      if (kind === 'blind') {
        latest.lastFortune = { gadgetId: gadget.id, date: game.localDay(now()) }; latest.todayGadgetId = gadget.id;
      }
      store.saveState(user.id, latest);
      if (kind === 'help') store.db.prepare('INSERT INTO draw_tickets(token_hash,user_id,gadget_id,expires_at) VALUES(?,?,?,?)').run(tokenHash(ticket), user.id, gadget.id, now() + 1800000);
      return latest;
    });
    return { gadget, ticket: kind === 'help' ? ticket : null, mode, ...stateResponse(user, state) };
  }
  async function use(user, body) {
    const strength = strengthValue(body.strength, true), worry = validateWorry(body.worry);
    let gadget, historyId;
    let outcome = store.transact(() => {
      const state = getState(user); gadget = ownedGadget(state, body.gadgetId);
      const durability = game.getDurability(state, gadget, now(), role(user));
      if (durability.broken) throw new ApiError(409, 'GADGET_BROKEN', '道具正在口袋里修理，稍后再来看看吧。');
      const ticket = typeof body.ticket === 'string' ? store.db.prepare('SELECT * FROM draw_tickets WHERE token_hash=? AND user_id=? AND gadget_id=? AND expires_at>?').get(tokenHash(body.ticket), user.id, gadget.id, now()) : null;
      if (ticket) store.db.prepare('DELETE FROM draw_tickets WHERE token_hash=?').run(tokenHash(body.ticket));
      else consume(state, 'help', user);
      const useResult = game.useGadget(state, gadget, strength, now(), role(user));
      if (!useResult.ok) throw new ApiError(409, 'GADGET_BROKEN', useResult.reason);
      const result = game.generateOutcome(gadget, worry, strength, rng);
      game.recordOutcome(state, result, now());
      historyId = state.history.at(-1)?.id;
      store.saveState(user.id, state);
      return result;
    });
    let mode = 'local';
    if (providers.capabilities?.aiText && typeof providers.generateOutcome === 'function') {
      try {
        const generated = await providers.generateOutcome(gadget, worry, strength, outcome.kind, outcome.event);
        if (generated?.kind === outcome.kind && typeof generated.text === 'string') {
          outcome = { ...outcome, title: short(generated.title || outcome.title, 120), text: short(generated.text, 3000) };
          mode = 'ai';
        }
      } catch { /* Offline stories remain available when upstream generation fails. */ }
    }
    // Persist the final displayed story without trusting any browser-generated outcome.
    const state = store.transact(() => {
      const latest = getState(user);
      const history = (latest.history || []).find((record) => record.id === historyId);
      if (history) { history.title = outcome.title; history.text = outcome.text; }
      store.saveState(user.id, latest); return latest;
    });
    return { outcome, mode, ...stateResponse(user, state) };
  }
  async function fuse(user, body) {
    if (!Array.isArray(body.ids) || body.ids.length !== 2 || body.ids.some((id) => typeof id !== 'string') || body.ids[0] === body.ids[1]) throw new ApiError(400, 'INVALID_FUSION', '请选择两件不同的道具。');
    let first, second;
    const result = store.transact(() => {
      const state = getState(user); [first, second] = body.ids.map((id) => ownedGadget(state, id));
      consume(state, 'fusion', user);
      const generated = game.fuseGadgets(first, second, rng);
      store.saveState(user.id, state); return generated;
    });
    let mode = 'local';
    if (result.ok && providers.capabilities?.aiText && typeof providers.fuseGadgets === 'function') {
      try {
        const generated = await providers.fuseGadgets(first, second);
        if (validGeneratedGadget(generated)) { result.gadget = { ...generated, id: `fusion-${randomBytes(12).toString('hex')}`, parents: [first.id, second.id], category: result.gadget.category, rarity: result.gadget.rarity, maxDurability: result.gadget.maxDurability }; mode = 'ai'; }
      } catch { /* Preserve the successful offline combination. */ }
    }
    const state = store.transact(() => {
      const latest = getState(user); game.recordFusion(latest, result); store.saveState(user.id, latest); return latest;
    });
    return { result, mode, ...stateResponse(user, state) };
  }
  function repair(user, body) {
    const state = store.transact(() => {
      const latest = getState(user), gadget = ownedGadget(latest, body.gadgetId);
      const result = game.repairGadget(latest, gadget, now(), role(user));
      if (!result.ok) throw new ApiError(409, 'REPAIR_UNAVAILABLE', result.reason);
      store.saveState(user.id, latest); return latest;
    });
    return stateResponse(user, state);
  }
  function share(user, body) {
    if (body.confirmed !== true) throw new ApiError(400, 'SHARE_NOT_CONFIRMED', '完成分享后再领取修理机会。');
    const state = store.transact(() => {
      const latest = getState(user), day = game.localDay(now());
      if (latest.shareRewards?.date !== day) latest.shareRewards = { date: day, used: 0, credits: 0 };
      if ((latest.shareRewards.used || 0) >= 2) throw new ApiError(429, 'SHARE_LIMIT', '今天的分享修理机会已经领完啦。');
      latest.shareRewards.used += 1; latest.shareRewards.credits += 1;
      store.saveState(user.id, latest); return latest;
    });
    return stateResponse(user, state);
  }
  function preferences(user, body) {
    return store.transact(() => {
      const state = getState(user);
      if (body.favorites !== undefined) {
        if (!Array.isArray(body.favorites)) throw new ApiError(400, 'INVALID_PREFERENCES', '收藏格式不正确。');
        state.favorites = strings(body.favorites, 100).filter((id) => state.collected.includes(id));
      }
      if (typeof body.sound === 'boolean') state.settings.sound = body.sound;
      if (typeof body.analyticsConsent === 'boolean') state.settings.analyticsConsent = body.analyticsConsent;
      store.saveState(user.id, state); return stateResponse(user, state);
    });
  }
  async function illustration(user, body) {
    if (!providers.capabilities?.aiImage || !providers.generateIllustration) throw new ApiError(503, 'AI_IMAGE_UNAVAILABLE', '道具插画服务尚未配置，原创插画仍可正常使用。');
    const gadget = ownedGadget(getState(user), body.gadgetId);
    const cached = store.db.prepare('SELECT url FROM illustration_cache WHERE user_id=? AND gadget_id=?').get(user.id, gadget.id);
    if (cached) return { url: cached.url, illustrationUrl: cached.url, cached: true };
    const key = `${user.id}:${gadget.id}`;
    if (pendingIllustrations.has(key)) return pendingIllustrations.get(key);
    const work = (async () => {
      const reservedDay = store.transact(() => {
        const state = getState(user);
        const cap = role(user) === 'member' ? imageLimits.member : imageLimits.registered;
        if ((state.usage.images || 0) >= cap) throw new ApiError(429, 'IMAGE_DAILY_LIMIT', '今天的插画生成次数已用完，原创插画仍可正常使用。');
        state.usage.images = (state.usage.images || 0) + 1;
        store.saveState(user.id, state); return state.usage.date;
      });
      try {
        const generated = await providers.generateIllustration(gadget);
        let url;
        try { const parsed = new URL(generated?.url); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.hash) url = parsed.href; } catch { /* Validate even injected provider adapters. */ }
        if (!url || url.length > 2048) throw new ApiError(502, 'INVALID_ILLUSTRATION', '插画服务未能提供安全的图片地址。');
        store.db.prepare('INSERT INTO illustration_cache(user_id,gadget_id,url,created_at) VALUES(?,?,?,?) ON CONFLICT(user_id,gadget_id) DO UPDATE SET url=excluded.url,created_at=excluded.created_at').run(user.id, gadget.id, url, now());
        return { url, illustrationUrl: url, cached: false };
      } catch (error) {
        store.transact(() => {
          const state = getState(user);
          if (state.usage.date === reservedDay) state.usage.images = Math.max(0, (state.usage.images || 0) - 1);
          store.saveState(user.id, state);
        });
        throw error;
      }
    })();
    pendingIllustrations.set(key, work);
    try { return await work; } finally { pendingIllustrations.delete(key); }
  }
  async function route(req, res) {
    const url = new URL(req.url, 'http://localhost'), path = url.pathname.replace(/\/$/, '') || '/', method = req.method;
    const send = (value, status = 200) => sendJson(res, status, { ok: true, ...value });
    if (path === '/api/health' && method === 'GET') return send({ status: 'ok', database: 'connected', version: '2.0.0' });
    if (path === '/api/config' && method === 'GET') {
      await controllersReady;
      const extra = commerce?.config ? await commerce.config() : {};
      return send({ timeZone: config.timeZone || 'Asia/Shanghai', capabilities: { ...emptyProviders.capabilities, ...providers.capabilities }, products: [], events: typeof game.listSeasonalEvents === 'function' ? game.listSeasonalEvents(now()) : game.SEASONAL_EVENTS || [], community: Boolean(community), submissions: Boolean(community), ...extra });
    }
    if (path === '/api/auth/wechat/start' && method === 'GET') return send(auth.startWechat(req));
    if (path === '/api/auth/wechat/callback' && method === 'GET') {
      const code = await auth.callbackWechat(req, url.searchParams.get('code'), url.searchParams.get('state'));
      if (!config.publicAppUrl) throw new ApiError(503, 'PUBLIC_URL_UNAVAILABLE', '网站地址尚未配置，请联系管理员。');
      const target = new URL(config.publicAppUrl); target.hash = `wechat_code=${code}`;
      res.writeHead(303, { Location: target.toString() }); return res.end();
    }
    if (!path.startsWith('/api/')) return serveStatic(req, res, path, config);
    const raw = ['POST', 'PATCH', 'PUT'].includes(method) ? await readBody(req) : Buffer.alloc(0);
    if (path === '/api/payments/webhook' && method === 'POST') {
      await controllersReady;
      if (!commerce) throw new ApiError(503, 'PAYMENTS_UNAVAILABLE', '支付服务尚未配置。');
      return send(await commerce.handlePayment(raw, req.headers));
    }
    const body = raw.length ? parseJson(raw, req) : {};
    if (path === '/api/auth/phone/request' && method === 'POST') return send(await auth.requestPhone(req, body));
    if (path === '/api/auth/phone/verify' && method === 'POST') {
      const { user, token } = auth.verifyPhone(body); const state = mergeGuest(user, body.guestState);
      return send({ token, ...stateResponse(user, state) });
    }
    if (path === '/api/auth/wechat/exchange' && method === 'POST') {
      const { user, token } = auth.exchangeWechat(req, body); const state = mergeGuest(user, body.guestState);
      return send({ token, ...stateResponse(user, state) });
    }
    if (path === '/api/ideas' && method === 'GET') {
      await controllersReady;
      return send({ ideas: community ? await community.listPublic(Object.fromEntries(url.searchParams)) : [] });
    }
    if (path === '/api/events' && method === 'POST') {
      return send(telemetry.record(null, body));
    }
    const user = auth.requireUser(req);
    if (path === '/api/auth/me' && method === 'GET') return send(stateResponse(user));
    if (path === '/api/auth/logout' && method === 'POST') { auth.logout(req); return send({ loggedOut: true }); }
    if (path === '/api/state' && method === 'GET') return send(stateResponse(user));
    if (path === '/api/state/merge' && method === 'POST') return send(stateResponse(user, mergeGuest(user, body.state)));
    if (path === '/api/state/preferences' && method === 'POST') return send(preferences(user, body));
    if (path === '/api/play/draw' && method === 'POST') return send(await draw(user, body));
    if (path === '/api/play/use' && method === 'POST') return send(await use(user, body));
    if (path === '/api/play/fuse' && method === 'POST') return send(await fuse(user, body));
    if (path === '/api/play/repair' && method === 'POST') return send(repair(user, body));
    if (path === '/api/play/share' && method === 'POST') return send(share(user, body));
    if (path === '/api/ai/illustration' && method === 'POST') {
      return send(await illustration(user, body));
    }
    await controllersReady;
    if (path === '/api/ideas' && method === 'POST') {
      if (!community) throw new ApiError(503, 'COMMUNITY_UNAVAILABLE', '脑洞投稿服务暂不可用。');
      return send({ idea: await community.submit(user, body) }, 201);
    }
    if (path === '/api/ideas/mine' && method === 'GET') return send({ ideas: community ? await community.listMine(user) : [] });
    if (path === '/api/admin/ideas' && method === 'GET') {
      if (!admins.has(user.id)) throw new ApiError(403, 'ADMIN_REQUIRED', '这个操作需要管理员权限。');
      return send({ ideas: community ? await community.listPending(user) : [] });
    }
    if (path === '/api/admin/metrics' && method === 'GET') {
      if (!admins.has(user.id)) throw new ApiError(403, 'ADMIN_REQUIRED', '这个操作需要管理员权限。');
      return send(telemetry.summary(user));
    }
    const moderationMatch = path.match(/^\/api\/admin\/ideas\/([^/]+)$/);
    if (moderationMatch && method === 'PATCH') {
      if (!admins.has(user.id)) throw new ApiError(403, 'ADMIN_REQUIRED', '这个操作需要管理员权限。');
      if (!community) throw new ApiError(503, 'COMMUNITY_UNAVAILABLE', '脑洞投稿服务暂不可用。');
      return send({ idea: await community.moderate(user, moderationMatch[1], body) });
    }
    if (path === '/api/orders' && method === 'POST') {
      if (!commerce) throw new ApiError(503, 'PAYMENTS_UNAVAILABLE', '支付服务尚未配置。');
      return send(await commerce.createOrder(user, body), 201);
    }
    if (path === '/api/orders' && method === 'GET') return send(commerce ? await commerce.listOrders(user) : { orders: [] });
    const orderMatch = path.match(/^\/api\/orders\/([^/]+)(\/fulfillment)?$/);
    if (orderMatch && !orderMatch[2] && method === 'GET') {
      if (!commerce) throw new ApiError(404, 'ORDER_NOT_FOUND', '没有找到这笔订单。');
      return send(await commerce.getOrder(user, orderMatch[1]));
    }
    if (orderMatch?.[2] && method === 'POST') {
      if (!commerce) throw new ApiError(503, 'FULFILLMENT_UNAVAILABLE', '物流查询服务尚未配置。');
      return send(await commerce.refreshFulfillment(user, orderMatch[1]));
    }
    throw new ApiError(404, 'NOT_FOUND', '这个入口暂时不存在。');
  }
  async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN'); res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin) {
      if (!allowedOrigins.has(origin)) return sendJson(res, 403, { ok: false, error: { code: 'ORIGIN_NOT_ALLOWED', message: '当前网站没有连接服务的权限。' } });
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    try { await route(req, res); }
    catch (error) {
      if (res.writableEnded) return;
      const status = error.status || error.statusCode || 500;
      sendJson(res, status >= 400 && status <= 599 ? status : 500, { ok: false, error: {
        code: error.code && typeof error.code === 'string' && !error.code.startsWith('ERR_') ? error.code : 'INTERNAL_ERROR',
        message: status === 500 ? '口袋里的服务暂时打了个结，请稍后再试。' : short(error.message, 300),
      } });
    }
  }
  const server = createServer(handler);
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000; server.maxHeadersCount = 100;
  async function close() {
    if (server.listening) await new Promise((done) => server.close(done));
    await controllersReady; store.close();
  }
  return { handler, server, store, close, controllersReady };
}

function sendJson(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }
async function readBody(req) {
  if (Number(req.headers['content-length'] || 0) > BODY_LIMIT) throw new ApiError(413, 'BODY_TOO_LARGE', '提交的内容太长了。');
  const chunks = []; let total = 0;
  for await (const chunk of req) { total += chunk.length; if (total > BODY_LIMIT) throw new ApiError(413, 'BODY_TOO_LARGE', '提交的内容太长了。'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
function parseJson(raw, req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new ApiError(415, 'JSON_REQUIRED', '请使用 JSON 提交内容。');
  try { const body = JSON.parse(raw.toString('utf8')); if (!isObject(body)) throw new Error(); return body; }
  catch { throw new ApiError(400, 'INVALID_JSON', '提交的内容格式不正确。'); }
}
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function short(value, max = 100) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function strings(value, max) { return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === 'string' && id.length <= 200))].slice(0, max) : []; }
function strengthValue(value, strict = false) {
  if (strict && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100)) throw new ApiError(400, 'INVALID_STRENGTH', '使用力度需要在 0 到 100 之间。');
  return Math.min(100, Math.max(0, Number(value) || 0));
}
function validateWorry(value, required = false) {
  if (value !== undefined && typeof value !== 'string') throw new ApiError(400, 'INVALID_WORRY', '请用文字说说你的烦恼。');
  const worry = (value || '').trim();
  if (worry.length > 100) throw new ApiError(400, 'INVALID_WORRY', '烦恼最多写 100 个字。');
  if (required && !worry) throw new ApiError(400, 'INVALID_WORRY', '先写下一件小烦恼吧。');
  return worry;
}
function validGeneratedGadget(gadget) {
  return isObject(gadget) && typeof gadget.name === 'string' && gadget.name.length > 0 && gadget.name.length <= 40 && typeof gadget.effect === 'string' && gadget.effect.length <= 1000 && typeof gadget.warning === 'string' && Number.isFinite(gadget.maxDurability);
}
async function serveStatic(req, res, path, config) {
  if (!config.staticDir || req.method !== 'GET') throw new ApiError(404, 'NOT_FOUND', '这个入口暂时不存在。');
  const root = resolve(config.staticDir), base = config.basePath || '';
  let targetPath = path;
  if (base && path.startsWith(`${base}/`)) targetPath = path.slice(base.length);
  let decoded;
  try { decoded = decodeURIComponent(targetPath); } catch { throw new ApiError(400, 'INVALID_PATH', '请求地址不正确。'); }
  if (decoded.includes('\0')) throw new ApiError(400, 'INVALID_PATH', '请求地址不正确。');
  let file = resolve(root, `.${decoded}`);
  if (file !== root && !file.startsWith(`${root}${sep}`)) throw new ApiError(403, 'INVALID_PATH', '这个地址不可访问。');
  try { if (!(await stat(file)).isFile()) file = resolve(root, 'index.html'); }
  catch { file = extname(decoded) ? null : resolve(root, 'index.html'); }
  if (!file) throw new ApiError(404, 'NOT_FOUND', '没有找到这个文件。');
  let data;
  try { data = await readFile(file); } catch { throw new ApiError(404, 'SITE_NOT_BUILT', '网页尚未构建，请先运行 npm run build。'); }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https:; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
  res.setHeader('Cache-Control', extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600');
  res.writeHead(200); res.end(data);
}
