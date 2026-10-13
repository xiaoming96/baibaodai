import test from 'node:test';
import assert from 'node:assert/strict';
import { compactGuestState } from '../src/lib/guestTransfer.js';

test('guest transfer excludes privilege, sessions, custom tools and unowned favorites', () => {
  const source = { collected: ['courage-badge', 'invented-paid'], favorites: ['courage-badge', 'pause-clock'], customGadgets: [{ id: 'invented-paid' }], token: 'secret', memberUntil: 9999999999999, entitlements: ['children-day'], usage: { help: 0 }, settings: { analyticsConsent: true, sound: 'true' } };
  const data = compactGuestState(source);
  assert.deepEqual(data.collected, ['courage-badge']);
  assert.deepEqual(data.favorites, ['courage-badge']);
  assert.equal(data.settings.analyticsConsent, true);
  assert.equal(data.settings.sound, false);
  assert.equal(JSON.stringify(data).includes('secret'), false);
  assert.equal('memberUntil' in data, false);
  assert.equal('usage' in data, false);
  assert.equal(source.collected.length, 2);
});

test('Unicode and escaping are included in the UTF-8 transfer budget', () => {
  const history = Array.from({ length: 30 }, (_, index) => ({ gadgetId: 'courage-badge', kind: 'normal', title: '勇'.repeat(100), text: '奇'.repeat(3000), worry: '你'.repeat(100), strength: 400, createdAt: index }));
  const data = compactGuestState({ collected: ['courage-badge'], history });
  assert.ok(new TextEncoder().encode(JSON.stringify(data)).length <= 56000);
  assert.ok(data.history.length < 30 && data.history.length > 0);
  assert.equal(data.history.at(-1).createdAt, 29);
  assert.equal(data.history.at(-1).text.length, 1000);
  assert.equal(data.history.at(-1).strength, 100);
  assert.equal(history[0].text.length, 3000);
});
