import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../server/store.js';
import { createAuth } from '../server/auth.js';

test('international E164 login uses the actual configured SMS adapter and canonical identity', async () => {
  const store = createStore();
  let delivered;
  try {
    const auth = createAuth({ store, providers: { capabilities: { phoneLogin: true }, sendSms: async (phone, code) => { delivered = { phone, code }; } } });
    const request = { headers: { 'user-agent': 'test-client' }, socket: { remoteAddress: '127.0.0.1' } };
    await auth.requestPhone(request, { phone: '+12025550123' });
    assert.equal(delivered.phone, '+12025550123');
    const session = auth.verifyPhone({ phone: delivered.phone, code: delivered.code });
    assert.equal(session.user.phone, '+12025550123');
    await assert.rejects(auth.requestPhone(request, { phone: '+86000000000' }), { code: 'INVALID_PHONE' });
    await assert.rejects(auth.requestPhone(request, { phone: '+1' }), { code: 'INVALID_PHONE' });
  } finally { store.close(); }
});
