import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { createState, collectGadget, GADGETS, getDurability } from '../src/lib/game.js';

const INITIAL_TIME = Date.parse('2026-10-14T03:00:00Z');

async function fixture(t, options = {}) {
  let timestamp = INITIAL_TIME;
  const messages = new Map();
  const providers = {
    capabilities: { phoneLogin: true, wechatLogin: false, aiText: false, aiImage: false, payments: false, fulfillment: false },
    async sendSms(phone, code) { messages.set(phone, code); return { sent: true }; },
    ...options.providers,
  };
  const app = createApp({ providers, now: () => timestamp, rng: () => 0, ...options });
  await app.controllersReady;
  await new Promise((done) => app.server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  async function request(path, { method = 'GET', body, token, headers = {}, raw } = {}) {
    const response = await fetch(`${base}${path}`, {
      method, headers: { ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : raw !== undefined ? { body: raw } : {}), redirect: 'manual',
    });
    const content = await response.text();
    return { status: response.status, headers: response.headers, body: content ? JSON.parse(content) : null };
  }
  async function login(phone = '13800138000', guestState) {
    const requested = await request('/api/auth/phone/request', { method: 'POST', body: { phone } });
    assert.equal(requested.status, 200);
    const canonical = phone.startsWith('+86') ? phone : `+86${phone}`;
    const verified = await request('/api/auth/phone/verify', { method: 'POST', body: { phone, code: messages.get(canonical), guestState } });
    assert.equal(verified.status, 200);
    return verified.body;
  }
  t.after(() => app.close());
  return { app, request, login, messages, advance: (amount) => { timestamp += amount; }, time: () => timestamp };
}

test('health and configuration work without credentials, and login fails explicitly', async (t) => {
  const f = await fixture(t, { providers: { capabilities: { phoneLogin: false, payments: false } } });
  const health = await f.request('/api/health');
  assert.equal(health.status, 200); assert.equal(health.body.database, 'connected');
  const config = await f.request('/api/config');
  assert.equal(config.body.capabilities.phoneLogin, false);
  assert.equal(config.body.capabilities.aiText, false);
  assert.ok(config.body.products.some((product) => product.id === 'membership'));
  assert.ok(config.body.events.every((event) => typeof event.active === 'boolean'));
  assert.equal((await f.request('/api/auth/phone/request', { method: 'POST', body: { phone: '13800138000' } })).status, 503);
  assert.equal((await f.request('/api/auth/me')).status, 401);
});

test('phone verification sends a real adapter OTP, accepts E164, hashes session tokens, and masks phone', async (t) => {
  const f = await fixture(t);
  const sent = await f.request('/api/auth/phone/request', { method: 'POST', body: { phone: '+8613800138000' } });
  assert.equal(sent.body.sent, true); assert.equal(sent.body.code, undefined);
  assert.equal(sent.body.token, undefined);
  const code = f.messages.get('+8613800138000');
  assert.match(code, /^\d{6}$/);
  const verified = await f.request('/api/auth/phone/verify', { method: 'POST', body: { phone: '13800138000', code } });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.user.phone, '138****8000');
  assert.equal(verified.body.limits.help.limit, 5);
  const stored = f.app.store.db.prepare('SELECT * FROM sessions').get();
  assert.notEqual(stored.token_hash, verified.body.token);
  assert.match(stored.token_hash, /^[0-9a-f]{64}$/);
  assert.equal((await f.request('/api/auth/phone/verify', { method: 'POST', body: { phone: '13800138000', code } })).body.error.code, 'OTP_EXPIRED');
});

