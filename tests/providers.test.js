import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createProviders } from '../server/providers.js';
import { GADGETS } from '../src/lib/game.js';

const timestamp = 1_800_000_000_000;
const paymentEnv = {
  PAY_GATEWAY_URL: 'https://payments.example.test/checkout', PAY_GATEWAY_TOKEN: 'test-gateway-token',
  PAY_WEBHOOK_SECRET: 'test-webhook-secret', PUBLIC_SITE_URL: 'https://pocket.example.test/',
};
const llmEnv = { LLM_API_KEY: 'test-llm-key', LLM_API_URL: 'https://models.example.test/v1/chat/completions' };
const gadgetJson = () => {
  const { name, category, rarity, kind, color, maxDurability, effect, warning, keywords, fortune, stories } = GADGETS[0];
  return { name, category, rarity, kind, color, maxDurability, effect, warning, keywords, fortune, stories };
};
function reply(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }
function modelReply(value) { return reply({ choices: [{ message: { content: typeof value === 'string' ? value : JSON.stringify(value) } }] }); }
function signed(event, offsetSeconds = 0) {
  const raw = Buffer.from(JSON.stringify(event));
  const time = String(timestamp / 1000 + offsetSeconds);
  return { raw, headers: { 'x-pocket-timestamp': time, 'x-pocket-signature': createHmac('sha256', paymentEnv.PAY_WEBHOOK_SECRET).update(`${time}.`).update(raw).digest('hex') } };
}

test('unconfigured providers fail closed without making network calls', async () => {
  let calls = 0;
  const providers = createProviders({ env: {}, fetchImpl: async () => { calls += 1; return reply({}); } });
  assert.deepEqual(providers.getCapabilities(), { phoneLogin: false, wechatLogin: false, aiText: false, aiImage: false, payments: false, fulfillment: false });
  await assert.rejects(providers.sendSms('13800138000', '123456'), { statusCode: 503 });
  await assert.rejects(providers.generateGadget('明天汇报紧张'), { statusCode: 503 });
  await assert.rejects(providers.createCheckout({}), { statusCode: 503 });
  assert.throws(() => providers.verifyPayment(Buffer.from('{}'), {}), { statusCode: 503 });
  assert.equal(calls, 0);
});

test('production refuses HTTP endpoints and credential-bearing URLs', () => {
  for (const url of ['http://localhost:8080/', 'https://token@example.test/', 'file:///tmp/api']) {
    const providers = createProviders({ env: { ...llmEnv, LLM_API_URL: url } });
    assert.equal(providers.capabilities.aiText, false);
  }
  const providers = createProviders({ env: { NODE_ENV: 'test', ...llmEnv, LLM_API_URL: 'http://localhost:8080/' }, allowInsecureTestUrls: true });
  assert.equal(providers.capabilities.aiText, false, 'global fetch cannot bypass HTTPS checks');
});

test('SMS delivers only the required payload and keeps the token server-side', async () => {
  let request;
  const providers = createProviders({ env: { SMS_GATEWAY_URL: 'https://sms.example.test/send', SMS_GATEWAY_TOKEN: 'test-sms-token' }, fetchImpl: async (url, options) => { request = { url, options }; return reply({ sent: true, token: 'do-not-forward' }); } });
  assert.deepEqual(await providers.sendSms('13800138000', '123456'), { sent: true });
  assert.deepEqual(JSON.parse(request.options.body), { phone: '13800138000', code: '123456', ttlSeconds: 300, scene: 'login' });
  assert.equal(request.options.headers.authorization, 'Bearer test-sms-token');
  assert.equal(request.options.redirect, 'error');
  assert.ok(request.options.signal instanceof AbortSignal);
  await assert.rejects(providers.sendSms('not-a-phone', '123456'), { statusCode: 400 });
});

test('SMS adapter forwards an eight-digit E164 number in the production gateway format', async () => {
  const requests = [];
  const providers = createProviders({ env: { SMS_GATEWAY_URL: 'https://sms.example.test/send', SMS_GATEWAY_TOKEN: 'test-sms-token' }, fetchImpl: async (url, options) => {
    requests.push({ url, method: options.method, body: JSON.parse(options.body) });
    return reply({ sent: true });
  } });
  assert.deepEqual(await providers.sendSms('+67612345', '123456'), { sent: true });
  assert.deepEqual(requests, [{ url: 'https://sms.example.test/send', method: 'POST', body: { phone: '+67612345', code: '123456', ttlSeconds: 300, scene: 'login' } }]);
  await assert.rejects(providers.sendSms('+1234567', '123456'), { statusCode: 400 });
  await assert.rejects(providers.sendSms('+1234567890123456', '123456'), { statusCode: 400 });
  assert.equal(requests.length, 1);
});

