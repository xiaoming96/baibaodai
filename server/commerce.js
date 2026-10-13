import { randomUUID } from 'node:crypto';
import { GADGETS, SEASONAL_GADGETS, createState, getDurability, listSeasonalEvents } from '../src/lib/game.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MEMBERSHIP_DAYS = 30;

export const PRODUCT_CATALOG = Object.freeze([
  { id: 'keychain', name: '专属道具钥匙扣', type: 'merchandise', amountCents: 1990, description: '把收藏的小道具带在身边。' },
  { id: 'magnet', name: '专属道具冰箱贴', type: 'merchandise', amountCents: 1490, description: '为日常留一点童年式的小魔法。' },
  { id: 'postcards', name: '道具明信片套装', type: 'merchandise', amountCents: 2990, description: '把专属道具的故事寄给朋友。' },
  { id: 'stand', name: '道具桌面立牌', type: 'merchandise', amountCents: 2490, description: '在桌边放一个认真听你说话的小道具。' },
  { id: 'membership', name: '口袋月卡', type: 'membership', amountCents: 990, durationDays: MEMBERSHIP_DAYS, description: '30天会员权益，续费自动延长。' },
  { id: 'repair', name: '道具快速修理', type: 'repair', amountCents: 100, priceIsConfigurable: true, description: '立即恢复一件已收藏道具的耐久度。修理价格由运营配置。' },
  { id: 'seasonal', name: '节日限定道具池', type: 'seasonal', amountCents: 600, description: '解锁指定活动的原创限定道具。' },
].map(Object.freeze));

export class CommerceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'CommerceError';
    this.status = status;
    this.statusCode = status;
    this.code = code;
  }
}

function fail(status, code, message) { throw new CommerceError(status, code, message); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value, max, min = 1) { return typeof value === 'string' && value.trim().length >= min && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value); }
function ownedUser(store, user) {
  const current = user?.id ? store.getUser(user.id) : null;
  if (!current) fail(401, 'AUTH_REQUIRED', '请先登录，再使用购买服务。');
  return current;
}

function shippingAddress(raw) {
  const fields = { name: 60, phone: 15, province: 40, city: 40, district: 60, address: 200, postalCode: 10 };
  if (!object(raw) || Object.keys(raw).some((key) => !Object.hasOwn(fields, key))) fail(400, 'INVALID_SHIPPING', '请填写完整的收货信息。');
  for (const key of ['name', 'phone', 'province', 'city', 'district', 'address']) {
    if (!text(raw[key], fields[key])) fail(400, 'INVALID_SHIPPING', '请填写完整的收货信息。');
  }
  if (!/^1[3-9]\d{9}$/.test(raw.phone) || (raw.postalCode && !/^\d{6}$/.test(raw.postalCode))) fail(400, 'INVALID_SHIPPING', '请检查收货手机号和邮政编码。');
  return Object.fromEntries(Object.keys(fields).filter((key) => raw[key]).map((key) => [key, raw[key].trim()]));
}

function publicOrder(order) {
  const result = {
    id: order.id, productId: order.productId, type: order.type, name: order.name,
    amountCents: order.amountCents, originalAmountCents: order.originalAmountCents,
    currency: order.currency, quantity: order.quantity, status: order.status,
    createdAt: order.createdAt, updatedAt: order.updatedAt,
  };
  for (const key of ['checkoutUrl', 'paidAt', 'refundedAt', 'durationDays', 'eventId', 'failureCode', 'repairReversal']) if (order[key] !== undefined) result[key] = order[key];
  if (order.gadget) result.gadget = { id: order.gadget.id, name: order.gadget.name, kind: order.gadget.kind, color: order.gadget.color };
  if (order.fulfillment) {
    const { status, id, trackingNumber, carrier, cancellationRequired } = order.fulfillment;
    result.fulfillment = { status, ...(id ? { id } : {}), ...(trackingNumber ? { trackingNumber } : {}), ...(carrier ? { carrier } : {}), ...(cancellationRequired ? { cancellationRequired: true } : {}) };
  }
  if (order.shipping) result.shippingSummary = {
    name: `${order.shipping.name.slice(0, 1)}**`,
    phone: `${order.shipping.phone.slice(0, 3)}****${order.shipping.phone.slice(-4)}`,
    region: `${order.shipping.province} ${order.shipping.city} ${order.shipping.district}`,
  };
  return result;
}

