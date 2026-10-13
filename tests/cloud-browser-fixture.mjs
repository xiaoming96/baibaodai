/** TEST ONLY: real application/SQLite with an injected SMS delivery sink. Never run in production. */
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';

const port = Number(process.env.POCKET_FIXTURE_PORT || 3002);
const origin = process.env.POCKET_FIXTURE_ORIGIN || 'http://127.0.0.1:5181';
// One shared instant, different calendar days in server Shanghai vs browser UTC.
const testNow = Date.parse('2026-10-13T16:30:00Z');
const directory = mkdtempSync(join(tmpdir(), 'pocket-browser-fixture-'));
const dbPath = join(directory, 'test.sqlite');
const setupStore = createStore(dbPath);
const owner = setupStore.createUser({ phone: '+8613900000001', nickname: '浏览器测试收藏家' });
const admin = setupStore.createUser({ phone: '+8613800000001', nickname: '浏览器测试管理员' });
const orderId = 'browser-test-owner-order';
setupStore.putOrder({ id: orderId, userId: owner.id, productId: 'membership', type: 'membership', name: '浏览器测试月卡订单', amountCents: 990, originalAmountCents: 990, currency: 'CNY', quantity: 1, status: 'awaiting_payment', createdAt: Date.now() });
setupStore.close();

const codes = new Map();
const providers = {
  capabilities: { phoneLogin: true, wechatLogin: false, aiText: false, aiImage: false, payments: false, fulfillment: false },
  async sendSms(phone, code) { codes.set(phone, code); return { delivered: true }; },
};
const app = createApp({ dbPath, providers, now: () => testNow, rng: () => 0.5, config: { appOrigins: [origin], adminUserIds: [admin.id], publicAppUrl: origin, authSecret: 'browser-fixture-only-no-production-credentials' } });
await app.controllersReady;
const send = (res, data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/__test/code' && req.method === 'GET') {
    const phone = url.searchParams.get('phone');
    return send(res, { code: codes.get(phone) || null });
  }
  if (url.pathname === '/__test/info' && req.method === 'GET') return send(res, { ownerId: owner.id, adminId: admin.id, orderId });
  if (url.pathname === '/__test/state' && req.method === 'GET') {
    const user = app.store.findUser('phone', url.searchParams.get('phone'));
    return send(res, user ? { user, state: app.store.getState(user.id) } : { user: null, state: null });
  }
  return app.handler(req, res);
});
await new Promise((done) => server.listen(port, '127.0.0.1', done));
console.log(`Test-only browser fixture ready at http://127.0.0.1:${port}`);
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await new Promise((done) => server.close(done));
  await app.close();
  rmSync(directory, { recursive: true, force: true });
  process.exit(0);
}
process.on('SIGTERM', close);
process.on('SIGINT', close);