test('WeChat uses official endpoints and returns identity without upstream tokens', async () => {
  const calls = [];
  const env = { WECHAT_APP_ID: 'test-app', WECHAT_APP_SECRET: 'test-secret', WECHAT_REDIRECT_URI: 'https://pocket.example.test/api/auth/wechat/callback' };
  const providers = createProviders({ env, fetchImpl: async (url) => {
    calls.push(new URL(url));
    return calls.length === 1 ? reply({ openid: 'test-openid', access_token: 'test-access', refresh_token: 'test-refresh' }) : reply({ openid: 'test-openid', nickname: '口袋旅人', access_token: 'never-forward' });
  } });
  const url = new URL(providers.wechatAuthorizationUrl('random-state-at-least-16'));
  assert.equal(url.origin, 'https://open.weixin.qq.com');
  assert.equal(url.searchParams.get('state'), 'random-state-at-least-16');
  assert.equal(url.searchParams.has('secret'), false);
  assert.deepEqual(await providers.exchangeWechatCode('test-code'), { openid: 'test-openid', nickname: '口袋旅人' });
  assert.ok(calls.every((call) => call.origin === 'https://api.weixin.qq.com'));
  assert.equal(calls[0].searchParams.get('secret'), 'test-secret');
  assert.equal(calls[1].searchParams.get('access_token'), 'test-access');
  assert.throws(() => providers.wechatAuthorizationUrl('short'), { statusCode: 400 });
});

test('validated AI gadgets use server-generated IDs and the existing art vocabulary', async () => {
  let payload;
  const providers = createProviders({ env: llmEnv, fetchImpl: async (_url, options) => { payload = JSON.parse(options.body); return modelReply(gadgetJson()); } });
  const gadget = await providers.generateGadget('明天汇报很紧张');
  assert.match(gadget.id, /^ai-[a-f\d-]+$/);
  assert.equal(gadget.name, GADGETS[0].name);
  assert.deepEqual(gadget.visual, { kind: gadget.kind, color: gadget.color });
  assert.equal(payload.model, 'gpt-4.1-mini');
  assert.equal(payload.response_format.type, 'json_object');
  assert.equal(JSON.stringify(gadget).includes(llmEnv.LLM_API_KEY), false);
});

test('AI rejects non-JSON, unknown enums, oversized fields and existing IP names', async () => {
  const variants = [
    '```json\n{}\n```',
    { ...gadgetJson(), rarity: 'unlimited' },
    { ...gadgetJson(), kind: 'iframe' },
    { ...gadgetJson(), name: 'x'.repeat(25) },
    { ...gadgetJson(), name: '任意门' },
    { ...gadgetJson(), stories: ['only-one'] },
    { ...gadgetJson(), unknown: 'extra' },
  ];
  for (const value of variants) {
    const providers = createProviders({ env: llmEnv, fetchImpl: async () => modelReply(value) });
    await assert.rejects(providers.generateGadget('一件小烦恼'), { code: 'INVALID_PROVIDER_RESPONSE' });
  }
});

test('AI cannot re-roll the predetermined outcome level', async () => {
  let payload;
  const valid = { kind: 'chaos', title: '小道具闹乌龙了', text: '小猫按到旋钮，整间办公室开始用猫语唱歌。' };
  const providers = createProviders({ env: llmEnv, fetchImpl: async (_url, options) => { payload = JSON.parse(options.body); return modelReply(valid); } });
  assert.deepEqual(await providers.generateOutcome(GADGETS[0], '开会紧张', 90, 'chaos', { title: '小猫路过', effect: '猫语模式', text: '按到旋钮' }), valid);
  assert.equal(JSON.parse(payload.messages[1].content).event.effect, '猫语模式');
  const bad = createProviders({ env: llmEnv, fetchImpl: async () => modelReply({ ...valid, kind: 'surprise' }) });
  await assert.rejects(bad.generateOutcome(GADGETS[0], '开会紧张', 90, 'chaos'), { code: 'INVALID_PROVIDER_RESPONSE' });
});

test('AI fusion returns a separately identified original gadget', async () => {
  const providers = createProviders({ env: llmEnv, fetchImpl: async () => modelReply(gadgetJson()) });
  const result = await providers.fuseGadgets(GADGETS[0], GADGETS[1]);
  assert.match(result.id, /^fusion-/);
  assert.equal(result.stories.length, 4);
});

test('provider response size and upstream failures are bounded and sanitized', async () => {
  const huge = createProviders({ env: llmEnv, fetchImpl: async () => reply({ data: 'x'.repeat(300_000) }) });
  await assert.rejects(huge.generateGadget('休息一下'), { code: 'INVALID_PROVIDER_RESPONSE' });
  const failure = createProviders({ env: llmEnv, fetchImpl: async () => { throw new Error('network error contains test-llm-key'); } });
  await assert.rejects(failure.generateGadget('休息一下'), (error) => error.statusCode === 502 && !error.message.includes('test-llm-key'));
});

