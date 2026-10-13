import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GADGETS, STORAGE_KEY, REPAIR_MS, MEMBER_REPAIR_MS, MAX_BACKUP_BYTES,
  createState, loadState, ensureDaily, collectGadget, generateOutcome, recordOutcome,
  getUsageLimits, consumeUsage, getDurability, useGadget, repairGadget, registerSuccessfulShare,
  toggleFavorite, exportState, importState, localDay,
  SEASONAL_EVENTS, SEASONAL_GADGETS, listSeasonalEvents, getSeasonalGadgets,
} from '../src/lib/game.js';

const now = new Date(2026, 9, 13, 12).getTime();
const tomorrow = new Date(2026, 9, 14, 12).getTime();
const storageWith = (state) => ({ getItem: () => JSON.stringify(state) });
const rolls = (...values) => {
  let index = 0;
  return () => values[index++] ?? 0.9;
};

test('guest default quotas remain unchanged; registered accounts get 5/2/2 and members unlimited', () => {
  assert.deepEqual(getUsageLimits(), { help: 3, blind: 1, fusion: 1 });
  assert.deepEqual(getUsageLimits('registered'), { help: 5, blind: 2, fusion: 2 });
  assert.deepEqual(getUsageLimits('member'), { help: Infinity, blind: Infinity, fusion: Infinity });
  assert.deepEqual(getUsageLimits('unverified-role'), getUsageLimits());
  for (const role of ['guest', 'registered']) {
    const state = createState(now);
    for (const [type, limit] of Object.entries(getUsageLimits(role))) {
      for (let index = 0; index < limit; index++) assert.equal(consumeUsage(state, type, now, role).ok, true);
      assert.equal(consumeUsage(state, type, now, role).ok, false);
    }
  }
  const state = createState(now);
  for (let count = 0; count < 50; count++) assert.equal(consumeUsage(state, 'help', now, 'member').remaining, Infinity);
  assert.equal(state.usage.help, 50);
  assert.equal(consumeUsage(state, 'invented', now, 'member').ok, false);
});

test('member repairs take 12h, guest repairs 24h; joining while broken speeds remaining recovery', () => {
  const gadget = GADGETS.find((item) => item.maxDurability === 2);
  const guest = createState(now);
  const member = createState(now);
  assert.equal(useGadget(guest, gadget, 100, now).durability.repairAt, now + REPAIR_MS);
  assert.equal(useGadget(member, gadget, 100, now, 'member').durability.repairAt, now + MEMBER_REPAIR_MS);
  assert.equal(getDurability(member, gadget, now + MEMBER_REPAIR_MS - 1, 'member').broken, true);
  assert.equal(getDurability(member, gadget, now + MEMBER_REPAIR_MS, 'member').current, 2);
  assert.equal(getDurability(guest, gadget, now + MEMBER_REPAIR_MS).broken, true);
  assert.equal(getDurability(guest, gadget, now + MEMBER_REPAIR_MS, 'member').current, 2);
  const legacy = createState(now);
  legacy.durability[gadget.id] = { current: 0, repairAt: now + REPAIR_MS };
  assert.equal(getDurability(legacy, gadget, now, 'member').remainingMs, MEMBER_REPAIR_MS);
});

test('brokenAt survives persistence, avoiding double-speed or timer drift across reloads', () => {
  const state = createState(now);
  const gadget = GADGETS.find((item) => item.maxDurability === 2);
  useGadget(state, gadget, 100, now, 'member');
  const reloaded = loadState(storageWith(state), now + 1000);
  assert.equal(reloaded.durability[gadget.id].brokenAt, now);
  assert.equal(getDurability(reloaded, gadget, now + 1000, 'member').remainingMs, MEMBER_REPAIR_MS - 1000);
  assert.equal(getDurability(reloaded, gadget, now + 1000, 'guest').remainingMs, REPAIR_MS - 1000);
});

test('only explicitly confirmed shares earn credits, capped at two per day and carried forward', () => {
  const state = createState(now);
  assert.equal(state.shareRewards.credits, 0);
  // A download or cancelled share has no engine call and therefore no reward.
  assert.equal(registerSuccessfulShare(state, now).credits, 1);
  assert.equal(registerSuccessfulShare(state, now).credits, 2);
  assert.equal(registerSuccessfulShare(state, now).ok, false);
  assert.equal(state.shareRewards.credits, 2);
  ensureDaily(state, tomorrow);
  assert.equal(state.shareRewards.used, 0);
  assert.equal(state.shareRewards.credits, 2);
  assert.equal(registerSuccessfulShare(state, tomorrow).credits, 3);
});