/**
 * Monetary totals and entitlements always come from this controller and SQLite.
 * The injected store supplies synchronous transactions and flexible order JSON.
 * createCheckout does not grant anything; only a verified, amount-matched webhook
 * can activate membership, festival access, repair, or physical fulfillment.
 */
export function createCommerce({ store, providers, now = Date.now, config: options = {} }) {
  const repairPrice = Number(options.repairPriceCents ?? options.env?.REPAIR_PRICE_CENTS ?? 100);
  if (!Number.isSafeInteger(repairPrice) || repairPrice < 1 || repairPrice > 100_000) throw new TypeError('REPAIR_PRICE_CENTS must be an integer from 1 to 100000.');
  const products = PRODUCT_CATALOG.map((product) => ({ ...product, ...(product.id === 'repair' ? { amountCents: repairPrice } : {}) }));
  const submissions = new Map();

  function config() {
    return {
      currency: 'CNY', products: products.map((product) => ({ ...product })),
      paymentsConfigured: Boolean(providers.capabilities?.payments),
      fulfillmentConfigured: Boolean(providers.capabilities?.fulfillment),
      membership: { durationDays: MEMBERSHIP_DAYS },
      repair: { amountCents: repairPrice, priceIsConfigurable: true },
      seasonalEvents: listSeasonalEvents(now()),
    };
  }

  function findGadget(userId, gadgetId) {
    const state = store.getState(userId) || createState(now());
    const gadget = [...GADGETS, ...SEASONAL_GADGETS, ...(state.customGadgets || [])].find((item) => item.id === gadgetId);
    if (!gadget || !state.collected?.includes(gadgetId)) fail(400, 'GADGET_NOT_COLLECTED', '请先收藏这件道具。');
    return { state, gadget };
  }

  function orderForUser(user, id) {
    const current = ownedUser(store, user);
    const order = typeof id === 'string' && id.length <= 100 ? store.getOrder(id) : null;
    if (!order || order.userId !== current.id) fail(404, 'ORDER_NOT_FOUND', '找不到这笔订单。');
    return order;
  }

  function allOrders(userId) { return store.listOrders(userId, { limit: null }); }

  function recalculateEntitlements(userId) {
    const orders = allOrders(userId);
    const memberships = orders.filter((order) => order.type === 'membership' && order.status === 'paid')
      .sort((a, b) => a.paidAt - b.paidAt || a.id.localeCompare(b.id));
    let membershipUntil = 0;
    for (const order of memberships) membershipUntil = Math.max(membershipUntil, order.paidAt) + (order.durationDays || MEMBERSHIP_DAYS) * DAY_MS;
    const seasonalUnlocks = [...new Set(orders.filter((order) => order.type === 'seasonal' && order.status === 'paid').map((order) => order.eventId))];
    store.updateUser(userId, { membershipUntil, seasonalUnlocks });
  }

  function reverseUnusedRepair(order) {
    const state = store.getState(order.userId);
    const record = state?.durability?.[order.gadget.id];
    if (order.paidAt === undefined) return 'not_applied';
    // Normal use and free repair replace this record, consuming/superseding
    // the grant. Never overwrite those later actions to reverse a refund.
    if (record?.repairGrantId !== order.id) return 'consumed_or_replaced';
    let previous = order.repairBefore ?? null;
    const seen = new Set([order.id]);
    while (previous?.repairGrantId && !seen.has(previous.repairGrantId)) {
      seen.add(previous.repairGrantId);
      const earlier = store.getOrder(previous.repairGrantId);
      if (!earlier || earlier.status !== 'refunded') break;
      previous = earlier.repairBefore ?? null;
    }
    if (previous) state.durability[order.gadget.id] = structuredClone(previous);
    else delete state.durability[order.gadget.id];
    store.saveState(order.userId, state);
    return 'restored';
  }

  async function createOrder(user, payload) {
    const current = ownedUser(store, user);
    const allowed = ['productId', 'quantity', 'gadgetId', 'shipping', 'eventId'];
    if (!object(payload) || Object.keys(payload).some((key) => !allowed.includes(key))) fail(400, 'INVALID_ORDER', '订单参数无效，价格由服务端计算。');
    const product = products.find((item) => item.id === payload.productId);
    if (!product) fail(400, 'INVALID_PRODUCT', '请选择有效的商品。');
    if (!providers.capabilities?.payments) fail(503, 'PAYMENTS_UNAVAILABLE', '支付服务尚未配置，当前不能购买。');
    if (product.type === 'merchandise' && !providers.capabilities?.fulfillment) fail(503, 'FULFILLMENT_UNAVAILABLE', '周边供应链尚未配置，当前不能下单。');
    const quantity = payload.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10 || (product.type !== 'merchandise' && quantity !== 1)) fail(400, 'INVALID_QUANTITY', '商品数量无效。');
    const timestamp = now();
    const order = {
      id: randomUUID(), userId: current.id, productId: product.id, type: product.type, name: product.name,
      description: product.name, quantity, currency: 'CNY', status: 'pending', createdAt: timestamp, updatedAt: timestamp,
      originalAmountCents: product.amountCents * quantity,
      amountCents: product.amountCents * quantity,
    };
    if (product.type === 'membership') order.durationDays = MEMBERSHIP_DAYS;
    if (product.type === 'seasonal') {
      const event = listSeasonalEvents(timestamp).find((item) => item.id === payload.eventId);
      if (!event || !event.active) fail(409, 'SEASON_NOT_ACTIVE', '这个节日活动还没有开始。');
      if (current.seasonalUnlocks?.includes(event.id)) fail(409, 'SEASON_ALREADY_UNLOCKED', '你已经解锁这个节日活动。');
      order.eventId = event.id;
      order.name = `${event.name}限定道具池`;
      order.description = order.name;
    }
    if (product.type === 'merchandise' || product.type === 'repair') {
      const { state, gadget } = findGadget(current.id, payload.gadgetId);
      order.gadget = { id: gadget.id, no: gadget.no, name: gadget.name, effect: gadget.effect, warning: gadget.warning, kind: gadget.kind, color: gadget.color, maxDurability: gadget.maxDurability };
      order.description = `${product.name} · ${gadget.name}`;
      if (product.type === 'repair') {
        const durability = getDurability(state, gadget, timestamp, current.memberUntil > timestamp ? 'member' : 'registered');
        if (durability.current === durability.max) fail(409, 'REPAIR_NOT_NEEDED', '这件道具状态很好，不需要修理。');
      } else {
        order.shipping = shippingAddress(payload.shipping);
        if ((current.memberUntil || current.membershipUntil || 0) > timestamp) order.amountCents = Math.round(order.originalAmountCents * 0.8);
      }
    }
    // Persist first so a fast provider webhook can always locate the order.
    store.putOrder(order);
    try {
      const checkout = await providers.createCheckout(order);
      if (typeof checkout?.checkoutUrl !== 'string' || !/^https:\/\//.test(checkout.checkoutUrl)) fail(502, 'INVALID_CHECKOUT', '支付服务未能提供安全的付款地址。');
      const updated = store.updateOrder(order.id, { checkoutUrl: checkout.checkoutUrl, updatedAt: now() });
      return { order: publicOrder(updated), checkoutUrl: checkout.checkoutUrl };
    } catch (error) {
      if (store.getOrder(order.id)?.status === 'pending') store.updateOrder(order.id, { status: 'failed', failureCode: 'CHECKOUT_UNAVAILABLE', updatedAt: now() });
      throw error;
    }
  }

  async function submitPaidOrder(orderId) {
    if (submissions.has(orderId)) return submissions.get(orderId);
    const work = (async () => {
      const order = store.getOrder(orderId);
      if (!order || order.status !== 'paid' || order.type !== 'merchandise' || order.fulfillment?.id) return order;
      // A short durable lease plus orderId idempotency at the supplier prevent
      // repeated submissions after concurrent callbacks or process restarts.
      if (order.fulfillment?.status === 'submitting' && now() - order.fulfillment.startedAt < 30_000) return order;
      store.updateOrder(orderId, { fulfillment: { status: 'submitting', startedAt: now() }, updatedAt: now() });
      try {
        const fulfillment = await providers.submitFulfillment(order);
        const latest = store.getOrder(orderId);
        return store.updateOrder(orderId, {
          fulfillment: { ...fulfillment, ...(latest.status === 'refunded' ? { cancellationRequired: true } : {}) }, updatedAt: now(),
        });
      } catch {
        const latest = store.getOrder(orderId);
        return store.updateOrder(orderId, { fulfillment: { status: 'submission_failed', ...(latest.status === 'refunded' || latest.fulfillment?.cancellationRequired ? { cancellationRequired: true } : {}) }, updatedAt: now() });
      }
    })();
    submissions.set(orderId, work);
    try { return await work; } finally { submissions.delete(orderId); }
  }

  async function handlePayment(rawBuffer, headers) {
    const event = providers.verifyPayment(rawBuffer, headers);
    let fulfillmentOrderId = null;
    const result = store.transact(() => {
      const order = store.getOrder(event.orderId);
      if (!order) fail(404, 'ORDER_NOT_FOUND', '付款通知对应的订单不存在。');
      if (event.amountCents !== order.amountCents || event.currency !== order.currency) fail(409, 'PAYMENT_AMOUNT_MISMATCH', '付款金额与订单不一致。');
      if (!store.recordWebhook(event.eventId, event)) return { accepted: true, duplicate: true };
      if (event.status === 'paid') {
        if (order.status === 'refunded') fail(409, 'ORDER_ALREADY_REFUNDED', '订单已退款，不能再次激活权益。');
        if (order.status !== 'paid') {
          const paid = store.updateOrder(order.id, { status: 'paid', paidAt: now(), updatedAt: now() });
          if (order.type === 'membership' || order.type === 'seasonal') recalculateEntitlements(order.userId);
          if (order.type === 'repair') {
            const state = store.getState(order.userId) || createState(now());
            state.durability ||= {};
            store.updateOrder(order.id, { repairBefore: structuredClone(state.durability[order.gadget.id] ?? null) });
            state.durability[order.gadget.id] = { current: order.gadget.maxDurability, repairAt: 0, repairGrantId: order.id };
            store.saveState(order.userId, state);
          }
          // Financial conversion counts originate only from this verified,
          // amount-matched first-paid transition, with the owner's consent.
          if (store.getState(order.userId)?.settings?.analyticsConsent === true) {
            const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(now()));
            store.db.prepare('INSERT INTO telemetry(day,event,count) VALUES(?,?,1) ON CONFLICT(day,event) DO UPDATE SET count=count+1').run(day, 'payment_confirmed');
          }
          if (paid.type === 'merchandise') fulfillmentOrderId = order.id;
        }
      } else if (event.status === 'refunded') {
        // Webhooks are not guaranteed to arrive in chronological order. A
        // verified full refund is terminal even if its paid notice is delayed.
        if (order.status !== 'refunded') {
          const repairReversal = order.type === 'repair' ? reverseUnusedRepair(order) : undefined;
          store.updateOrder(order.id, { status: 'refunded', refundedAt: now(), updatedAt: now(), ...(repairReversal ? { repairReversal } : {}), ...(order.fulfillment ? { fulfillment: { ...order.fulfillment, cancellationRequired: true } } : {}) });
          if (order.type === 'membership' || order.type === 'seasonal') recalculateEntitlements(order.userId);
        }
      } else if (order.status === 'pending') {
        store.updateOrder(order.id, { status: 'failed', updatedAt: now() });
      }
      return { accepted: true, duplicate: false };
    });
    if (fulfillmentOrderId) await submitPaidOrder(fulfillmentOrderId);
    return result;
  }

  async function refreshFulfillment(user, id) {
    let order = orderForUser(user, id);
    if (order.status !== 'paid' || order.type !== 'merchandise') fail(409, 'ORDER_NOT_SHIPPABLE', '这笔订单还不能查询配送。');
    if (!providers.capabilities?.fulfillment) fail(503, 'FULFILLMENT_UNAVAILABLE', '周边配送服务尚未配置。');
    if (!order.fulfillment?.id) order = await submitPaidOrder(order.id);
    else {
      const fulfillment = await providers.queryFulfillment(order);
      const latest = store.getOrder(order.id);
      order = store.updateOrder(order.id, { fulfillment: { ...fulfillment, ...(latest.status === 'refunded' ? { cancellationRequired: true } : {}) }, updatedAt: now() });
    }
    return { order: publicOrder(order) };
  }

  return {
    config, getConfig: config, createOrder, handlePayment, refreshFulfillment,
    listOrders(user) { const current = ownedUser(store, user); return { orders: store.listOrders(current.id).slice(0, 100).map(publicOrder) }; },
    getOrder(user, id) { return { order: publicOrder(orderForUser(user, id)) }; },
  };
}
