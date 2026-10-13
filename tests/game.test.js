import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GADGETS, STORAGE_KEY, REPAIR_MS, createState, ensureDaily, localDay, loadState, saveState,
  consumeUsage, strengthTier, outcomeWeights, generateOutcome, matchGadget,
  getDurability, useGadget, repairGadget, collectGadget, recordOutcome, getAchievements,
  fuseGadgets, recordFusion,
} from '../src/lib/game.js';

const at = new Date(2026, 9, 13, 10).getTime();
const nextDay = new Date(2026, 9, 14, 10).getTime();
const rolls = (...values) => {
  let index = 0;
  return () => values[index++] ?? 0.9;
};
const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('catalog has unique original items, complete fortunes and relevant matching', () => {
  assert.equal(new Set(GADGETS.map((gadget) => gadget.id)).size, GADGETS.length);
  assert.ok(GADGETS.length >= 12);
  for (const gadget of GADGETS) {
    assert.equal(gadget.stories.length, 4);
    assert.ok(gadget.fortune.good && gadget.fortune.bad && gadget.fortune.tip);
    assert.ok(gadget.maxDurability >= 2);
    assert.ok(gadget.warning && gadget.effect && gadget.visual.kind);
  }
  assert.equal(matchGadget('明天要汇报，很紧张', [], () => 0).id, 'courage-badge');
  assert.equal(matchGadget('最近失眠睡不着', [], () => 0).id, 'dream-radio');
  assert.equal(matchGadget('减肥管不住嘴', [], () => 0).id, 'snack-bottle');
});

