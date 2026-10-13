import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createStore } from '../server/store.js';
import { createProviders } from '../server/providers.js';
import { createCommerce } from '../server/commerce.js';
import { GADGETS, createState, useGadget } from '../src/lib/game.js';

const DAY = 86_400_000;
const start = Date.parse('2026-02-14T04:00:00Z');
const payEnv = { PAY_GATEWAY_URL: 'https://pay.example.test/create', PAY_GATEWAY_TOKEN: 'test-token', PAY_WEBHOOK_SECRET: 'test-secret', PUBLIC_SITE_URL: 'https://pocket.example.test/' };
const address = { name: '测试旅人', phone: '13800138000', province: '测试省', city: '测试市', district: '测试区', address: '仅供测试的地址 1 号', postalCode: '100000' };

function setup(t, options = {}) {
  const store = createStore();
  t.after(() => store.close());
  const clock = { time: options.time ?? start };
  const user = store.createUser({ phone: '13800138000', now: clock.time });
  const state = createState(clock.time);
  state.collected = [GADGETS[0].id, GADGETS[1].id];
  store.saveState(user.id, state);
  const base = createProviders({ env: payEnv, now: () => clock.time });
  const counts = { checkout: 0, fulfillment: 0, tracking: 0 };
  const providers = {
    ...base, capabilities: { ...base.capabilities, fulfillment: true },
    async createCheckout(order) { counts.checkout += 1; return { checkoutUrl: `https://pay.example.test/${order.id}` }; },
    async submitFulfillment(order) { counts.fulfillment += 1; assert.equal(order.status, 'paid'); return { id: `shipment-${order.id}`, status: 'accepted' }; },
    async queryFulfillment(order) { counts.tracking += 1; return { id: order.fulfillment.id, status: 'shipped', trackingNumber: 'TEST123', carrier: '测试物流' }; },
    ...options.providers,
  };
  const commerce = createCommerce({ store, providers, now: () => clock.time, config: options.config });
  const signed = (order, status = 'paid', eventId = `evt-${order.id}-${status}`, changes = {}) => {
    const event = { eventId, orderId: order.id, status, amountCents: order.amountCents, currency: order.currency, ...changes };
    const raw = Buffer.from(JSON.stringify(event));
    const timestamp = String(Math.floor(clock.time / 1000));
    const signature = createHmac('sha256', payEnv.PAY_WEBHOOK_SECRET).update(`${timestamp}.`).update(raw).digest('hex');
    return { raw, headers: { 'x-pocket-timestamp': timestamp, 'x-pocket-signature': signature } };
  };
  const pay = async (order, status, eventId, changes) => { const request = signed(order, status, eventId, changes); return commerce.handlePayment(request.raw, request.headers); };
  return { store, clock, user, providers, commerce, counts, signed, pay };
}

test('checkout fails closed when payment or supplier configuration is absent', async (t) => {
  const { store, user, providers, commerce, counts } = setup(t);
  providers.capabilities.payments = false;
  await assert.rejects(commerce.createOrder(user, { productId: 'membership' }), { status: 503 });
  providers.capabilities.payments = true;
  providers.capabilities.fulfillment = false;
  await assert.rejects(commerce.createOrder(user, { productId: 'keychain', gadgetId: GADGETS[0].id, shipping: address }), { status: 503 });
  assert.equal(store.listOrders(user.id).length, 0);
  assert.equal(counts.checkout, 0);
  assert.equal(store.getUser(user.id).memberUntil, 0);
});

test('server prices cannot be overridden and merchandise quantities are bounded', async (t) => {
  const { user, commerce, counts } = setup(t);
  for (const payload of [{ productId: 'membership', amountCents: 1 }, { productId: 'membership', status: 'paid' }, { productId: 'membership', quantity: 2 }, { productId: 'keychain', quantity: -1 }, { productId: 'keychain', quantity: 11 }]) {
    await assert.rejects(commerce.createOrder(user, payload), { status: 400 });
  }
  const result = await commerce.createOrder(user, { productId: 'membership' });
  assert.equal(result.order.amountCents, 990);
  assert.equal(result.order.currency, 'CNY');
  assert.equal(result.order.status, 'pending');
  assert.equal(counts.checkout, 1);
});

