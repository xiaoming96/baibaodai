import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApiClient, getConfiguredApiBase } from '../src/lib/api.js';

const backend = 'https://pocket.example.test';
function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}
function stubFetch(responses = []) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options, json: options.body === undefined ? undefined : JSON.parse(options.body) });
    const next = responses.shift() ?? { ok: true };
    if (next instanceof Error) throw next;
    if (next instanceof Response) return next;
    return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, fetchImpl };
}
const jsonResponse = (status, payload) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

test('static deployment makes no relative API calls without an explicit backend', async () => {
  const fake = stubFetch();
  const api = createApiClient({ baseUrl: '', fetchImpl: fake.fetchImpl, storage: memoryStorage() });
  assert.equal(api.enabled, false);
  assert.deepEqual(await api.connect(), { ok: true, enabled: false, mode: 'offline' });
  await assert.rejects(api.draw('help', '工作有点累'), (error) => error instanceof ApiError && error.code === 'OFFLINE_MODE');
  await assert.rejects(api.requestPhoneCode('13800138000'), { code: 'OFFLINE_MODE' });
  await assert.rejects(api.listIdeas(), { code: 'OFFLINE_MODE' });
  assert.equal(fake.calls.length, 0);
});

test('only a complete HTTPS backend or local HTTP development backend is accepted', () => {
  for (const baseUrl of ['/api', '//api.example.test', 'http://example.test', 'javascript:alert(1)', 'https://user:pass@example.test', 'https://example.test?token=private', 'https://example.test/#token']) {
    assert.throws(() => createApiClient({ baseUrl }), { code: 'INVALID_API_BASE' });
  }
  assert.equal(createApiClient({ baseUrl: ' https://pocket.example.test/service/ ' }).baseUrl, `${backend}/service`);
  for (const host of ['localhost', '127.0.0.1', '[::1]']) assert.equal(createApiClient({ baseUrl: `http://${host}:8787` }).enabled, true);
});