test('repairs spend daily allowance first, then a share credit; intact and rejected repairs spend nothing', () => {
  const state = createState(now);
  const gadget = GADGETS[0];
  registerSuccessfulShare(state, now);
  assert.equal(repairGadget(state, gadget, now).ok, false);
  assert.equal(state.repair.used, 0);
  assert.equal(state.shareRewards.credits, 1);
  useGadget(state, gadget, 50, now);
  assert.equal(repairGadget(state, gadget, now).source, 'daily');
  assert.equal(state.shareRewards.credits, 1);
  useGadget(state, gadget, 50, now);
  assert.equal(repairGadget(state, gadget, now).source, 'share');
  assert.equal(state.shareRewards.credits, 0);
  useGadget(state, gadget, 50, now);
  assert.equal(repairGadget(state, gadget, now).ok, false);
  assert.equal(getDurability(state, gadget, now).current, gadget.maxDurability - 1);
});

test('favorites apply to unlocked tools and migrate with guide and storage preferences', () => {
  const state = createState(now);
  assert.equal(toggleFavorite(state, GADGETS[0]), false);
  collectGadget(state, GADGETS[0]);
  assert.equal(toggleFavorite(state, GADGETS[0].id), true);
  assert.equal(toggleFavorite(state, GADGETS[0]), false);
  toggleFavorite(state, GADGETS[0]);
  state.settings.guideSeen = true;
  state.settings.storageConsent = true;
  const migrated = loadState(storageWith(state), now);
  assert.deepEqual(migrated.favorites, [GADGETS[0].id]);
  assert.equal(migrated.settings.guideSeen, true);
  assert.equal(migrated.settings.storageConsent, true);
  const old = loadState(storageWith({ version: 1, collected: [GADGETS[0].id], settings: { sound: true } }), now);
  assert.deepEqual(old.history, []);
  assert.deepEqual(old.favorites, []);
  assert.equal(old.settings.storageConsent, false);
  assert.equal(old.settings.sound, true);
});

test('history retains every outcome kind, latest 30 in chronological order, and immutable story details', () => {
  const state = createState(now);
  for (let index = 0; index < 35; index++) {
    const outcome = generateOutcome(GADGETS[0], `烦恼${index}`, 50, rolls([0.1, 0.5, 0.85, 0.99][index % 4], 0.1, 0.2, 0.1));
    recordOutcome(state, outcome, now + index);
    outcome.text = 'edited after recording';
    outcome.event.text = 'event edited after recording';
  }
  assert.equal(state.history.length, 30);
  assert.equal(state.history[0].worry, '烦恼5');
  assert.equal(state.history.at(-1).worry, '烦恼34');
  assert.deepEqual(new Set(state.history.map((item) => item.kind)), new Set(['normal', 'oops', 'chaos', 'surprise']));
  assert.ok(state.history.every((item) => item.text !== 'edited after recording' && item.event.text !== 'event edited after recording' && item.chain.worry));
  assert.deepEqual(loadState(storageWith(state), now).history, state.history);
});

test('gameplay backup round-trips progress but excludes authentication and payment objects', () => {
  const state = createState(now);
  collectGadget(state, GADGETS[0]);
  toggleFavorite(state, GADGETS[0]);
  recordOutcome(state, generateOutcome(GADGETS[0], '明天汇报', 10, rolls(0.1, 0.9, 0.9)), now);
  registerSuccessfulShare(state, now);
  state.settings.storageConsent = true;
  state.account = { accessToken: 'must-never-export', phone: 'private-phone' };
  state.payment = { secret: 'must-never-export' };
  const json = exportState(state);
  assert.equal(json.includes('must-never-export'), false);
  assert.equal(json.includes('private-phone'), false);
  const imported = importState(json, now);
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.state.history, state.history);
  assert.deepEqual(imported.state.favorites, state.favorites);
  assert.deepEqual(imported.state.shareRewards, state.shareRewards);
  assert.equal(Object.hasOwn(imported.state, 'account'), false);
});