test('tier cutoffs and right-hand weights normalize the PRD total of 110%', () => {
  assert.equal(strengthTier(0), 'safe');
  assert.equal(strengthTier(33), 'safe');
  assert.equal(strengthTier(34), 'regular');
  assert.equal(strengthTier(66), 'regular');
  assert.equal(strengthTier(67), 'wild');
  assert.equal(strengthTier(100), 'wild');
  assert.deepEqual(outcomeWeights(0), { normal: 0.7, oops: 0.25, chaos: 0, surprise: 0.05 });
  assert.deepEqual(outcomeWeights(50), { normal: 0.4, oops: 0.4, chaos: 0.15, surprise: 0.05 });
  const wild = outcomeWeights(100);
  assert.equal(wild.normal, 10 / 110);
  assert.equal(wild.chaos, 70 / 110);
  assert.ok(Math.abs(Object.values(wild).reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

test('outcome distribution honors weighted boundaries including zero-probability chaos', () => {
  const item = GADGETS[0];
  const choose = (strength, roll) => generateOutcome(item, '汇报', strength, rolls(roll, 0.9, 0.9)).kind;
  assert.equal(choose(0, 0), 'normal');
  assert.equal(choose(0, 0.69999), 'normal');
  assert.equal(choose(0, 0.7), 'oops');
  assert.equal(choose(0, 0.94999), 'oops');
  assert.equal(choose(0, 0.95), 'surprise');
  assert.equal(choose(0, 0.9999), 'surprise');
  assert.equal(choose(50, 0.4), 'oops');
  assert.equal(choose(50, 0.8), 'chaos');
  assert.equal(choose(50, 0.951), 'surprise');
  assert.equal(choose(100, 10 / 110), 'oops');
  assert.equal(choose(100, 31 / 110), 'chaos');
  assert.equal(choose(100, 101 / 110), 'surprise');
});

test('random events and chains affect story only below their 30% and 20% thresholds', () => {
  const withEvent = generateOutcome(GADGETS[0], '紧张', 0, rolls(0.1, 0.2999, 0.3, 0.1999));
  assert.equal(withEvent.event.id, 'screw');
  assert.match(withEvent.text, /原来的一半/);
  assert.ok(withEvent.chain.worry);
  const withoutEvent = generateOutcome(GADGETS[0], '紧张', 0, rolls(0.1, 0.3, 0.2));
  assert.equal(withoutEvent.event, null);
  assert.equal(withoutEvent.chain, null);
});

test('daily quotas reset by local date without clearing discoveries or damage', () => {
  const state = createState(at);
  collectGadget(state, GADGETS[0]);
  useGadget(state, GADGETS[0], 0, at);
  assert.equal(consumeUsage(state, 'help', at).remaining, 2);
  assert.equal(consumeUsage(state, 'help', at).remaining, 1);
  assert.equal(consumeUsage(state, 'help', at).remaining, 0);
  assert.equal(consumeUsage(state, 'help', at).ok, false);
  assert.equal(consumeUsage(state, 'blind', at).ok, true);
  assert.equal(consumeUsage(state, 'blind', at).ok, false);
  assert.equal(consumeUsage(state, 'fusion', at).ok, true);
  assert.equal(consumeUsage(state, 'fusion', at).ok, false);
  ensureDaily(state, nextDay);
  assert.equal(state.usage.date, localDay(nextDay));
  assert.equal(state.usage.help, 0);
  assert.deepEqual(state.collected, [GADGETS[0].id]);
  assert.equal(getDurability(state, GADGETS[0], nextDay).current, GADGETS[0].maxDurability - 1);
});

test('wild uses cost double and broken tools recover exactly 24h after failure', () => {
  const state = createState(at);
  const rare = GADGETS.find((gadget) => gadget.maxDurability === 2);
  assert.equal(useGadget(state, rare, 100, at).cost, 2);
  assert.equal(getDurability(state, rare, at).broken, true);
  assert.equal(useGadget(state, rare, 0, at + 1).ok, false);
  assert.equal(getDurability(state, rare, at + REPAIR_MS - 1).remainingMs, 1);
  assert.equal(getDurability(state, rare, at + REPAIR_MS).current, 2);
  assert.equal(useGadget(state, rare, 0, at + REPAIR_MS).ok, true);
});

test('one daily free repair restores damage and quota refreshes next local day', () => {
  const state = createState(at);
  const tool = GADGETS[0];
  assert.equal(repairGadget(state, tool, at).ok, false);
  assert.equal(state.repair.used, 0);
  useGadget(state, tool, 100, at);
  assert.equal(repairGadget(state, tool, at).ok, true);
  assert.equal(getDurability(state, tool, at).current, tool.maxDurability);
  useGadget(state, tool, 0, at);
  assert.equal(repairGadget(state, tool, at).ok, false);
  assert.equal(repairGadget(state, tool, nextDay).ok, true);
});

test('persistence handles corrupted or unavailable storage and sanitizes malformed fields', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, 'not-json');
  assert.deepEqual(loadState(storage, at), createState(at));
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, collected: ['one', 'one', 2], usage: { date: localDay(at), help: -3, blind: 'bad' }, durability: { broken: { current: 'bad' }, good: { current: 3, repairAt: 0 } }, settings: { sound: true } }));
  const state = loadState(storage, at);
  assert.deepEqual(state.collected, ['one']);
  assert.equal(state.usage.help, 0);
  assert.equal(state.usage.blind, 0);
  assert.equal(state.settings.sound, true);
  assert.equal(Object.hasOwn(state.durability, 'broken'), false);
  const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
  assert.deepEqual(loadState(blocked, at), createState(at));
  assert.equal(saveState(blocked, state), false);
});

test('valid discoveries, quotas, repair cooldown and settings round-trip through storage', () => {
  const storage = memoryStorage();
  const state = createState(at);
  collectGadget(state, GADGETS[0]);
  consumeUsage(state, 'help', at);
  useGadget(state, GADGETS[0], 100, at);
  state.settings.sound = true;
  state.lastFortune = { gadgetId: GADGETS[0].id, date: localDay(at) };
  state.todayGadgetId = GADGETS[0].id;
  assert.equal(saveState(storage, state), true);
  assert.deepEqual(loadState(storage, at), state);
});

