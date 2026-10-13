import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../server/store.js';
import { createCommunity } from '../server/community.js';
import { createTelemetry } from '../server/telemetry.js';

test('ideas require ownership, stay private pending, then publish only after admin review', () => {
  const store = createStore();
  try {
    const user = store.createUser({ phone: '+8613800000001' });
    const other = store.createUser({ phone: '+8613800000002' });
    const admin = store.createUser({ phone: '+8613800000003' });
    const api = createCommunity({ store, config: { adminUserIds: [admin.id] } });
    const input = { name: '迟到喷嚏钟', effect: '每次喷嚏都提醒你提前出门。', warning: '有时会把闹钟也叫醒。', parentIds: [] };
    assert.throws(() => api.submit(user, { ...input, parentIds: ['courage-badge', 'pause-clock'] }), { code: 'GADGET_NOT_OWNED' });
    const idea = api.submit(user, input);
    assert.equal(api.listPublic().length, 0);
    assert.equal(api.listMine(other).length, 0);
    assert.throws(() => api.moderate(other, idea.id, { status: 'approved' }), { code: 'FORBIDDEN' });
    api.moderate(admin, idea.id, { status: 'approved' });
    const published = api.listPublic()[0];
    assert.equal(published.name, input.name);
    assert.equal(published.contributorBadge, '口袋创想家');
    assert.equal('userId' in published, false);
    assert.throws(() => api.moderate(admin, idea.id, { status: 'rejected' }), { code: 'ALREADY_REVIEWED' });
  } finally { store.close(); }
});

test('submission daily limit and aggregate telemetry never retain private payloads', () => {
  const store = createStore();
  try {
    const user = store.createUser({ phone: '+8613800000001' });
    const api = createCommunity({ store });
    const input = { name: '小小云朵', effect: '先让脑袋放个假。', warning: '会在窗边打呼噜。' };
    for (let i = 0; i < 3; i++) api.submit(user, input);
    assert.throws(() => api.submit(user, input), { code: 'IDEA_LIMIT' });
    const telemetry = createTelemetry({ store });
    assert.equal(telemetry.record(user, { event: 'visit' }).recorded, false);
    telemetry.record(user, { event: 'visit', consent: true, props: { worry: 'private text', phone: user.phone } });
    assert.equal(telemetry.summary().totals.visit, 1);
    assert.equal(JSON.stringify(telemetry.summary()).includes('private text'), false);
    assert.throws(() => telemetry.record(user, { event: 'made_up', consent: true }), { code: 'INVALID_EVENT' });
    assert.throws(() => telemetry.record(user, { event: 'payment_confirmed', consent: true }), { code: 'SERVER_EVENT_ONLY' });
  } finally { store.close(); }
});