test('OTP resend throttling, five attempts, expiry, and IP limits resist forgery', async (t) => {
  const f = await fixture(t);
  await f.request('/api/auth/phone/request', { method: 'POST', body: { phone: '13800138000' } });
  assert.equal((await f.request('/api/auth/phone/request', { method: 'POST', body: { phone: '+8613800138000' } })).status, 429);
  const real = f.messages.get('+8613800138000'), wrong = real === '000000' ? '111111' : '000000';
  for (let attempt = 0; attempt < 5; attempt++) assert.equal((await f.request('/api/auth/phone/verify', { method: 'POST', body: { phone: '13800138000', code: wrong } })).status, 400);
  assert.equal((await f.request('/api/auth/phone/verify', { method: 'POST', body: { phone: '13800138000', code: real } })).status, 429);
  f.advance(61000);
  await f.request('/api/auth/phone/request', { method: 'POST', body: { phone: '13800138000' } });
  f.advance(301000);
  assert.equal((await f.request('/api/auth/phone/verify', { method: 'POST', body: { phone: '13800138000', code: f.messages.get('+8613800138000') } })).body.error.code, 'OTP_EXPIRED');
  for (let n = 1; n <= 8; n++) assert.equal((await f.request('/api/auth/phone/request', { method: 'POST', body: { phone: `1380013800${n}` }, headers: { 'X-Forwarded-For': `192.0.2.${n}` } })).status, 200);
  assert.equal((await f.request('/api/auth/phone/request', { method: 'POST', body: { phone: '13800138009' }, headers: { 'X-Forwarded-For': '198.51.100.100' } })).body.error.code, 'OTP_IP_LIMIT');
});

test('guest cloud merge cannot import quotas, membership, custom tools, or unknown favorites', async (t) => {
  const f = await fixture(t);
  const account = await f.login('13800138000', {
    collected: ['courage-badge', 'not-a-real-gadget'], favorites: ['courage-badge', 'wish-star'],
    customGadgets: [{ id: 'cheat', name: 'Forged' }], usage: { date: '2026-10-14', help: -100 },
    entitlements: ['children-day'], memberUntil: INITIAL_TIME + 999999999,
    stats: { maxChaosStreak: 999 }, achievements: ['mastermind'], settings: { sound: true },
  });
  assert.deepEqual(account.state.collected, ['courage-badge']);
  assert.deepEqual(account.state.favorites, ['courage-badge']);
  assert.equal(account.state.usage.help, 0); assert.equal(account.state.customGadgets.length, 0);
  assert.deepEqual(account.state.entitlements, []);
  assert.equal(account.user.role, 'registered'); assert.equal(account.user.memberUntil, 0);
  assert.equal(account.state.achievements.includes('mastermind'), false);
  const later = await f.request('/api/state/merge', { method: 'POST', token: account.token, body: { state: { usage: { help: -500 }, collected: ['pause-clock'] } } });
  assert.equal(later.body.state.usage.help, 0); assert.ok(later.body.state.collected.includes('pause-clock'));
});

test('draw tickets charge once, are bound to users and gadgets, and cannot be reused', async (t) => {
  const f = await fixture(t);
  const a = await f.login(), b = await f.login('13900139000', { collected: ['courage-badge'] });
  const draw = await f.request('/api/play/draw', { method: 'POST', token: a.token, body: { kind: 'help', worry: '明天要汇报，很紧张' } });
  assert.equal(draw.body.gadget.id, 'courage-badge'); assert.equal(draw.body.state.usage.help, 1);
  const use = await f.request('/api/play/use', { method: 'POST', token: a.token, body: { gadgetId: draw.body.gadget.id, strength: 10, ticket: draw.body.ticket, kind: 'surprise', outcome: { text: 'forged' } } });
  assert.equal(use.status, 200); assert.equal(use.body.state.usage.help, 1);
  assert.equal(use.body.outcome.kind, 'normal'); assert.notEqual(use.body.outcome.text, 'forged');
  assert.equal(use.body.state.history.length, 1);
  const replay = await f.request('/api/play/use', { method: 'POST', token: a.token, body: { gadgetId: draw.body.gadget.id, strength: 10, ticket: draw.body.ticket } });
  assert.equal(replay.body.state.usage.help, 2); assert.equal(replay.body.state.history.length, 2);
  const foreign = await f.request('/api/play/use', { method: 'POST', token: b.token, body: { gadgetId: draw.body.gadget.id, strength: 10, ticket: draw.body.ticket } });
  assert.equal(foreign.body.state.usage.help, 1);
  assert.equal((await f.request('/api/play/use', { method: 'POST', token: b.token, body: { gadgetId: 'wish-star', strength: 100 } })).status, 404);
});