test('illustration API accepts HTTPS image URLs and refuses base64 or unsafe URLs', async () => {
  const env = { IMAGE_API_URL: 'https://images.example.test/generations', IMAGE_API_KEY: 'test-image-key', IMAGE_MODEL: 'test-url-image-model' };
  assert.equal(createProviders({ env: { ...env, IMAGE_MODEL: '' } }).capabilities.aiImage, false);
  const valid = createProviders({ env, fetchImpl: async () => reply({ data: [{ url: 'https://cdn.example.test/pocket.png' }] }) });
  assert.deepEqual(await valid.generateIllustration(GADGETS[0]), { url: 'https://cdn.example.test/pocket.png' });
  for (const raw of [{ data: [{ b64_json: 'aGVsbG8=' }] }, { data: [{ url: 'http://cdn.example.test/image.png' }] }, { data: [{ url: 'data:image/png;base64,aGVsbG8=' }] }]) {
    const providers = createProviders({ env, fetchImpl: async () => reply(raw) });
    await assert.rejects(providers.generateIllustration(GADGETS[0]), { statusCode: 502 });
  }
});

test('checkout payload uses server amounts, secure return URL and HTTPS checkout', async () => {
  let body;
  const providers = createProviders({ env: paymentEnv, fetchImpl: async (_url, options) => { body = JSON.parse(options.body); assert.equal(options.headers['idempotency-key'], 'test-order'); return reply({ checkoutUrl: 'https://payments.example.test/pay/test-order' }); } });
  assert.deepEqual(await providers.createCheckout({ id: 'test-order', amountCents: 990, currency: 'CNY', description: '口袋月卡' }), { checkoutUrl: 'https://payments.example.test/pay/test-order' });
  assert.deepEqual(body, { orderId: 'test-order', amountCents: 990, currency: 'CNY', description: '口袋月卡', returnUrl: 'https://pocket.example.test/?order=test-order' });
  assert.equal(JSON.stringify(body).includes(paymentEnv.PAY_GATEWAY_TOKEN), false);
});

test('payment signatures reject altered bodies, invalid signatures and expired/future events', () => {
  const providers = createProviders({ env: paymentEnv, now: () => timestamp });
  const event = { eventId: 'evt-1', orderId: 'order-1', status: 'paid', amountCents: 990, currency: 'CNY' };
  const valid = signed(event);
  assert.deepEqual(providers.verifyPayment(valid.raw, valid.headers), event);
  assert.throws(() => providers.verifyPayment(Buffer.from(JSON.stringify({ ...event, amountCents: 1 })), valid.headers), { statusCode: 401 });
  assert.throws(() => providers.verifyPayment(valid.raw, { ...valid.headers, 'x-pocket-signature': '0'.repeat(64) }), { statusCode: 401 });
  for (const offset of [-301, 301]) { const request = signed(event, offset); assert.throws(() => providers.verifyPayment(request.raw, request.headers), { statusCode: 401 }); }
  for (const payload of [{ ...event, currency: 'USD' }, { ...event, amountCents: 9.9 }, { ...event, status: 'pending' }, { ...event, accountSecret: 'extra' }]) {
    const request = signed(payload);
    assert.throws(() => providers.verifyPayment(request.raw, request.headers), { statusCode: 400 });
  }
});

test('fulfillment sends address only to the configured supplier after payment', async () => {
  let body;
  let calls = 0;
  const providers = createProviders({ env: { FULFILLMENT_URL: 'https://supplier.example.test/orders', FULFILLMENT_TOKEN: 'test-supplier-token' }, fetchImpl: async (_url, options) => { calls += 1; body = JSON.parse(options.body); assert.equal(options.headers['idempotency-key'], 'order-1'); return reply({ id: 'supplier-1', status: 'accepted', auth: 'never-forward' }); } });
  const order = { id: 'order-1', type: 'merchandise', status: 'pending', productId: 'keychain', quantity: 1, gadget: GADGETS[0], shipping: { name: '测试旅人', phone: '13800138000', address: '测试地址' } };
  await assert.rejects(providers.submitFulfillment(order), { statusCode: 409 });
  assert.equal(calls, 0);
  assert.deepEqual(await providers.submitFulfillment({ ...order, status: 'paid' }), { id: 'supplier-1', status: 'accepted' });
  assert.deepEqual(body.shipping, order.shipping);
  assert.equal(JSON.stringify(body).includes('test-supplier-token'), false);
});

test('fulfillment query cannot attach another supplier shipment to the order', async () => {
  const providers = createProviders({ env: { FULFILLMENT_URL: 'https://supplier.example.test/orders', FULFILLMENT_TOKEN: 'test-token' }, fetchImpl: async () => reply({ id: 'other-shipment', status: 'shipped', trackingNumber: 'PRIVATE' }) });
  await assert.rejects(providers.queryFulfillment({ id: 'order-1', status: 'paid', fulfillment: { id: 'own-shipment' } }), { statusCode: 502 });
});