test('public runtime configuration can supply the backend without fetching a static API path', () => {
  const previous = globalThis.window;
  try {
    globalThis.window = { __POCKET_CONFIG__: { apiBaseUrl: ' https://pocket.example.test ' } };
    assert.equal(getConfiguredApiBase(), backend);
    globalThis.window = {};
    assert.equal(getConfiguredApiBase(), '');
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('login envelope is preserved and session token goes only in configured backend headers', async () => {
  const storage = memoryStorage();
  const result = { ok: true, token: 'test-session-secret', user: { id: 'test-user' }, state: { collected: [] }, limits: { role: 'registered' } };
  const fake = stubFetch([result, { ok: true, ticket: 'ticket-one', gadget: { id: 'lamp' }, state: {}, limits: {} }]);
  const api = createApiClient({ baseUrl: backend, fetchImpl: fake.fetchImpl, storage });
  assert.deepEqual(await api.verifyPhoneCode('13800138000', '123456', { collected: ['lamp'] }), result);
  assert.deepEqual(api.user, result.user);
  await api.draw('help', '想专注');
  assert.equal(fake.calls[0].headers.Authorization, undefined);
  assert.equal(fake.calls[1].headers.Authorization, 'Bearer test-session-secret');
  assert.ok(fake.calls.every((call) => call.url.startsWith(`${backend}/api/`) && !call.url.includes('test-session-secret')));
  assert.equal(fake.calls[1].credentials, 'omit');
  assert.equal(fake.calls[1].redirect, 'error');
  assert.equal(storage.values.size, 1);
  assert.ok([...storage.values.keys()].every((key) => !key.includes('test-session-secret')));
  assert.deepEqual(fake.calls[0].json.guestState, { collected: ['lamp'] });
});

test('connect gets public configuration and restores an existing same-backend session', async () => {
  const storage = memoryStorage();
  const first = createApiClient({ baseUrl: backend, storage, fetchImpl: stubFetch([{ ok: true, token: 'saved-session', user: { id: 'one' } }]).fetchImpl });
  await first.verifyPhoneCode('13800138000', '123456');
  const config = { ok: true, capabilities: { phone: true, payments: false } };
  const me = { ok: true, user: { id: 'one' }, state: { collected: ['lamp'] }, limits: { role: 'registered' } };
  const fake = stubFetch([config, me]);
  const restored = createApiClient({ baseUrl: backend, storage, fetchImpl: fake.fetchImpl });
  assert.deepEqual(await restored.connect(), { ...config, ...me, enabled: true });
  assert.deepEqual(restored.config, config);
  assert.equal(fake.calls[0].headers.Authorization, undefined);
  assert.equal(fake.calls[1].headers.Authorization, 'Bearer saved-session');
  assert.equal(fake.calls[1].url, `${backend}/api/auth/me`);
});

test('expired restored sessions are cleared while public configuration remains usable', async () => {
  const storage = memoryStorage();
  const fake = stubFetch([
    { ok: true, token: 'expired-session', user: { id: 'one' } },
    { ok: true, capabilities: { phone: true } },
    jsonResponse(401, { ok: false, error: { code: 'SESSION_EXPIRED', message: '登录已过期，请重新登录。' } }),
    { ok: true, ideas: [] },
  ]);
  const api = createApiClient({ baseUrl: backend, storage, fetchImpl: fake.fetchImpl });
  await api.verifyPhoneCode('13800138000', '123456');
  assert.deepEqual(await api.connect(), { ok: true, capabilities: { phone: true }, enabled: true });
  assert.equal(api.token, '');
  assert.equal(api.user, null);
  assert.equal(storage.values.size, 0);
  await api.listIdeas();
  assert.equal(fake.calls.at(-1).headers.Authorization, undefined);
});

test('an authenticated request failure never falls back to a local mutation', async () => {
  const fake = stubFetch([
    { ok: true, token: 'active-session', user: { id: 'one' } },
    jsonResponse(503, { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: '道具正在休息，请稍后重试。' } }),
  ]);
  const api = createApiClient({ baseUrl: backend, fetchImpl: fake.fetchImpl, storage: memoryStorage() });
  await api.verifyPhoneCode('13800138000', '123456');
  await assert.rejects(api.useGadget({ gadgetId: 'lamp', strength: 30 }), { status: 503, code: 'SERVICE_UNAVAILABLE', message: '道具正在休息，请稍后重试。' });
  assert.equal(api.token, 'active-session');
  assert.equal(fake.calls.length, 2);
});

test('401 clears bearer session but invalid login attempts do not destroy another valid session', async () => {
  const unauthorized = () => jsonResponse(401, { ok: false, error: { code: 'INVALID_CODE', message: '验证码不正确。' } });
  const storage = memoryStorage();
  const fake = stubFetch([{ ok: true, token: 'active-session', user: { id: 'one' } }, unauthorized(), unauthorized()]);
  const api = createApiClient({ baseUrl: backend, fetchImpl: fake.fetchImpl, storage });
  await api.verifyPhoneCode('13800138000', '123456');
  await assert.rejects(api.verifyPhoneCode('13800138000', '000000'), { status: 401, code: 'INVALID_CODE' });
  assert.equal(api.token, 'active-session');
  await assert.rejects(api.getState(), { status: 401 });
  assert.equal(api.token, '');
  assert.equal(storage.values.size, 0);
});

test('logout clears tab authentication even when server is unreachable', async () => {
  const storage = memoryStorage();
  const fake = stubFetch([{ ok: true, token: 'active-session', user: { id: 'one' } }, new Error('network')]);
  const api = createApiClient({ baseUrl: backend, fetchImpl: fake.fetchImpl, storage });
  await api.verifyPhoneCode('13800138000', '123456');
  await assert.rejects(api.logout(), { code: 'NETWORK_ERROR' });
  assert.equal(api.token, '');
  assert.equal(api.user, null);
  assert.equal(storage.values.size, 0);
});

test('tokens are isolated by backend and blocked storage still allows an in-memory session', async () => {
  const storage = memoryStorage();
  const first = createApiClient({ baseUrl: backend, storage, fetchImpl: stubFetch([{ ok: true, token: 'private-session', user: {} }]).fetchImpl });
  await first.verifyPhoneCode('13800138000', '123456');
  assert.equal(createApiClient({ baseUrl: 'https://different.example.test', storage }).token, '');
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const fake = stubFetch([{ ok: true, token: 'memory-session', user: {} }, { ok: true, state: {} }]);
  const api = createApiClient({ baseUrl: backend, storage: blocked, fetchImpl: fake.fetchImpl });
  await api.verifyPhoneCode('13800138000', '123456');
  await api.getState();
  assert.equal(fake.calls[1].headers.Authorization, 'Bearer memory-session');
});

test('malformed JSON and unexpected response shapes produce safe errors', async () => {
  for (const response of [new Response('<html>secret proxy diagnostics</html>'), jsonResponse(200, []), jsonResponse(200, null), jsonResponse(200, { state: {} })]) {
    const api = createApiClient({ baseUrl: backend, fetchImpl: stubFetch([response]).fetchImpl, storage: memoryStorage() });
    await assert.rejects(api.getState(), (error) => error.code === 'INVALID_RESPONSE' && !error.message.includes('secret'));
  }
  const api = createApiClient({ baseUrl: backend, fetchImpl: stubFetch([jsonResponse(500, { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Error: secret database password\n at connect (/private/server.js:30)' } })]).fetchImpl });
  await assert.rejects(api.getState(), (error) => error.status === 500 && error.code === 'INTERNAL_ERROR' && !error.message.includes('private'));
});

test('network errors never expose the fetch exception or private request', async () => {
  const api = createApiClient({ baseUrl: backend, fetchImpl: stubFetch([new Error('private upstream credential: secret-value')]).fetchImpl });
  await assert.rejects(api.submitIdea({ name: '私人脑洞' }), (error) => error.code === 'NETWORK_ERROR' && !error.message.includes('secret-value') && !error.message.includes('私人脑洞'));
});

test('requests time out and abort the underlying transport', async () => {
  let aborted = false;
  const api = createApiClient({ baseUrl: backend, timeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new DOMException('aborted', 'AbortError')); }, { once: true });
  }) });
  await assert.rejects(api.getState(), { code: 'TIMEOUT', status: 0 });
  assert.equal(aborted, true);
});

test('analytics is opt-in and does not transmit requests without explicit consent', async () => {
  const fake = stubFetch();
  const api = createApiClient({ baseUrl: backend, fetchImpl: fake.fetchImpl });
  assert.deepEqual(await api.track('draw', { mode: 'help' }), { ok: true, skipped: true, reason: 'consent-required' });
  await api.track('draw', { mode: 'help' }, false);
  assert.equal(fake.calls.length, 0);
  await api.track('draw', { mode: 'help' }, true);
  assert.equal(fake.calls[0].url, `${backend}/api/events`);
  assert.deepEqual(fake.calls[0].json, { event: 'draw', props: { mode: 'help' }, consent: true });
});

test('client routes and payloads match authenticated backend contracts', async () => {
  const fake = stubFetch();
  const api = createApiClient({ baseUrl: backend, fetchImpl: fake.fetchImpl });
  const actions = [
    [() => api.requestPhoneCode('13800138000'), 'POST', '/api/auth/phone/request', { phone: '13800138000' }],
    [() => api.wechatLoginUrl(), 'GET', '/api/auth/wechat/start'],
    [() => api.exchangeWechatCode('one-use', { collected: [] }), 'POST', '/api/auth/wechat/exchange', { code: 'one-use', guestState: { collected: [] } }],
    [() => api.getMe(), 'GET', '/api/auth/me'],
    [() => api.getState(), 'GET', '/api/state'],
    [() => api.mergeState({ collected: [] }), 'POST', '/api/state/merge', { state: { collected: [] } }],
    [() => api.updatePreferences({ favorites: ['lamp'], sound: true }), 'POST', '/api/state/preferences', { favorites: ['lamp'], sound: true }],
    [() => api.draw('blind'), 'POST', '/api/play/draw', { kind: 'blind', worry: '' }],
    [() => api.useGadget({ gadgetId: 'lamp', strength: 80, worry: '专注', ticket: 'signed-ticket' }), 'POST', '/api/play/use', { gadgetId: 'lamp', strength: 80, worry: '专注', ticket: 'signed-ticket' }],
    [() => api.fuse(['lamp', 'clock']), 'POST', '/api/play/fuse', { ids: ['lamp', 'clock'] }],
    [() => api.repair('lamp'), 'POST', '/api/play/repair', { gadgetId: 'lamp' }],
    [() => api.confirmShare(), 'POST', '/api/play/share', { confirmed: true }],
    [() => api.generateIllustration('lamp'), 'POST', '/api/ai/illustration', { gadgetId: 'lamp' }],
    [() => api.listIdeas(), 'GET', '/api/ideas'],
    [() => api.myIdeas(), 'GET', '/api/ideas/mine'],
    [() => api.submitIdea({ name: '脑洞' }), 'POST', '/api/ideas', { name: '脑洞' }],
    [() => api.listPendingIdeas(), 'GET', '/api/admin/ideas'],
    [() => api.moderateIdea('idea-one', { status: 'approved' }), 'PATCH', '/api/admin/ideas/idea-one', { status: 'approved' }],
    [() => api.getMetrics(), 'GET', '/api/admin/metrics'],
    [() => api.listOrders(), 'GET', '/api/orders'],
    [() => api.createOrder({ product: 'membership' }), 'POST', '/api/orders', { product: 'membership' }],
    [() => api.getOrder('id/with spaces?'), 'GET', '/api/orders/id%2Fwith%20spaces%3F'],
    [() => api.refreshFulfillment('order-one'), 'POST', '/api/orders/order-one/fulfillment', {}],
  ];
  for (const [run, method, route, body] of actions) {
    assert.deepEqual(await run(), { ok: true });
    const call = fake.calls.at(-1);
    assert.equal(call.url, `${backend}${route}`);
    assert.equal(call.method, method);
    assert.deepEqual(call.json, body);
  }
});