test('concurrent requests cannot exceed server quotas and a new China calendar day resets them', async (t) => {
  const f = await fixture(t);
  const account = await f.login();
  const requests = await Promise.all(Array.from({ length: 10 }, () => f.request('/api/play/draw', { method: 'POST', token: account.token, body: { kind: 'help', worry: '紧张' } })));
  assert.equal(requests.filter((response) => response.status === 200).length, 5);
  assert.equal(requests.filter((response) => response.status === 429).length, 5);
  const merged = await f.request('/api/state/merge', { method: 'POST', token: account.token, body: { state: { usage: { help: 0 } } } });
  assert.equal(merged.body.state.usage.help, 5);
  f.advance(86400000);
  const nextDay = await f.request('/api/play/draw', { method: 'POST', token: account.token, body: { kind: 'help', worry: '紧张' } });
  assert.equal(nextDay.status, 200); assert.equal(nextDay.body.state.usage.help, 1);
});

test('durability, free repair, and capped successful-share credits are persisted', async (t) => {
  const f = await fixture(t);
  const account = await f.login('13800138000', { collected: ['courage-badge'] });
  for (let n = 0; n < 3; n++) assert.equal((await f.request('/api/play/use', { method: 'POST', token: account.token, body: { gadgetId: 'courage-badge', strength: 100 } })).status, 200);
  const broken = await f.request('/api/play/use', { method: 'POST', token: account.token, body: { gadgetId: 'courage-badge', strength: 100 } });
  assert.equal(broken.body.error.code, 'GADGET_BROKEN');
  assert.equal((await f.request('/api/play/repair', { method: 'POST', token: account.token, body: { gadgetId: 'courage-badge' } })).status, 200);
  await f.request('/api/play/use', { method: 'POST', token: account.token, body: { gadgetId: 'courage-badge', strength: 10 } });
  assert.equal((await f.request('/api/play/repair', { method: 'POST', token: account.token, body: { gadgetId: 'courage-badge' } })).status, 409);
  assert.equal((await f.request('/api/play/share', { method: 'POST', token: account.token, body: { confirmed: false } })).status, 400);
  assert.equal((await f.request('/api/play/share', { method: 'POST', token: account.token, body: { confirmed: true } })).status, 200);
  assert.equal((await f.request('/api/play/repair', { method: 'POST', token: account.token, body: { gadgetId: 'courage-badge' } })).status, 200);
  assert.equal((await f.request('/api/play/share', { method: 'POST', token: account.token, body: { confirmed: true } })).status, 200);
  assert.equal((await f.request('/api/play/share', { method: 'POST', token: account.token, body: { confirmed: true } })).status, 429);
});

test('fusion requires two owned original tools and consumes registered daily quota', async (t) => {
  const f = await fixture(t, { rng: () => 0.5 });
  const account = await f.login('13800138000', { collected: ['courage-badge', 'pause-clock'] });
  assert.equal((await f.request('/api/play/fuse', { method: 'POST', token: account.token, body: { ids: ['courage-badge', 'wish-star'] } })).status, 404);
  for (let n = 0; n < 2; n++) {
    const fusion = await f.request('/api/play/fuse', { method: 'POST', token: account.token, body: { ids: ['courage-badge', 'pause-clock'] } });
    assert.equal(fusion.body.result.ok, true); assert.ok(fusion.body.state.customGadgets.some((gadget) => gadget.id === fusion.body.result.gadget.id));
  }
  assert.equal((await f.request('/api/play/fuse', { method: 'POST', token: account.token, body: { ids: ['courage-badge', 'pause-clock'] } })).status, 429);
});

test('SQLite membership is authoritative and gets unlimited use with shorter repair time', async (t) => {
  const f = await fixture(t);
  const account = await f.login('13800138000', { collected: ['courage-badge'] });
  f.app.store.updateUser(account.user.id, { membershipUntil: f.time() + 2 * 86400000 });
  const profile = await f.request('/api/auth/me', { token: account.token });
  assert.equal(profile.body.user.role, 'member'); assert.equal(profile.body.limits.help.limit, null);
  for (let n = 0; n < 3; n++) await f.request('/api/play/use', { method: 'POST', token: account.token, body: { gadgetId: 'courage-badge', strength: 100 } });
  const state = f.app.store.getState(account.user.id);
  assert.equal(getDurability(state, GADGETS[0], f.time(), 'member').remainingMs, 12 * 3600000);
  f.advance(12 * 3600000 + 1);
  const repaired = await f.request('/api/play/use', { method: 'POST', token: account.token, body: { gadgetId: 'courage-badge', strength: 10 } });
  assert.equal(repaired.status, 200);
});