test('order creation never grants membership; verified payment activates 30 days and discount', async (t) => {
  const { store, clock, user, commerce, pay } = setup(t);
  const { order } = await commerce.createOrder(user, { productId: 'membership' });
  assert.equal(store.getUser(user.id).memberUntil, 0);
  assert.equal(commerce.getOrder(user, order.id).order.status, 'pending');
  await pay(order);
  assert.equal(store.getUser(user.id).memberUntil, clock.time + 30 * DAY);
  // Passing a stale user object cannot hide or invent the authoritative benefit.
  const physical = await commerce.createOrder(user, { productId: 'keychain', gadgetId: GADGETS[0].id, quantity: 2, shipping: address });
  assert.equal(physical.order.originalAmountCents, 3980);
  assert.equal(physical.order.amountCents, 3184);
});

test('foreign orders return 404 and public orders omit full shipping details', async (t) => {
  const { store, user, commerce } = setup(t);
  const stranger = store.createUser({ phone: '13900139000' });
  const { order } = await commerce.createOrder(user, { productId: 'magnet', gadgetId: GADGETS[0].id, shipping: address });
  assert.throws(() => commerce.getOrder(stranger, order.id), { status: 404 });
  await assert.rejects(commerce.refreshFulfillment(stranger, order.id), { status: 404 });
  assert.deepEqual(commerce.listOrders(stranger), { orders: [] });
  const publicJson = JSON.stringify(commerce.getOrder(user, order.id));
  assert.equal(publicJson.includes(address.address), false);
  assert.equal(publicJson.includes(address.phone), false);
  assert.equal(publicJson.includes('test-secret'), false);
});

test('invalid signature and amount mismatch cannot grant entitlements or consume an event ID', async (t) => {
  const { store, user, commerce, signed, pay } = setup(t);
  const { order } = await commerce.createOrder(user, { productId: 'membership' });
  const invalid = signed(order);
  invalid.headers['x-pocket-signature'] = '0'.repeat(64);
  await assert.rejects(commerce.handlePayment(invalid.raw, invalid.headers), { statusCode: 401 });
  await assert.rejects(pay(order, 'paid', 'same-event', { amountCents: 1 }), { status: 409 });
  assert.equal(store.getUser(user.id).memberUntil, 0);
  assert.equal(store.getOrder(order.id).status, 'pending');
  assert.deepEqual(await pay(order, 'paid', 'same-event'), { accepted: true, duplicate: false });
  assert.equal(store.getOrder(order.id).status, 'paid');
});

test('repeated callbacks and new paid event IDs do not duplicate a membership grant', async (t) => {
  const { store, clock, user, commerce, pay, signed } = setup(t);
  const { order } = await commerce.createOrder(user, { productId: 'membership' });
  await pay(order, 'paid', 'once');
  assert.deepEqual(await pay(order, 'paid', 'once'), { accepted: true, duplicate: true });
  await pay(order, 'paid', 'another-paid-notice');
  assert.equal(store.getUser(user.id).memberUntil, clock.time + 30 * DAY);
  const expired = signed(order);
  clock.time += 301_000;
  await assert.rejects(commerce.handlePayment(expired.raw, expired.headers), { statusCode: 401 });
});

test('membership renewals extend time, and refund removes only the refunded grant', async (t) => {
  const { store, clock, user, commerce, pay } = setup(t);
  const first = (await commerce.createOrder(user, { productId: 'membership' })).order;
  await pay(first);
  clock.time += 5 * DAY;
  const second = (await commerce.createOrder(user, { productId: 'membership' })).order;
  await pay(second);
  assert.equal(store.getUser(user.id).memberUntil, start + 60 * DAY);
  await pay(first, 'refunded');
  assert.equal(store.getUser(user.id).memberUntil, start + 35 * DAY);
  await pay(first, 'refunded', 'second-refund');
  assert.equal(store.getUser(user.id).memberUntil, start + 35 * DAY);
  await assert.rejects(pay(first, 'paid', 'paid-after-refund'), { status: 409 });
  assert.equal(store.getUser(user.id).memberUntil, start + 35 * DAY);
});