test('import rejects malformed fields, oversize JSON and prototype keys without changing current progress', () => {
  const state = createState(now);
  collectGadget(state, GADGETS[0]);
  const before = JSON.stringify(state);
  const invalid = [
    'not-json', '{}', JSON.stringify({ ...state, version: 2 }),
    JSON.stringify({ ...state, usage: { ...state.usage, help: -1 } }),
    JSON.stringify({ ...state, usage: { ...state.usage, date: '2026-02-31' } }),
    JSON.stringify({ ...state, settings: { sound: 'yes' } }),
    JSON.stringify({ ...state, favorites: ['not-collected'] }),
    JSON.stringify({ ...state, shareRewards: { ...state.shareRewards, used: 3 } }),
    JSON.stringify({ ...state, history: [{ kind: 'normal', text: 42 }] }),
    JSON.stringify({ ...state, entitlements: ['not-an-event'] }),
    exportState(state).replace('"version": 1', '"version": 1, "__proto__": {"admin": true}'),
    ' '.repeat(MAX_BACKUP_BYTES + 1),
  ];
  for (const json of invalid) assert.equal(importState(json, now).ok, false);
  assert.equal(JSON.stringify(state), before);
  assert.equal({}.admin, undefined);
  const nextDay = importState(exportState(state), tomorrow);
  assert.equal(nextDay.ok, true);
  assert.equal(nextDay.state.usage.date, localDay(tomorrow));
  assert.deepEqual(nextDay.state.collected, state.collected);
});

test('seasonal pools recur across years at configured inclusive boundaries, with no paid entitlement grants', () => {
  const activeAt = (year, month, day) => listSeasonalEvents(new Date(year, month - 1, day, 12).getTime()).filter((event) => event.active).map((event) => event.id);
  assert.ok(activeAt(2026, 5, 28).includes('children-day'));
  assert.ok(activeAt(2030, 6, 1).includes('children-day'));
  assert.ok(activeAt(2030, 6, 3).includes('children-day'));
  assert.ok(!activeAt(2030, 6, 4).includes('children-day'));
  assert.ok(activeAt(2027, 1, 20).includes('spring-festival'));
  assert.ok(activeAt(2027, 2, 28).includes('spring-festival'));
  assert.ok(!activeAt(2027, 3, 1).includes('spring-festival'));
  assert.ok(activeAt(2032, 2, 14).includes('valentines-day'));
  assert.ok(!activeAt(2032, 2, 17).includes('valentines-day'));
  assert.equal(SEASONAL_GADGETS.length, 9);
  assert.equal(new Set(SEASONAL_GADGETS.map((gadget) => gadget.id)).size, 9);
  for (const event of SEASONAL_EVENTS) {
    assert.equal(event.priceCents, 600);
    assert.equal(getSeasonalGadgets(event.id).length, 3);
    assert.ok(getSeasonalGadgets(event.id).every((gadget) => gadget.eventId === event.id && gadget.stories.length === 4));
  }
  assert.deepEqual(getSeasonalGadgets('unknown'), []);
  assert.deepEqual(createState(now).entitlements, []);
});

test('corrupt local saves sanitize new fields and prototype durability entries', () => {
  const raw = JSON.stringify({ version: 1, collected: ['good'], favorites: ['good', 'bad', 'good'], entitlements: ['valentines-day', 'unknown'], history: [null], settings: { sound: 'true', guideSeen: true }, shareRewards: { date: localDay(now), used: -3, credits: -4 } });
  const state = loadState({ getItem: (key) => key === STORAGE_KEY ? raw : null }, now);
  assert.deepEqual(state.favorites, ['good']);
  assert.deepEqual(state.entitlements, ['valentines-day']);
  assert.equal(state.shareRewards.used, 0);
  assert.equal(state.shareRewards.credits, 0);
  assert.equal(state.settings.sound, false);
  assert.equal(state.settings.guideSeen, true);
});

test('analytics consent starts disabled, migrates disabled, and restores only an explicit boolean choice', () => {
  assert.equal(createState(now).settings.analyticsConsent, false);
  const legacy = loadState(storageWith({ version: 1, settings: { sound: true } }), now);
  assert.equal(legacy.settings.analyticsConsent, false);
  const wrongType = loadState(storageWith({ version: 1, settings: { analyticsConsent: 'true' } }), now);
  assert.equal(wrongType.settings.analyticsConsent, false);
  const state = createState(now);
  state.settings.analyticsConsent = true;
  assert.equal(loadState(storageWith(state), now).settings.analyticsConsent, true);
  assert.equal(importState(exportState(state), now).state.settings.analyticsConsent, true);
  state.settings.analyticsConsent = 'true';
  assert.equal(importState(JSON.stringify(state), now).ok, false);
});

test('failed fusion records a single readable fragment event without granting a tool or achievement', async () => {
  const { createState, fuseGadgets, recordFusion, GADGETS } = await import('../src/lib/game.js');
  const state = createState();
  const result = fuseGadgets(GADGETS[0], GADGETS[1], () => 0);
  recordFusion(state, result);
  recordFusion(state, result);
  assert.equal(state.collected.length, 0);
  assert.equal(state.stats.fusions, 0);
  assert.equal(state.eventRecords.filter(record => record.id === 'fusion-fragments').length, 1);
});