test('AI adapter failures keep gameplay working and generated stories preserve server outcomes', async (t) => {
  const f = await fixture(t, { providers: {
    capabilities: { phoneLogin: true, aiText: true },
    async sendSms(phone, code) { f.messages.set(phone, code); },
    async generateGadget() { throw new Error('temporary outage'); },
    async generateOutcome(_gadget, _worry, _strength, kind) { return { kind, title: '温柔的小结果', text: '这是来自已配置服务的原创故事。' }; },
  } });
  const account = await f.login();
  const draw = await f.request('/api/play/draw', { method: 'POST', token: account.token, body: { kind: 'help', worry: '汇报紧张' } });
  assert.equal(draw.body.mode, 'local');
  const result = await f.request('/api/play/use', { method: 'POST', token: account.token, body: { gadgetId: draw.body.gadget.id, ticket: draw.body.ticket, strength: 0 } });
  assert.equal(result.body.mode, 'ai'); assert.equal(result.body.outcome.kind, 'normal');
  assert.equal(result.body.state.history.length, 1); assert.equal(result.body.state.history[0].text, result.body.outcome.text);
});

test('illustration cache joins concurrent work, reserves a daily cap, and refunds failed requests', async (t) => {
  let calls = 0;
  const f = await fixture(t, { config: { imageLimit: 1 }, providers: {
    capabilities: { phoneLogin: true, aiImage: true },
    async sendSms(phone, code) { f.messages.set(phone, code); },
    async generateIllustration() { calls++; await new Promise((done) => setTimeout(done, 10)); return { url: 'https://example.com/original.png' }; },
  } });
  const account = await f.login('13800138000', { collected: ['courage-badge', 'pause-clock'] });
  const [one, two] = await Promise.all(Array.from({ length: 2 }, () => f.request('/api/ai/illustration', { method: 'POST', token: account.token, body: { gadgetId: 'courage-badge' } })));
  assert.equal(one.status, 200); assert.equal(two.status, 200); assert.equal(calls, 1);
  const cached = await f.request('/api/ai/illustration', { method: 'POST', token: account.token, body: { gadgetId: 'courage-badge' } });
  assert.equal(cached.body.cached, true); assert.equal(calls, 1);
  assert.equal((await f.request('/api/ai/illustration', { method: 'POST', token: account.token, body: { gadgetId: 'pause-clock' } })).status, 429);
  assert.equal((await f.request('/api/ai/illustration', { method: 'POST', token: account.token, body: { gadgetId: 'unowned' } })).status, 404);
});

test('failed or unsafe illustration results do not spend the daily image allowance', async (t) => {
  let attempts = 0;
  const f = await fixture(t, { config: { imageLimit: 1 }, providers: {
    capabilities: { phoneLogin: true, aiImage: true },
    async sendSms(phone, code) { f.messages.set(phone, code); },
    async generateIllustration() { attempts++; if (attempts === 1) throw Object.assign(new Error('Service unavailable'), { statusCode: 503, code: 'IMAGE_UNAVAILABLE' }); return { url: attempts === 2 ? 'http://unsafe.example/art.png' : 'https://example.com/verified.png' }; },
  } });
  const account = await f.login('13800138000', { collected: ['courage-badge'] });
  const request = () => f.request('/api/ai/illustration', { method: 'POST', token: account.token, body: { gadgetId: 'courage-badge' } });
  assert.equal((await request()).status, 503);
  assert.equal(f.app.store.getState(account.user.id).usage.images, 0);
  assert.equal((await request()).status, 502);
  assert.equal(f.app.store.getState(account.user.id).usage.images, 0);
  assert.equal((await request()).status, 200);
  assert.equal(f.app.store.getState(account.user.id).usage.images, 1);
});