test('supplier receives an order only after verified payment and duplicate callbacks are harmless', async (t) => {
  const { store, user, commerce, counts, pay } = setup(t);
  const { order } = await commerce.createOrder(user, { productId: 'stand', gadgetId: GADGETS[0].id, shipping: address });
  assert.equal(counts.fulfillment, 0);
  await assert.rejects(commerce.refreshFulfillment(user, order.id), { status: 409 });
  await assert.rejects(pay(order, 'paid', 'bad-amount', { amountCents: 1 }), { status: 409 });
  assert.equal(counts.fulfillment, 0);
  await pay(order);
  await pay(order);
  await pay(order, 'paid', 'another-delivery-notice');
  assert.equal(counts.fulfillment, 1);
  assert.equal(store.getOrder(order.id).fulfillment.status, 'accepted');
  const tracked = await commerce.refreshFulfillment(user, order.id);
  assert.equal(tracked.order.fulfillment.trackingNumber, 'TEST123');
  assert.equal(counts.tracking, 1);
});

test('failed fulfillment is retained as paid and can be retried by the owner', async (t) => {
  const fixture = setup(t);
  const { store, user, providers, commerce, counts, pay } = fixture;
  providers.submitFulfillment = async () => { counts.fulfillment += 1; if (counts.fulfillment === 1) throw new Error('supplier temporarily unavailable'); return { id: 'retry-shipment', status: 'accepted' }; };
  const { order } = await commerce.createOrder(user, { productId: 'keychain', gadgetId: GADGETS[0].id, shipping: address });
  assert.deepEqual(await pay(order), { accepted: true, duplicate: false });
  assert.equal(store.getOrder(order.id).status, 'paid');
  assert.equal(store.getOrder(order.id).fulfillment.status, 'submission_failed');
  assert.equal((await commerce.refreshFulfillment(user, order.id)).order.fulfillment.id, 'retry-shipment');
  assert.equal(counts.fulfillment, 2);
});

test('refund of an already submitted physical order flags supplier cancellation without pretending it happened', async (t) => {
  const { user, commerce, pay } = setup(t);
  const { order } = await commerce.createOrder(user, { productId: 'keychain', gadgetId: GADGETS[0].id, shipping: address });
  await pay(order);
  await pay(order, 'refunded');
  const refunded = commerce.getOrder(user, order.id).order;
  assert.equal(refunded.status, 'refunded');
  assert.equal(refunded.fulfillment.status, 'accepted');
  assert.equal(refunded.fulfillment.cancellationRequired, true);
});

test('paid repair restores only its selected gadget and preserves other latest state', async (t) => {
  const { store, clock, user, commerce, pay } = setup(t, { config: { repairPriceCents: 150 } });
  const state = store.getState(user.id);
  state.durability[GADGETS[0].id] = { current: 0, repairAt: clock.time + DAY, brokenAt: clock.time };
  state.durability[GADGETS[1].id] = { current: 2, repairAt: 0 };
  store.saveState(user.id, state);
  const { order } = await commerce.createOrder(user, { productId: 'repair', gadgetId: GADGETS[0].id });
  assert.equal(order.amountCents, 150);
  assert.equal(store.getState(user.id).durability[GADGETS[0].id].current, 0);
  const latest = store.getState(user.id);
  latest.stats.totalUses = 10;
  store.saveState(user.id, latest);
  await pay(order);
  const repaired = store.getState(user.id);
  assert.deepEqual(repaired.durability[GADGETS[0].id], { current: GADGETS[0].maxDurability, repairAt: 0, repairGrantId: order.id });
  assert.equal(repaired.durability[GADGETS[1].id].current, 2);
  assert.equal(repaired.stats.totalUses, 10);
  await assert.rejects(commerce.createOrder(user, { productId: 'repair', gadgetId: GADGETS[0].id }), { status: 409 });
});

test('festival access is activated only by payment and removed on refund', async (t) => {
  const { store, clock, user, commerce, pay } = setup(t);
  const events = commerce.getConfig().seasonalEvents;
  assert.equal(events.find((event) => event.id === 'valentines-day').active, true);
  await assert.rejects(commerce.createOrder(user, { productId: 'seasonal', eventId: 'children-day' }), { status: 409 });
  const { order } = await commerce.createOrder(user, { productId: 'seasonal', eventId: 'valentines-day' });
  assert.equal(order.amountCents, 600);
  assert.deepEqual(store.getUser(user.id).seasonalUnlocks || [], []);
  await pay(order);
  assert.deepEqual(store.getUser(user.id).seasonalUnlocks, ['valentines-day']);
  await assert.rejects(commerce.createOrder(user, { productId: 'seasonal', eventId: 'valentines-day' }), { status: 409 });
  await pay(order, 'refunded');
  assert.deepEqual(store.getUser(user.id).seasonalUnlocks, []);
  clock.time = Date.parse('2026-10-14T04:00:00Z');
  await assert.rejects(commerce.createOrder(user, { productId: 'seasonal', eventId: 'valentines-day' }), { status: 409 });
});