test('outcome history persists full readable stories and events, deduplicating collection entries', () => {
  const state = createState(at);
  const storage = memoryStorage();
  const outcome = generateOutcome(GADGETS[0], '明天要汇报', 100, rolls(0.5, 0.1, 0.3, 0.9));
  recordOutcome(state, outcome);
  recordOutcome(state, outcome);
  assert.equal(state.eventRecords.length, 2);
  assert.deepEqual(state.eventRecords[0], { id: `chaos:${GADGETS[0].id}`, kind: 'chaos', title: outcome.title, text: outcome.text, gadgetName: GADGETS[0].name });
  assert.equal(state.eventRecords[1].id, outcome.event.id);
  assert.equal(state.eventRecords[1].text, outcome.event.text);
  assert.equal(state.eventRecords[1].kind, 'event');
  assert.equal(saveState(storage, state), true);
  assert.deepEqual(loadState(storage, at).eventRecords, state.eventRecords);
});

test('older v1 saves get empty history, malformed records are rejected and duplicate IDs are filtered', () => {
  const storage = memoryStorage();
  const record = { id: 'one', kind: 'oops', title: '小乌龙', text: '道具跑偏了。', gadgetName: '测试道具' };
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1 }));
  assert.deepEqual(loadState(storage, at).eventRecords, []);
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, eventRecords: [null, {}, { ...record, kind: 'unknown' }, { ...record, text: 123 }, { ...record, title: '' }, record, record] }));
  assert.deepEqual(loadState(storage, at).eventRecords, [record]);
});

test('fusion fails only below 10%, preserves originals, and has collectible legendary results', () => {
  const first = GADGETS[0];
  const second = GADGETS[1];
  const original = JSON.stringify([first, second]);
  assert.equal(fuseGadgets(first, first, () => 0).failed, false);
  assert.equal(fuseGadgets(first, second, () => 0.0999).failed, true);
  const fusion = fuseGadgets(first, second, rolls(0.1, 0.5));
  assert.equal(fusion.ok, true);
  assert.equal(fusion.gadget.rarity, '稀有');
  assert.ok(fusion.gadget.effect.includes(first.effect.slice(0, 5)));
  assert.ok(fusion.gadget.effect.includes(second.effect.slice(0, 5)));
  const legendary = fuseGadgets(first, second, rolls(0.2, 0.0799));
  assert.equal(legendary.gadget.rarity, '传说');
  assert.notEqual(legendary.gadget.id, fusion.gadget.id);
  assert.equal(JSON.stringify([first, second]), original);
  const state = createState(at);
  const unlocked = recordFusion(state, legendary);
  assert.ok(state.collected.includes(legendary.gadget.id));
  assert.ok(state.achievements.includes('mastermind'));
  assert.ok(unlocked.some((achievement) => achievement.id === 'mastermind'));
  assert.equal(state.stats.fusions, 1);
});

test('achievement streak resets on other outcomes; event collection deduplicates', () => {
  const state = createState(at);
  const chaos = { kind: 'chaos', gadgetId: GADGETS[0].id, event: { id: 'cat' } };
  for (let count = 0; count < 4; count++) recordOutcome(state, chaos);
  assert.ok(!state.achievements.includes('unlucky'));
  recordOutcome(state, { kind: 'normal', gadgetId: GADGETS[0].id });
  assert.equal(state.stats.chaosStreak, 0);
  for (let count = 0; count < 5; count++) recordOutcome(state, chaos);
  assert.ok(state.achievements.includes('unlucky'));
  assert.deepEqual(state.events, [`chaos:${GADGETS[0].id}`, 'cat']);
  recordOutcome(state, { kind: 'surprise', gadgetId: GADGETS[0].id });
  assert.ok(getAchievements(state).find((achievement) => achievement.id === 'surprise').unlocked);
});