test('commerce HTTP routes accept verified raw webhooks only and update account entitlements', async (t) => {
  const f = await fixture(t, { providers: {
    capabilities: { phoneLogin: true, payments: true, fulfillment: false },
    async sendSms(phone, code) { f.messages.set(phone, code); },
    async createCheckout(order) { return { checkoutUrl: `https://checkout.example/pay/${order.id}` }; },
    verifyPayment(raw, headers) {
      assert.ok(Buffer.isBuffer(raw));
      if (headers['x-test-signature'] !== 'verified-by-adapter') throw Object.assign(new Error('签名验证失败。'), { statusCode: 401, code: 'INVALID_SIGNATURE' });
      return JSON.parse(raw.toString('utf8'));
    },
  } });
  const one = await f.login(), two = await f.login('13900139000');
  const checkout = await f.request('/api/orders', { method: 'POST', token: one.token, body: { productId: 'membership' } });
  assert.equal(checkout.status, 201); assert.equal(checkout.body.order.status, 'pending');
  assert.equal((await f.request('/api/auth/me', { token: one.token })).body.user.role, 'registered');
  const id = checkout.body.order.id;
  assert.equal((await f.request(`/api/orders/${id}`, { token: two.token })).status, 404);
  const payment = { eventId: 'verified-test-event', orderId: id, status: 'paid', amountCents: 990, currency: 'CNY' };
  assert.equal((await f.request('/api/payments/webhook', { method: 'POST', body: payment })).status, 401);
  const verified = await f.request('/api/payments/webhook', { method: 'POST', body: payment, headers: { 'X-Test-Signature': 'verified-by-adapter' } });
  assert.equal(verified.status, 200); assert.equal(verified.body.accepted, true);
  assert.equal((await f.request('/api/auth/me', { token: one.token })).body.user.role, 'member');
  assert.equal((await f.request(`/api/orders/${id}`, { token: one.token })).body.order.status, 'paid');
  const duplicate = await f.request('/api/payments/webhook', { method: 'POST', body: payment, headers: { 'X-Test-Signature': 'verified-by-adapter' } });
  assert.equal(duplicate.body.duplicate, true);
});

test('community keeps pending ideas private, user scoped, and behind real authentication', async (t) => {
  const f = await fixture(t);
  const one = await f.login(), two = await f.login('13900139000');
  const created = await f.request('/api/ideas', { method: 'POST', token: one.token, body: { name: '星期天口袋垫', effect: '让今天有一点松软的周末感。', warning: '可能会把老板的话听成晚安。' } });
  assert.equal(created.status, 201); assert.equal(created.body.idea.status, 'pending');
  assert.deepEqual((await f.request('/api/ideas')).body.ideas, []);
  assert.equal((await f.request('/api/ideas/mine', { token: one.token })).body.ideas.length, 1);
  assert.deepEqual((await f.request('/api/ideas/mine', { token: two.token })).body.ideas, []);
  assert.equal((await f.request(`/api/admin/ideas/${created.body.idea.id}`, { method: 'PATCH', token: one.token, body: { status: 'approved' } })).status, 403);
  assert.equal((await f.request('/api/ideas', { method: 'POST', body: { name: '匿名投稿' } })).status, 401);
  f.app.store.updateIdea(created.body.idea.id, { status: 'approved', approvedAt: f.time() });
  const approved = (await f.request('/api/ideas')).body.ideas[0];
  assert.equal(approved.contributorBadge, '口袋创想家'); assert.equal(approved.userId, undefined);
});

test('only opted in aggregate telemetry is persisted, without worries, props, or identity', async (t) => {
  const f = await fixture(t);
  const skipped = await f.request('/api/events', { method: 'POST', body: { event: 'visit', props: { worry: 'private' } } });
  assert.equal(skipped.body.recorded, false);
  const recorded = await f.request('/api/events', { method: 'POST', body: { event: 'visit', consent: true, props: { worry: 'private', phone: '13800138000' } } });
  assert.equal(recorded.body.recorded, true);
  const rows = f.app.store.db.prepare('SELECT * FROM telemetry').all();
  assert.deepEqual(Object.keys(rows[0]), ['day', 'event', 'count']); assert.equal(rows[0].count, 1);
  assert.equal((await f.request('/api/events', { method: 'POST', body: { event: 'arbitrary', consent: true } })).status, 400);
});