test('checkout gateway failure records a failed order and never invents access', async (t) => {
  const { store, user, commerce } = setup(t, { providers: { async createCheckout() { throw Object.assign(new Error('unavailable'), { statusCode: 502 }); } } });
  await assert.rejects(commerce.createOrder(user, { productId: 'membership' }), { statusCode: 502 });
  assert.equal(store.listOrders(user.id)[0].status, 'failed');
  assert.equal(store.getUser(user.id).memberUntil, 0);
});

test('a late failed notice never downgrades a verified paid order', async (t) => {
  const { store, user, commerce, pay } = setup(t);
  const { order } = await commerce.createOrder(user, { productId: 'membership' });
  await pay(order);
  await pay(order, 'failed');
  assert.equal(store.getOrder(order.id).status, 'paid');
  assert.ok(store.getUser(user.id).memberUntil > start);
});

test('concurrent paid notices submit fulfillment once', async (t) => {
  let complete;
  const barrier = new Promise((resolve) => { complete = resolve; });
  const fixture = setup(t);
  fixture.providers.submitFulfillment = async () => { fixture.counts.fulfillment += 1; await barrier; return { id: 'concurrent-shipment', status: 'accepted' }; };
  const { order } = await fixture.commerce.createOrder(fixture.user, { productId: 'keychain', gadgetId: GADGETS[0].id, shipping: address });
  const first = fixture.pay(order, 'paid', 'event-first');
  const second = fixture.pay(order, 'paid', 'event-second');
  complete();
  await Promise.all([first, second]);
  assert.equal(fixture.counts.fulfillment, 1);
});

test('entitlement ledger includes grants beyond the public 100-order list', async (t) => {
  const { store, user, commerce, pay } = setup(t);
  for (let index = 0; index < 110; index += 1) store.putOrder({ id: `history-${index}`, userId: user.id, type: 'membership', status: 'paid', paidAt: start, createdAt: start + index, durationDays: 30, amountCents: 990, currency: 'CNY' });
  const { order } = await commerce.createOrder(user, { productId: 'membership' });
  await pay(order);
  assert.equal(store.getUser(user.id).memberUntil, start + 111 * 30 * DAY);
  assert.equal(commerce.listOrders(user).orders.length, 100);
});

test('an out-of-order full refund is terminal and late payment cannot activate or ship', async (t) => {
  const { store, user, commerce, counts, pay } = setup(t);
  const { order } = await commerce.createOrder(user, { productId: 'keychain', gadgetId: GADGETS[0].id, shipping: address });
  assert.deepEqual(await pay(order, 'refunded'), { accepted: true, duplicate: false });
  assert.equal(store.getOrder(order.id).status, 'refunded');
  await assert.rejects(pay(order, 'paid'), { status: 409 });
  assert.equal(counts.fulfillment, 0);
  const membership = (await commerce.createOrder(user, { productId: 'membership' })).order;
  await pay(membership, 'refunded');
  await assert.rejects(pay(membership, 'paid'), { status: 409 });
  assert.equal(store.getUser(user.id).memberUntil, 0);
});

test('refunding an unused repair restores the previous durability and its original timer', async (t) => {
  const { store, clock, user, commerce, pay } = setup(t);
  const previous = { current: 0, repairAt: clock.time + DAY, brokenAt: clock.time };
  const state = store.getState(user.id);
  state.durability[GADGETS[0].id] = previous;
  store.saveState(user.id, state);
  const { order } = await commerce.createOrder(user, { productId: 'repair', gadgetId: GADGETS[0].id });
  await pay(order);
  await pay(order, 'refunded');
  assert.deepEqual(store.getState(user.id).durability[GADGETS[0].id], previous);
  assert.equal(commerce.getOrder(user, order.id).order.repairReversal, 'restored');
});

test('refund does not overwrite gadget use after a paid repair', async (t) => {
  const { store, clock, user, commerce, pay } = setup(t);
  const state = store.getState(user.id);
  state.durability[GADGETS[0].id] = { current: 0, repairAt: clock.time + DAY, brokenAt: clock.time };
  store.saveState(user.id, state);
  const { order } = await commerce.createOrder(user, { productId: 'repair', gadgetId: GADGETS[0].id });
  await pay(order);
  const used = store.getState(user.id);
  useGadget(used, GADGETS[0], 50, clock.time);
  store.saveState(user.id, used);
  await pay(order, 'refunded');
  assert.equal(store.getState(user.id).durability[GADGETS[0].id].current, GADGETS[0].maxDurability - 1);
  assert.equal(commerce.getOrder(user, order.id).order.repairReversal, 'consumed_or_replaced');
});