test('sessions expire, logout revokes access, CORS forbids unknown origins, and JSON is bounded', async (t) => {
  const f = await fixture(t);
  const account = await f.login();
  const allowed = await f.request('/api/health', { headers: { Origin: 'https://xiaoming96.github.io' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://xiaoming96.github.io');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), null);
  assert.equal((await f.request('/api/health', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await f.request('/api/auth/phone/request', { method: 'POST', raw: '{"bad"' })).status, 400);
  assert.equal((await f.request('/api/state/merge', { method: 'POST', token: account.token, body: { state: { huge: 'x'.repeat(65536) } } })).status, 413);
  await f.request('/api/auth/logout', { method: 'POST', token: account.token });
  assert.equal((await f.request('/api/auth/me', { token: account.token })).status, 401);
  f.advance(61000);
  const next = await f.login(); f.advance(31 * 86400000);
  assert.equal((await f.request('/api/auth/me', { token: next.token })).body.error.code, 'SESSION_EXPIRED');
});

test('WeChat state and short lived exchange codes are fingerprint bound and single use', async (t) => {
  const f = await fixture(t, { config: { publicAppUrl: 'https://xiaoming96.github.io/baibaodai/' }, providers: {
    capabilities: { phoneLogin: false, wechatLogin: true },
    wechatAuthorizationUrl(state) { return `https://open.weixin.qq.com/oauth?state=${state}`; },
    async exchangeWechatCode(code) { assert.equal(code, 'real-provider-code'); return { openid: 'verified-openid', nickname: '云边旅人' }; },
  } });
  const started = await f.request('/api/auth/wechat/start');
  const state = new URL(started.body.url).searchParams.get('state');
  const rejected = await f.request(`/api/auth/wechat/callback?state=${state}&code=real-provider-code`, { headers: { 'User-Agent': 'different-browser' } });
  assert.equal(rejected.status, 400);
  const callback = await f.request(`/api/auth/wechat/callback?state=${state}&code=real-provider-code`);
  assert.equal(callback.status, 303);
  const code = new URLSearchParams(new URL(callback.headers.get('location')).hash.slice(1)).get('wechat_code');
  assert.ok(code);
  assert.equal((await f.request(`/api/auth/wechat/callback?state=${state}&code=real-provider-code`)).status, 400);
  const logged = await f.request('/api/auth/wechat/exchange', { method: 'POST', body: { code } });
  assert.equal(logged.status, 200); assert.equal(logged.body.user.nickname, '云边旅人');
  assert.equal((await f.request('/api/auth/wechat/exchange', { method: 'POST', body: { code } })).status, 400);
});

test('database survives restart without storing clear text tokens', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'pocket-server-'));
  const path = join(directory, 'state.sqlite');
  const first = await fixture(t, { dbPath: path });
  const account = await first.login('13800138000', { collected: ['pause-clock'] });
  const second = await fixture(t, { dbPath: path, config: { adminUserIds: [account.user.id] } });
  const restored = await second.request('/api/auth/me', { token: account.token });
  assert.equal(restored.status, 200); assert.deepEqual(restored.body.state.collected, ['pause-clock']);
  assert.equal(restored.body.user.isAdmin, true);
  const created = await second.request('/api/ideas', { method: 'POST', token: account.token, body: { name: '清风按钮', effect: '给忙碌的一天吹来一点小风。', warning: '可能会吹歪便利贴。' } });
  assert.equal((await second.request('/api/admin/ideas', { token: account.token })).body.ideas.length, 1);
  assert.equal((await second.request(`/api/admin/ideas/${created.body.idea.id}`, { method: 'PATCH', token: account.token, body: { status: 'approved' } })).status, 200);
  assert.equal((await second.request('/api/ideas')).body.ideas.length, 1);
  assert.equal((await second.request('/api/admin/metrics', { token: account.token })).status, 200);
  t.after(() => rm(directory, { recursive: true, force: true }));
});

test('repeated guest history synchronization is idempotent and keeps quota authoritative', async (t) => {
  const f = await fixture(t);
  const guestState = { collected: ['courage-badge'], history: [{ gadgetId: 'courage-badge', kind: 'normal', title: '一小步', text: '今天也有好好说话。', createdAt: INITIAL_TIME - 1000 }] };
  const session = await f.login('13800138000', guestState);
  assert.equal(session.state.history.length, 1);
  const a = await f.request('/api/state/merge', { method: 'POST', token: session.token, body: { state: guestState } });
  const b = await f.request('/api/state/merge', { method: 'POST', token: session.token, body: { state: guestState } });
  assert.equal(a.body.state.history.length, 1);
  assert.equal(b.body.state.history.length, 1);
  assert.equal(b.body.state.usage.help, 0);
});