test('refunding later repair does not resurrect an earlier refunded repair grant', async (t) => {
  const { store, clock, user, commerce, pay } = setup(t);
  const previous = { current: 0, repairAt: clock.time + DAY, brokenAt: clock.time };
  const state = store.getState(user.id);
  state.durability[GADGETS[0].id] = previous;
  store.saveState(user.id, state);
  const first = (await commerce.createOrder(user, { productId: 'repair', gadgetId: GADGETS[0].id })).order;
  const second = (await commerce.createOrder(user, { productId: 'repair', gadgetId: GADGETS[0].id })).order;
  await pay(first);
  await pay(second);
  await pay(first, 'refunded');
  assert.equal(store.getState(user.id).durability[GADGETS[0].id].repairGrantId, second.id);
  await pay(second, 'refunded');
  assert.deepEqual(store.getState(user.id).durability[GADGETS[0].id], previous);
});

test('refund cancellation warning survives an uncertain supplier failure', async (t) => {
  let failSubmission;
  const barrier = new Promise((_resolve, reject) => { failSubmission = reject; });
  const { store, user, providers, commerce, pay } = setup(t);
  providers.submitFulfillment = async () => barrier;
  const { order } = await commerce.createOrder(user, { productId: 'keychain', gadgetId: GADGETS[0].id, shipping: address });
  const paid = pay(order);
  await pay(order, 'refunded');
  assert.equal(store.getOrder(order.id).fulfillment.cancellationRequired, true);
  failSubmission(new Error('supplier may have accepted before connection failed'));
  await paid;
  const refunded = commerce.getOrder(user, order.id).order;
  assert.equal(refunded.status, 'refunded');
  assert.equal(refunded.fulfillment.status, 'submission_failed');
  assert.equal(refunded.fulfillment.cancellationRequired, true);
});

test('consenting verified first payment records one aggregate China-day conversion', async (t) => {
  const { store, clock, user, commerce, pay } = setup(t, { time: Date.parse('2026-02-14T16:05:00Z') });
  const state = store.getState(user.id);
  state.settings.analyticsConsent = true;
  store.saveState(user.id, state);
  const { order } = await commerce.createOrder(user, { productId: 'membership' });
  assert.equal(store.db.prepare('SELECT COUNT(*) AS total FROM telemetry').get().total, 0);
  await pay(order, 'paid', 'consented-payment');
  await pay(order, 'paid', 'consented-payment');
  await pay(order, 'paid', 'second-notice-same-payment');
  await pay(order, 'failed');
  await pay(order, 'refunded');
  await assert.rejects(pay(order, 'paid', 'late-payment-after-refund'), { status: 409 });
  const rows = store.db.prepare('SELECT day,event,count FROM telemetry').all();
  assert.deepEqual(rows.map((row) => ({ ...row })), [{ day: '2026-02-15', event: 'payment_confirmed', count: 1 }]);
  assert.equal(clock.time, Date.parse('2026-02-14T16:05:00Z'));
});

test('payment analytics ignores absent consent, invalid signatures and mismatched amounts', async (t) => {
  const { store, user, commerce, pay, signed } = setup(t);
  const withoutConsent = (await commerce.createOrder(user, { productId: 'membership' })).order;
  await pay(withoutConsent);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS total FROM telemetry').get().total, 0);
  const state = store.getState(user.id);
  state.settings.analyticsConsent = true;
  store.saveState(user.id, state);
  const { order } = await commerce.createOrder(user, { productId: 'membership' });
  const forged = signed(order);
  forged.headers['x-pocket-signature'] = '0'.repeat(64);
  await assert.rejects(commerce.handlePayment(forged.raw, forged.headers), { statusCode: 401 });
  await assert.rejects(pay(order, 'paid', 'wrong-amount', { amountCents: 1 }), { status: 409 });
  await pay(order, 'failed');
  await pay(order, 'refunded');
  await assert.rejects(pay(order, 'paid', 'late-notification'), { status: 409 });
  assert.equal(store.db.prepare('SELECT COUNT(*) AS total FROM telemetry').get().total, 0);
});
